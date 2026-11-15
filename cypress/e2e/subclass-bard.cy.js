// Sous-classes du Barde (Collège des Lames, de la Vaillance) : octroi des Capacités
// et jet de dégâts bonus à charges du Collège des Lames.

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

describe("Sous-classes de Barde — Collège des Lames / Collège de la Vaillance", () => {
  it("Collège des Lames — Manœuvre de lame dansante utilisable, charges décomptées (T-SUB-BARD-001)", () => {
    cy.loginAsPlayer();
    cy.createReadyCharacter({
      name: "Sub Bard Swords",
      origin: "ravenmoor",
      classKey: "bard",
      skills: ["performance", "persuasion", "deception"]
    }).then((actorId) => {
      createdActorIds.push(actorId);

      cy.window().then((win) => {
        const actor = win.game.actors.get(actorId);
        return actor.update(
          win.JSON.parse(win.JSON.stringify({ "system.attributes.level": 3, "system.subclass": "swords" })),
          { dndCustomWizard: true }
        );
      });

      cy.window().should((win) => {
        const actor = win.game.actors.get(actorId);
        expect(actor.items.find((i) => i.name === "Manœuvre de lame dansante"), "Capacité octroyée").to.exist;
      });

      cy.openActorSheet(actorId);
      goToTab("abilities");

      withItemId(actorId, "Manœuvre de lame dansante", (itemId) => {
        cy.window().its("game.messages.size").then((before) => {
          cy.get(`li[data-item-id="${itemId}"] button[data-action="rollFeature"]`).click();

          cy.window({ timeout: 10000 }).should((win) => {
            expect(win.game.messages.size, "jet de dégâts posté").to.be.greaterThan(before);
            expect(win.game.actors.get(actorId).items.get(itemId).system.uses.value, "charge décomptée").to.equal(1);
          });
        });
      });
    });
  });

  it("Collège de la Vaillance — Capacité octroyée (T-SUB-BARD-002)", () => {
    cy.loginAsPlayer();
    cy.createReadyCharacter({
      name: "Sub Bard Valour",
      origin: "ravenmoor",
      classKey: "bard",
      skills: ["performance", "persuasion", "deception"]
    }).then((actorId) => {
      createdActorIds.push(actorId);

      cy.window().then((win) => {
        const actor = win.game.actors.get(actorId);
        return actor.update(
          win.JSON.parse(win.JSON.stringify({ "system.attributes.level": 3, "system.subclass": "valour" })),
          { dndCustomWizard: true }
        );
      });

      cy.window().should((win) => {
        const actor = win.game.actors.get(actorId);
        expect(actor.items.find((i) => i.name === "Inspiration vaillante"), "Capacité octroyée").to.exist;
      });
    });
  });
});
