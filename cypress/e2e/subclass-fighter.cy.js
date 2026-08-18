// Couvre le lot Guerrier du chantier "plusieurs sous-classes par classe" (inspiration BG3, cf.
// ClaudeFiles/ANOMALIES_ACTIVES.md > "Gros chantier") : 2 nouvelles sous-classes ajoutées
// (Maître de guerre/battleMaster, Chevalier occulte/eldritchKnight), en plus du Champion déjà
// existant. Vérifie l'octroi des Capacités liées ET le scénario minimal de chaque mécanique
// propre — en particulier la primitive P2 (incantation mineure de sous-classe, cf.
// FeatureData#grantsSpells / grantClassContent) construite ici pour la première fois.

const createdActorIds = [];

function sheetRoot() {
  return cy.get(".application.character");
}

function goToTab(tabId) {
  sheetRoot().find(`nav.tabs [data-tab="${tabId}"]`).click();
  sheetRoot().find(`section.tab[data-tab="${tabId}"]`).should("have.class", "active");
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
  cy.window().then((win) => win.Actor.deleteDocuments(createdActorIds));
});

describe("Sous-classes de Guerrier — Maître de guerre / Chevalier occulte", () => {
  it("Maître de guerre — Capacité octroyée, choix de manœuvre à chaque utilisation (T-SUB-FIGHTER-001)", () => {
    cy.loginAsPlayer();
    cy.createReadyCharacter({
      name: "Sub Fighter BattleMaster",
      origin: "ravenmoor",
      classKey: "fighter",
      skills: ["athletics", "intimidation"]
    }).then((actorId) => {
      createdActorIds.push(actorId);

      cy.window().then((win) => {
        const actor = win.game.actors.get(actorId);
        return actor.update(
          win.JSON.parse(win.JSON.stringify({ "system.attributes.level": 3, "system.subclass": "battleMaster" })),
          { dndCustomWizard: true }
        );
      });

      cy.window().should((win) => {
        const actor = win.game.actors.get(actorId);
        expect(actor.items.find((i) => i.name === "Dés de manœuvre"), "Dés de manœuvre octroyée").to.exist;
      });

      cy.openActorSheet(actorId);
      goToTab("abilities");

      withItemId(actorId, "Dés de manœuvre", (itemId) => {
        resetMessageBaseline();
        cy.get(`li[data-item-id="${itemId}"] button[data-action="useManeuver"]`).click();

        cy.get("dialog.application.dialog", { timeout: 10000 }).should("exist");
        cy.get('dialog.application.dialog input[type="radio"][name="maneuver"][value="push"]').check();
        cy.get('dialog.application.dialog button[data-action="ok"]').click();

        cy.window()
          .its("game.i18n")
          .then((i18n) => i18n.localize("DND_CUSTOM.Maneuvers.push"))
          .then((pushLabel) => {
            lastMessageRoll().then((roll) => {
              expect(roll.formula, "Dés de manœuvre lance 1d8").to.equal("1d8");
              expect(roll.flavor, "libellé de la manœuvre choisie affiché").to.include(pushLabel);
            });
          });

        cy.window().should((win) => {
          const item = win.game.actors.get(actorId).items.get(itemId);
          expect(item.system.uses.value, "charge décomptée (3/4 restantes)").to.equal(3);
        });
      });
    });
  });

  it("Chevalier occulte — Capacité octroyée, sorts toujours prêts sans emplacement (T-SUB-FIGHTER-002)", () => {
    cy.loginAsPlayer();
    cy.createReadyCharacter({
      name: "Sub Fighter EldritchKnight",
      origin: "ravenmoor",
      classKey: "fighter",
      skills: ["athletics", "intimidation"]
    }).then((actorId) => {
      createdActorIds.push(actorId);

      cy.window().then((win) => {
        const actor = win.game.actors.get(actorId);
        return actor.update(
          win.JSON.parse(win.JSON.stringify({ "system.attributes.level": 3, "system.subclass": "eldritchKnight" })),
          { dndCustomWizard: true }
        );
      });

      cy.window().should((win) => {
        const actor = win.game.actors.get(actorId);
        expect(actor.items.find((i) => i.name === "Incantation mineure"), "Incantation mineure octroyée").to.exist;
        for (const spellName of ["Bouclier", "Prestidigitation", "Lumière"]) {
          expect(actor.items.find((i) => i.name === spellName), `${spellName} octroyé`).to.exist;
        }
        // Fighter n'est pas dans DND_CUSTOM.spellcastingClasses : le pool de sorts par repos
        // reste à 0/0, la preuve que ces 3 sorts sont bien "toujours prêts" sans emplacement.
        expect(actor.system.spells.uses.max, "pas de pool de sorts classique pour le Guerrier").to.equal(0);
      });

      cy.openActorSheet(actorId);
      goToTab("abilities");

      withItemId(actorId, "Bouclier", (itemId) => {
        resetMessageBaseline();
        cy.get(`li[data-item-id="${itemId}"] button[data-action="castSpell"]`).click();

        cy.window().should((win) => {
          expect(win.game.messages.size, "message de lancer posté malgré un pool à 0").to.be.greaterThan(knownMessageCount);
          // Aucun avertissement "aucun emplacement" n'a dû bloquer le lancer : le sort reste
          // possédé et le pool à 0 n'a pas été impacté (rien à décompter).
          expect(win.game.actors.get(actorId).items.get(itemId), "Bouclier toujours possédé après lancer").to.exist;
        });
      });
    });
  });
});
