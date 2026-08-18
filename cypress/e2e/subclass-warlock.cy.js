// Couvre le chantier "plusieurs sous-classes par classe" (inspiration BG3, cf.
// ClaudeFiles/ANOMALIES_ACTIVES.md > "Gros chantier") pour l'Occultiste : 2 nouvelles
// sous-classes ajoutées (Le Grand Ancien/greatOldOne, L'Archifée/archfey), en plus du Fiélon déjà
// existant. Vérifie l'octroi des Capacités liées ET le scénario minimal de chaque mécanique
// active (charge à usage limité décomptée).

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

describe("Sous-classes d'Occultiste — Le Grand Ancien / L'Archifée", () => {
  it("Le Grand Ancien — Effroi psychique utilisable, charge décomptée (T-SUB-WARLOCK-001)", () => {
    cy.loginAsPlayer();
    cy.createReadyCharacter({
      name: "Sub Warlock GreatOldOne",
      origin: "ravenmoor",
      classKey: "warlock",
      skills: ["arcana", "deception"]
    }).then((actorId) => {
      createdActorIds.push(actorId);

      cy.window().then((win) => {
        const actor = win.game.actors.get(actorId);
        return actor.update(
          win.JSON.parse(win.JSON.stringify({ "system.attributes.level": 1, "system.subclass": "greatOldOne" })),
          { dndCustomWizard: true }
        );
      });

      cy.window().should((win) => {
        const actor = win.game.actors.get(actorId);
        expect(actor.items.find((i) => i.name === "Effroi psychique"), "Capacité octroyée").to.exist;
      });

      cy.openActorSheet(actorId);
      goToTab("abilities");

      withItemId(actorId, "Effroi psychique", (itemId) => {
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

  it("L'Archifée — Pas féerique utilisable, charge décomptée (T-SUB-WARLOCK-002)", () => {
    cy.loginAsPlayer();
    cy.createReadyCharacter({
      name: "Sub Warlock Archfey",
      origin: "ravenmoor",
      classKey: "warlock",
      skills: ["arcana", "deception"]
    }).then((actorId) => {
      createdActorIds.push(actorId);

      cy.window().then((win) => {
        const actor = win.game.actors.get(actorId);
        return actor.update(
          win.JSON.parse(win.JSON.stringify({ "system.attributes.level": 1, "system.subclass": "archfey" })),
          { dndCustomWizard: true }
        );
      });

      cy.window().should((win) => {
        const actor = win.game.actors.get(actorId);
        expect(actor.items.find((i) => i.name === "Pas féerique"), "Capacité octroyée").to.exist;
      });

      cy.openActorSheet(actorId);
      goToTab("abilities");

      withItemId(actorId, "Pas féerique", (itemId) => {
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
