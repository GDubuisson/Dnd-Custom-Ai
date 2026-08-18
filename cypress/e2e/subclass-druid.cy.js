// Couvre le chantier "plusieurs sous-classes par classe" (inspiration BG3, cf.
// ClaudeFiles/ANOMALIES_ACTIVES.md > "Gros chantier") pour le Druide : 2 nouvelles sous-classes
// ajoutées (Cercle de la Lune/moon, Cercle des Spores/spores), en plus du Cercle de la Terre déjà
// existant. Vérifie l'octroi des Capacités liées ET le scénario minimal de chaque mécanique
// propre : bouton grisé/dégrisé selon l'état "En Forme sauvage" (Cercle de la Lune) et jet de
// dégâts à charges limitées (Cercle des Spores).

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

describe("Sous-classes de Druide — Cercle de la Lune / Cercle des Spores", () => {
  it("Cercle de la Lune — Forme sauvage de combat grisée puis dégrisée par l'état 'En Forme sauvage' (T-SUB-DRUID-001)", () => {
    cy.loginAsPlayer();
    cy.createReadyCharacter({
      name: "Sub Druid Moon",
      origin: "ravenmoor",
      classKey: "druid",
      skills: ["nature", "survival"]
    }).then((actorId) => {
      createdActorIds.push(actorId);

      cy.window().then((win) => {
        const actor = win.game.actors.get(actorId);
        return actor.update(
          win.JSON.parse(win.JSON.stringify({ "system.attributes.level": 2, "system.subclass": "moon" })),
          { dndCustomWizard: true }
        );
      });

      cy.window().should((win) => {
        const actor = win.game.actors.get(actorId);
        expect(actor.items.find((i) => i.name === "Forme sauvage de combat"), "Capacité octroyée").to.exist;
      });

      cy.openActorSheet(actorId);
      goToTab("abilities");

      withItemId(actorId, "Forme sauvage de combat", (itemId) => {
        sheetRoot()
          .find(`li[data-item-id="${itemId}"] button[data-action="useConditionalFeature"]`)
          .should("be.disabled");

        cy.window()
          .then((win) => win.game.actors.get(actorId).toggleStatusEffect("wildShape", { active: true }))
          .then(() => {
            sheetRoot().find(`li[data-item-id="${itemId}"] button[data-action="useConditionalFeature"]`).should("not.be.disabled");

            cy.window().its("game.messages.size").then((before) => {
              sheetRoot().find(`li[data-item-id="${itemId}"] button[data-action="useConditionalFeature"]`).click();

              cy.window({ timeout: 10000 }).should((win) => {
                expect(win.game.messages.size, "message posté").to.be.greaterThan(before);
              });
            });
          });
      });
    });
  });

  it("Cercle des Spores — Nuée de Symbiote utilisable, jet de dégâts posté (T-SUB-DRUID-002)", () => {
    cy.loginAsPlayer();
    cy.createReadyCharacter({
      name: "Sub Druid Spores",
      origin: "ravenmoor",
      classKey: "druid",
      skills: ["nature", "survival"]
    }).then((actorId) => {
      createdActorIds.push(actorId);

      cy.window().then((win) => {
        const actor = win.game.actors.get(actorId);
        return actor.update(
          win.JSON.parse(win.JSON.stringify({ "system.attributes.level": 2, "system.subclass": "spores" })),
          { dndCustomWizard: true }
        );
      });

      cy.window().should((win) => {
        const actor = win.game.actors.get(actorId);
        expect(actor.items.find((i) => i.name === "Nuée de Symbiote"), "Capacité octroyée").to.exist;
      });

      cy.openActorSheet(actorId);
      goToTab("abilities");

      withItemId(actorId, "Nuée de Symbiote", (itemId) => {
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
});
