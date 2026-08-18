// Couvre le chantier "plusieurs sous-classes par classe" (inspiration BG3, cf.
// ClaudeFiles/ANOMALIES_ACTIVES.md > "Gros chantier") pour le Magicien : 2 nouvelles
// sous-classes ajoutées (École de nécromancie/necromancy, École d'illusion/illusion), en plus de
// l'École d'évocation déjà existante. Vérifie l'octroi des Capacités liées ET le scénario minimal
// de chaque mécanique propre : jet de dégâts bonus à charges limitées (nécromancie) et réaction
// à charge limitée (illusion).

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

after(() => {
  cy.loginAsGM();
  cy.window().then((win) => win.Actor.deleteDocuments(createdActorIds));
});

describe("Sous-classes de Magicien — École de nécromancie / École d'illusion", () => {
  it("École de nécromancie — Étreinte glaciale de la tombe utilisable, jet posté (T-SUB-WIZARD-001)", () => {
    cy.loginAsPlayer();
    cy.createReadyCharacter({
      name: "Sub Wizard Necromancy",
      origin: "ravenmoor",
      classKey: "wizard",
      skills: ["arcana", "history"]
    }).then((actorId) => {
      createdActorIds.push(actorId);

      cy.window().then((win) => {
        const actor = win.game.actors.get(actorId);
        return actor.update(
          win.JSON.parse(win.JSON.stringify({ "system.attributes.level": 2, "system.subclass": "necromancy" })),
          { dndCustomWizard: true }
        );
      });

      cy.window().should((win) => {
        const actor = win.game.actors.get(actorId);
        expect(actor.items.find((i) => i.name === "Étreinte glaciale de la tombe"), "Capacité octroyée").to.exist;
      });

      cy.openActorSheet(actorId);
      goToTab("abilities");

      withItemId(actorId, "Étreinte glaciale de la tombe", (itemId) => {
        cy.window().its("game.messages.size").then((before) => {
          cy.get(`li[data-item-id="${itemId}"] button[data-action="rollFeature"]`).click();

          cy.window({ timeout: 10000 }).should((win) => {
            expect(win.game.messages.size, "jet de dégâts posté").to.be.greaterThan(before);
            expect(win.game.actors.get(actorId).items.get(itemId).system.uses.value, "charge décomptée").to.equal(0);
          });
        });
      });
    });
  });

  it("École d'illusion — Double illusoire utilisable, charge décomptée (T-SUB-WIZARD-002)", () => {
    cy.loginAsPlayer();
    cy.createReadyCharacter({
      name: "Sub Wizard Illusion",
      origin: "ravenmoor",
      classKey: "wizard",
      skills: ["arcana", "history"]
    }).then((actorId) => {
      createdActorIds.push(actorId);

      cy.window().then((win) => {
        const actor = win.game.actors.get(actorId);
        return actor.update(
          win.JSON.parse(win.JSON.stringify({ "system.attributes.level": 2, "system.subclass": "illusion" })),
          { dndCustomWizard: true }
        );
      });

      cy.window().should((win) => {
        const actor = win.game.actors.get(actorId);
        expect(actor.items.find((i) => i.name === "Double illusoire"), "Capacité octroyée").to.exist;
      });

      cy.openActorSheet(actorId);
      goToTab("abilities");

      withItemId(actorId, "Double illusoire", (itemId) => {
        cy.window().its("game.messages.size").then((before) => {
          cy.get(`li[data-item-id="${itemId}"] button[data-action="useFeatureCharge"]`).click();

          cy.window({ timeout: 10000 }).should((win) => {
            expect(win.game.messages.size, "message d'utilisation posté").to.be.greaterThan(before);
            expect(win.game.actors.get(actorId).items.get(itemId).system.uses.value, "charge décomptée").to.equal(0);
          });
        });
      });
    });
  });
});
