// Couvre le chantier "plusieurs sous-classes par classe" (inspiration BG3, cf.
// ClaudeFiles/ANOMALIES_ACTIVES.md > "Gros chantier") pour le Moine : 2 nouvelles sous-classes
// ajoutées (Voie de l'Ombre/shadow, Voie des Quatre Éléments/fourElements), en plus de la Voie
// de la Main Ouverte déjà existante. Vérifie l'octroi des Capacités liées ET le scénario minimal
// de chaque mécanique propre : réutilisation de la réserve de Ki existante (system.costsResource,
// primitive déjà construite pour Rafale de coups/Défense patiente/Pas du vent).

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

describe("Sous-classes de Moine — Voie de l'Ombre / Voie des Quatre Éléments", () => {
  it("Voie de l'Ombre — Pas dans l'ombre dépense un point de Ki (T-SUB-MONK-001)", () => {
    cy.loginAsPlayer();
    cy.createReadyCharacter({
      name: "Sub Monk Shadow",
      origin: "ravenmoor",
      classKey: "monk",
      skills: ["acrobatics", "stealth"]
    }).then((actorId) => {
      createdActorIds.push(actorId);

      cy.window().then((win) => {
        const actor = win.game.actors.get(actorId);
        return actor.update(
          win.JSON.parse(win.JSON.stringify({ "system.attributes.level": 3, "system.subclass": "shadow" })),
          { dndCustomWizard: true }
        );
      });

      cy.window().should((win) => {
        const actor = win.game.actors.get(actorId);
        expect(actor.items.find((i) => i.name === "Pas dans l'ombre"), "Capacité octroyée").to.exist;
        expect(actor.items.find((i) => i.name === "Ki")?.system.uses.value, "réserve de Ki initiale").to.equal(2);
      });

      cy.openActorSheet(actorId);
      goToTab("abilities");

      withItemId(actorId, "Pas dans l'ombre", (itemId) => {
        cy.window().its("game.messages.size").then((before) => {
          cy.get(`li[data-item-id="${itemId}"] button[data-action="useResourceTechnique"]`).click();

          cy.window({ timeout: 10000 }).should((win) => {
            expect(win.game.messages.size, "message d'utilisation posté").to.be.greaterThan(before);
            const actor = win.game.actors.get(actorId);
            expect(actor.items.find((i) => i.name === "Ki").system.uses.value, "1 point de Ki dépensé").to.equal(1);
          });
        });
      });
    });
  });

  it("Voie des Quatre Éléments — Disciplines élémentaires dépense un point de Ki (T-SUB-MONK-002)", () => {
    cy.loginAsPlayer();
    cy.createReadyCharacter({
      name: "Sub Monk FourElements",
      origin: "ravenmoor",
      classKey: "monk",
      skills: ["acrobatics", "stealth"]
    }).then((actorId) => {
      createdActorIds.push(actorId);

      cy.window().then((win) => {
        const actor = win.game.actors.get(actorId);
        return actor.update(
          win.JSON.parse(win.JSON.stringify({ "system.attributes.level": 3, "system.subclass": "fourElements" })),
          { dndCustomWizard: true }
        );
      });

      cy.window().should((win) => {
        const actor = win.game.actors.get(actorId);
        expect(actor.items.find((i) => i.name === "Disciplines élémentaires"), "Capacité octroyée").to.exist;
      });

      cy.openActorSheet(actorId);
      goToTab("abilities");

      withItemId(actorId, "Disciplines élémentaires", (itemId) => {
        cy.window().its("game.messages.size").then((before) => {
          cy.get(`li[data-item-id="${itemId}"] button[data-action="useResourceTechnique"]`).click();

          cy.window({ timeout: 10000 }).should((win) => {
            expect(win.game.messages.size, "message d'utilisation posté").to.be.greaterThan(before);
            const actor = win.game.actors.get(actorId);
            expect(actor.items.find((i) => i.name === "Ki").system.uses.value, "1 point de Ki dépensé").to.equal(1);
          });
        });
      });
    });
  });
});
