// Couvre le lot Roublard du chantier "plusieurs sous-classes par classe" (inspiration BG3, cf.
// ClaudeFiles/ANOMALIES_ACTIVES.md > "Gros chantier") : 2 nouvelles sous-classes ajoutées
// (Bretteur/swashbuckler, Assassin/assassin), en plus du Voleur déjà existant. Vérifie l'octroi
// des Capacités liées ET le scénario minimal de chaque mécanique propre — en particulier la
// primitive P4 (critique automatique conditionnel, cf. rollCheck > forceCriticalHit, rolls.js)
// construite ici pour la première fois : Assassinat contre une cible marquée "Surprise".

const createdActorIds = [];
const createdCombatIds = [];
const createdSceneItemIds = [];

const MAIN_HAND = 0;

function sheetRoot() {
  return cy.get(".application.character");
}

function goToTab(tabId) {
  sheetRoot().find(`nav.tabs [data-tab="${tabId}"]`).click();
  sheetRoot().find(`section.tab[data-tab="${tabId}"]`).should("have.class", "active");
}

function equipmentSlotEl(index) {
  return sheetRoot().find(".equipment-slot").eq(index);
}

function withItemId(actorId, itemName, callback) {
  return cy
    .window()
    .then((win) => {
      const item = win.game.actors.get(actorId).items.find((candidate) => candidate.name === itemName);
      expect(item, `Item '${itemName}' introuvable sur l'Actor`).to.exist;
      return item.id;
    })
    .then(callback);
}

// Même pattern que combat-criticals.cy.js (cf. son en-tête) : cible créée par le MJ, token placé
// sur la scène active.
function createTarget(name, ac) {
  let tokenId;
  cy.loginAsGM();
  return cy
    .window()
    .then((win) =>
      win.Actor.create(win.JSON.parse(win.JSON.stringify({ name, type: "npc", system: { attributes: { ac: { value: ac } } } })))
    )
    .then((actor) => {
      createdActorIds.push(actor.id);
      return cy.window().then((win) =>
        win.canvas.scene
          .createEmbeddedDocuments("Token", [win.JSON.parse(win.JSON.stringify({ actorId: actor.id, x: 200, y: 200 }))])
          .then((tokens) => {
            tokenId = tokens[0].id;
            createdSceneItemIds.push(tokenId);
            return tokenId;
          })
      );
    });
}

function targetToken(tokenId) {
  return cy.window().then((win) => win.canvas.tokens.get(tokenId).setTarget(true, { releaseOthers: true }));
}

let knownMessageCount = null;
function resetMessageBaseline() {
  return cy.window().its("game.messages.size").then((size) => {
    knownMessageCount = size;
  });
}
function lastMessageRoll() {
  return cy
    .window()
    .should((win) => {
      expect(win.game.messages.size, "un nouveau message de jet doit être posté").to.be.greaterThan(knownMessageCount);
    })
    .then((win) => {
      knownMessageCount = win.game.messages.size;
      const message = win.game.messages.contents.at(-1);
      return {
        formula: (message.rolls[0]?.formula ?? "").replace(/\s+/g, ""),
        flavor: message.flavor
      };
    });
}

after(() => {
  cy.loginAsGM();
  cy.window().then((win) => {
    const cleanup = [win.Actor.deleteDocuments(createdActorIds)];
    if (createdCombatIds.length) cleanup.push(win.Combat.deleteDocuments(createdCombatIds));
    if (createdSceneItemIds.length) cleanup.push(win.canvas.scene.deleteEmbeddedDocuments("Token", createdSceneItemIds));
    return Promise.all(cleanup);
  });
});

describe("Sous-classes de Roublard — Bretteur / Assassin", () => {
  it("Bretteur — Capacités octroyées, Panache utilisable (T-SUB-ROGUE-001)", () => {
    cy.loginAsPlayer();
    cy.createReadyCharacter({
      name: "Sub Rogue Swashbuckler",
      origin: "ravenmoor",
      classKey: "rogue",
      skills: ["stealth", "acrobatics", "deception", "perception"]
    }).then((actorId) => {
      createdActorIds.push(actorId);

      cy.window().then((win) => {
        const actor = win.game.actors.get(actorId);
        return actor.update(
          win.JSON.parse(win.JSON.stringify({ "system.attributes.level": 9, "system.subclass": "swashbuckler" })),
          { dndCustomWizard: true }
        );
      });

      cy.window().should((win) => {
        const actor = win.game.actors.get(actorId);
        expect(actor.items.find((i) => i.name === "Panache"), "Panache octroyée").to.exist;
        expect(actor.items.find((i) => i.name === "Jeu de jambes"), "Jeu de jambes octroyée").to.exist;
      });

      cy.openActorSheet(actorId);
      goToTab("abilities");

      withItemId(actorId, "Panache", (itemId) => {
        resetMessageBaseline();
        cy.get(`li[data-item-id="${itemId}"] button[data-action="rollFeature"]`).click();
        lastMessageRoll().then((roll) => {
          expect(roll.formula, "Panache lance bien 1d4").to.equal("1d4");
        });

        cy.window().should((win) => {
          const item = win.game.actors.get(actorId).items.get(itemId);
          expect(item.system.uses.value, "charge décomptée").to.equal(0);
        });
      });
    });
  });

  it("Assassin — critique automatique contre une cible Surprise, même avec un jet bas et une CA hors de portée (T-SUB-ROGUE-002)", () => {
    cy.loginAsPlayer();
    cy.createReadyCharacter({
      name: "Sub Rogue Assassin",
      origin: "ravenmoor",
      classKey: "rogue",
      skills: ["stealth", "acrobatics", "deception", "perception"]
    }).then((actorId) => {
      createdActorIds.push(actorId);

      cy.window().then((win) => {
        const actor = win.game.actors.get(actorId);
        return actor.update(
          win.JSON.parse(win.JSON.stringify({ "system.attributes.level": 3, "system.subclass": "assassin" })),
          { dndCustomWizard: true }
        );
      });

      cy.window().should((win) => {
        const actor = win.game.actors.get(actorId);
        expect(actor.items.find((i) => i.name === "Assassinat"), "Assassinat octroyée").to.exist;
      });

      cy.loginAsGM();
      cy.window().then((win) =>
        win.Combat.create(win.JSON.parse(win.JSON.stringify({ scene: win.canvas.scene.id, active: true }))).then((combat) => {
          createdCombatIds.push(combat.id);
          return combat.createEmbeddedDocuments("Combatant", win.JSON.parse(win.JSON.stringify([{ actorId, initiative: 10 }])));
        })
      );

      createTarget("Assassin Target", 999).then((tokenId) => {
        cy.window().then((win) => win.canvas.tokens.get(tokenId).actor.toggleStatusEffect("surprised", { active: true }));

        cy.loginAsPlayer();
        cy.openActorSheet(actorId);
        goToTab("equipment");
        resetMessageBaseline();
        // Volontairement PAS un 20 naturel : la preuve que le critique vient d'Assassinat, pas
        // du dé (même technique que combat-criticals.cy.js > T-CRIT-001, CA extrême inversée).
        cy.forceD20(2);
        targetToken(tokenId);
        equipmentSlotEl(MAIN_HAND).find(".equipment-roll-btn-attack").click();

        cy.window()
          .its("game.i18n")
          .then((i18n) => ({
            hit: i18n.format("DND_CUSTOM.Roll.AttackHit", { target: "Assassin Target", ac: 999 }),
            crit: i18n.localize("DND_CUSTOM.Roll.CriticalHit")
          }))
          .then(({ hit, crit }) => {
            lastMessageRoll().then((roll) => {
              expect(roll.flavor, "touché malgré une CA de 999 et un jet de 2").to.include(hit);
              expect(roll.flavor, "libellé Coup critique affiché malgré un jet de 2").to.include(crit);
            });
          });
      });
    });
  });

  it("Assassin niveau 9 — Infiltration donne l'avantage automatique en Discrétion (T-SUB-ROGUE-003)", () => {
    cy.loginAsPlayer();
    cy.createReadyCharacter({
      name: "Sub Rogue Assassin Lvl9",
      origin: "ravenmoor",
      classKey: "rogue",
      skills: ["stealth", "acrobatics", "deception", "perception"]
    }).then((actorId) => {
      createdActorIds.push(actorId);

      cy.window().then((win) => {
        const actor = win.game.actors.get(actorId);
        return actor.update(
          win.JSON.parse(win.JSON.stringify({ "system.attributes.level": 9, "system.subclass": "assassin" })),
          { dndCustomWizard: true }
        );
      });

      cy.window().should((win) => {
        const actor = win.game.actors.get(actorId);
        expect(actor.items.find((i) => i.name === "Infiltration"), "Infiltration octroyée").to.exist;
      });

      cy.openActorSheet(actorId);
      resetMessageBaseline();
      // Pas de Maj-clic : l'avantage doit venir uniquement d'Infiltration.
      sheetRoot().find('button[data-action="rollSkill"][data-key="stealth"]').click();
      lastMessageRoll().then((roll) => {
        expect(roll.formula, "avantage automatique (2d20kh1) sans Maj-clic").to.match(/^2d20kh1/);
      });
    });
  });
});
