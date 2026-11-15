// Profils d'attaque multiples des PNJ, chacun avec ses boutons ; le critique est mémorisé par index.
// La migration `ensureNpcAttacksArray` n'est pas couverte (ancien schéma non reproductible).

const createdActorIds = [];

function sheetRoot() {
  return cy.get(".application.npc");
}

function createActor(win, data) {
  return win.Actor.create(win.JSON.parse(win.JSON.stringify(data))).then((actor) => {
    createdActorIds.push(actor.id);
    return actor;
  });
}

let knownMessageCount = null;
function resetMessageBaseline() {
  return cy.window().its("game.messages.size").then((size) => {
    knownMessageCount = size;
  });
}
function lastMessage() {
  return cy
    .window()
    .should((win) => {
      expect(win.game.messages.size, "un nouveau message doit être posté").to.be.greaterThan(knownMessageCount);
    })
    .then((win) => {
      knownMessageCount = win.game.messages.size;
      const message = win.game.messages.contents.at(-1);
      return { formula: (message.rolls?.[0]?.formula ?? "").replace(/\s+/g, "") };
    });
}

after(() => {
  cy.loginAsGM();
  cy.window().then((win) => win.Actor.deleteDocuments(createdActorIds));
});

describe("PNJ à plusieurs profils d'attaque (NpcData#attacks)", () => {
  beforeEach(() => cy.loginAsGM());

  it("2 attaques configurées à la création : chacune a son propre bouton, jets indépendants (T-MULTI-001)", () => {
    cy.window()
      .then((win) =>
        createActor(win, {
          name: "Multiattack NPC",
          type: "npc",
          system: {
            attacks: [
              { name: "Morsure", ability: "str", bonus: 3, damage: { dice: "1d6", bonus: 1, type: "piercing" } },
              { name: "Griffe", ability: "dex", bonus: 5, damage: { dice: "1d4", bonus: 2, type: "slashing" } }
            ]
          }
        })
      )
      .then((npc) => {
        cy.window().then((win) => win.game.actors.get(npc.id).sheet.render(true));
        cy.get(".application.npc input.actor-name", { timeout: 15000 }).should("be.visible");

        cy.get('button[data-action="rollAttack"]').should("have.length", 2);
        cy.get('input[name="system.attacks.0.name"]').should("have.value", "Morsure");
        cy.get('input[name="system.attacks.1.name"]').should("have.value", "Griffe");

        resetMessageBaseline();
        cy.get('button[data-action="rollAttack"][data-index="1"]').click();
        cy.window().then((win) => {
          const dexMod = win.game.actors.get(npc.id).system.abilities.dex.mod;
          lastMessage().then((roll) => {
            expect(roll.formula, "jet de l'attaque #1 (Griffe, Dextérité)").to.equal(`1d20${dexMod + 5 >= 0 ? "+" : ""}${dexMod + 5}`);
          });
          win.game.actors.get(npc.id).sheet.close();
        });
      });
  });

  it("PNJ neuf : aucune attaque par défaut ; bouton 'Ajouter une attaque' en pose une première (T-MULTI-002)", () => {
    cy.window()
      .then((win) => createActor(win, { name: "Multiattack Add NPC", type: "npc" }))
      .then((npc) => {
        cy.window().then((win) => win.game.actors.get(npc.id).sheet.render(true));
        cy.get(".application.npc input.actor-name", { timeout: 15000 }).should("be.visible");

        // Aucune attaque par défaut.
        cy.get('button[data-action="rollAttack"]').should("have.length", 0);
        cy.get('button[data-action="addNpcAttack"]').click();

        cy.window().should((win) => {
          expect(win.game.actors.get(npc.id).system.attacks.length, "un 1er profil vierge ajouté").to.equal(1);
        });
        cy.get('button[data-action="rollAttack"]').should("have.length", 1);
        cy.window().then((win) => win.game.actors.get(npc.id).sheet.close());
      });
  });

  it("bouton 'Retirer' : supprime uniquement l'attaque ciblée (T-MULTI-003)", () => {
    cy.window()
      .then((win) =>
        createActor(win, {
          name: "Multiattack Remove NPC",
          type: "npc",
          system: {
            attacks: [
              { name: "Première", ability: "str", bonus: 1 },
              { name: "Seconde", ability: "str", bonus: 2 },
              { name: "Troisième", ability: "str", bonus: 3 }
            ]
          }
        })
      )
      .then((npc) => {
        cy.window().then((win) => win.game.actors.get(npc.id).sheet.render(true));
        cy.get(".application.npc input.actor-name", { timeout: 15000 }).should("be.visible");

        cy.get('button[data-action="removeNpcAttack"][data-index="1"]').click();

        cy.window().should((win) => {
          const attacks = win.game.actors.get(npc.id).system.attacks;
          expect(attacks.length, "une seule attaque retirée").to.equal(2);
          expect(attacks.map((a) => a.name), "'Seconde' retirée, les 2 autres restent, dans l'ordre").to.deep.equal([
            "Première",
            "Troisième"
          ]);
        });
        cy.window().then((win) => win.game.actors.get(npc.id).sheet.close());
      });
  });

  it("coup critique sur l'attaque #0 n'affecte JAMAIS le jet de dégâts de l'attaque #1 (T-MULTI-004)", () => {
    cy.window()
      .then((win) =>
        createActor(win, {
          name: "Multiattack Critical Isolation NPC",
          type: "npc",
          system: {
            attacks: [
              { name: "Morsure", ability: "str", bonus: 3, damage: { dice: "1d6", bonus: 1, type: "piercing" } },
              { name: "Griffe", ability: "str", bonus: 3, damage: { dice: "1d4", bonus: 1, type: "slashing" } }
            ]
          }
        })
      )
      .then((npc) => {
        // Critique posé directement sur l'index 0.
        cy.window().then((win) =>
          win.game.actors.get(npc.id).setFlag("dnd-custom-ai", "pendingAttackCritical", win.JSON.parse(win.JSON.stringify({ 0: true })))
        );
        cy.window().then((win) => win.game.actors.get(npc.id).sheet.render(true));
        cy.get(".application.npc input.actor-name", { timeout: 15000 }).should("be.visible");

        resetMessageBaseline();
        cy.get('button[data-action="rollAttackDamage"][data-index="1"]').click();
        lastMessage().then((roll) => {
          expect(roll.formula, "attaque #1 : PAS de coup critique, dés non doublés (1d4, pas 2d4)").to.match(/^1d4/);
        });

        cy.window().should((win) => {
          expect(
            win.game.actors.get(npc.id).getFlag("dnd-custom-ai", "pendingAttackCritical")?.[0],
            "le flag critique de l'attaque #0 reste intact, jamais consommé par l'attaque #1"
          ).to.be.true;
        });

        resetMessageBaseline();
        cy.get('button[data-action="rollAttackDamage"][data-index="0"]').click();
        lastMessage().then((roll) => {
          expect(roll.formula, "attaque #0 : coup critique, dés doublés (2d6)").to.match(/^2d6/);
        });
        cy.window().then((win) => win.game.actors.get(npc.id).sheet.close());
      });
  });
});
