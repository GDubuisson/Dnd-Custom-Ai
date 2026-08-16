// Implémente la section 10 (T-NPC-001 à T-NPC-005) de tests/E2E_TEST_PLAN.md — fiche PNJ
// (npc-sheet.js, npc-*.hbs). Réutilisée telle quelle pour le type "mount" (cf. commentaire de
// classe DndCustomNpcSheet) : pas testé séparément ici, même fiche/mêmes handlers.
//
// Toutes les interactions de fiche PNJ (jets, bascule d'état, Initiative, XP) sont réservées au
// MJ dans ce système — contrairement à la fiche personnage, un PNJ n'a normalement pas de
// propriétaire Joueur (cf. npc-sheet.hbs > `{{#if isGM}}` pour le bouton XP). Toute la section
// tourne donc en session MJ, sans déroger à la convention "Joueur par défaut" du plan (qui ne
// s'applique qu'aux scénarios où le rôle a un sens).

const createdActorIds = [];
const createdCombatIds = [];
let npcActorId;

function sheetRoot() {
  return cy.get(".application.npc");
}

function openSheet(actorId) {
  cy.window().then((win) => win.game.actors.get(actorId).sheet.render(true));
  return sheetRoot().should("be.visible");
}

before(() => {
  cy.loginAsGM();
  cy.window()
    .then((win) => win.Actor.create(win.JSON.parse(win.JSON.stringify({ name: "Recon Goblin", type: "npc" }))))
    .then((actor) => {
      npcActorId = actor.id;
      createdActorIds.push(actor.id);
    });
});

after(() => {
  cy.loginAsGM();
  cy.window().then((win) => {
    const cleanup = [];
    if (createdCombatIds.length) cleanup.push(win.Combat.deleteDocuments(createdCombatIds));
    if (createdActorIds.length) cleanup.push(win.Actor.deleteDocuments(createdActorIds));
    return Promise.all(cleanup);
  });
});

describe("Fiche PNJ, session MJ", () => {
  beforeEach(() => {
    cy.loginAsGM();
    openSheet(npcActorId);
  });

  it("navigue entre les 3 onglets Statistiques/Capacités/Butin (T-NPC-001)", () => {
    const tabs = ["stats", "abilities", "loot"];
    sheetRoot().find('section.tab[data-tab="stats"]').should("have.class", "active");

    tabs
      .filter((tab) => tab !== "stats")
      .forEach((tab) => {
        sheetRoot().find(`nav.tabs [data-tab="${tab}"]`).click();
        sheetRoot().find(`section.tab[data-tab="${tab}"]`).should("have.class", "active").and("be.visible");
      });
  });

  it("jet de caractéristique poste 1d20 + le modificateur en chat (T-NPC-002)", () => {
    cy.window().then((win) => {
      const actor = win.game.actors.get(npcActorId);
      const mod = actor.system.abilities.str.mod;
      const modLabel = mod >= 0 ? `+${mod}` : `${mod}`;
      const before = win.game.messages.size;

      sheetRoot().find('button[data-action="rollAbility"][data-key="str"]').click();

      cy.window().should((win2) => {
        expect(win2.game.messages.size, "un nouveau message de jet doit être posté").to.be.greaterThan(before);
        const message = win2.game.messages.contents.at(-1);
        expect((message.rolls[0]?.formula ?? "").replace(/\s+/g, "")).to.equal(`1d20${modLabel}`);
      });
    });
  });

  it("bascule d'un état : l'ActiveEffect est créée puis retirée (T-NPC-003)", () => {
    sheetRoot().find('button[data-action="toggleCondition"][data-key="poisoned"]').click();
    cy.window().should((win) => {
      expect(win.game.actors.get(npcActorId).statuses.has("poisoned"), "état actif après le 1er clic").to.be.true;
    });
    sheetRoot().find('button[data-action="toggleCondition"][data-key="poisoned"]').click();
    cy.window().should((win) => {
      expect(win.game.actors.get(npcActorId).statuses.has("poisoned"), "état retiré après le 2e clic").to.be.false;
    });
  });

  it("jet d'Initiative crée/mets à jour un Combattant sur le combat en cours (T-NPC-004)", () => {
    cy.window().then((win) => {
      if (win.game.combat) return null;
      return win.Combat.create(win.JSON.parse(win.JSON.stringify({ scene: win.canvas.scene.id, active: true }))).then(
        (combat) => {
          createdCombatIds.push(combat.id);
        }
      );
    });

    sheetRoot().find('button[data-action="rollInitiative"]').click();

    cy.window({ timeout: 10000 }).should((win) => {
      const combatant = win.game.combat?.combatants.find((c) => c.actor?.id === npcActorId);
      expect(combatant, "un Combattant doit exister pour ce PNJ").to.exist;
      expect(combatant.initiative, "le Combat Tracker doit afficher un résultat").to.be.a("number");
    });
  });

  it("octroie l'XP rapporté aux personnages cochés dans la boîte de dialogue (T-NPC-005)", () => {
    let playerActorId;
    let xpBefore;

    cy.window()
      .then((win) => win.Actor.create(win.JSON.parse(win.JSON.stringify({ name: "PERM XP Recipient", type: "character" }))))
      .then((actor) => {
        playerActorId = actor.id;
        createdActorIds.push(actor.id);
        return cy.window().then((win) => {
          xpBefore = actor.system.xp;
          return actor.update(win.JSON.parse(win.JSON.stringify({ "system.xp": 0 })), { dndCustomWizard: true });
        });
      });

    cy.window().then((win) =>
      win.game.actors.get(npcActorId).update(win.JSON.parse(win.JSON.stringify({ "system.xpReward": 50 })))
    );
    openSheet(npcActorId);

    sheetRoot().find('button[data-action="awardXp"]').click();

    cy.get('dialog.application.dialog input[name="amount"]', { timeout: 10000 }).should("have.value", "50");
    // Assure que le personnage créé pour ce test est bien coché (déjà le cas par défaut, cf.
    // openAwardXpDialog > `checked` posé sur chaque ligne) et confirme.
    cy.window()
      .then((win) => win.document.querySelector(`dialog.application.dialog input[name="actor"][value="${playerActorId}"]`))
      .should("exist");
    cy.get('dialog.application.dialog button[data-action="ok"]').click();

    cy.window().should((win) => {
      const actor = win.game.actors.get(playerActorId);
      expect(actor.system.xp, "l'XP rapporté (50) doit avoir été ajouté").to.equal(50);
    });
  });
});
