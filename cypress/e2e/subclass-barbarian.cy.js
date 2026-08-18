// Couvre le chantier "plusieurs sous-classes par classe" (inspiration BG3, cf.
// ClaudeFiles/ANOMALIES_ACTIVES.md > "Gros chantier") pour le Barbare : 2 nouvelles sous-classes
// ajoutées (Voie du Cœur sauvage/wildheart, Voie de la Magie sauvage/wildMagic), en plus de la
// Voie du Berserker déjà existante. Vérifie l'octroi des Capacités liées ET le scénario minimal
// de chaque mécanique propre (choix d'esprit totem, tirage automatique de Surtenance sauvage).

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

describe("Sous-classes de Barbare — Voie du Cœur sauvage / Voie de la Magie sauvage", () => {
  it("Voie du Cœur sauvage — Capacités octroyées, choix d'esprit totem (T-SUB-BARB-001)", () => {
    cy.loginAsPlayer();
    cy.createReadyCharacter({
      name: "Sub Barb Wildheart",
      origin: "ravenmoor",
      classKey: "barbarian",
      skills: ["athletics", "intimidation"]
    }).then((actorId) => {
      createdActorIds.push(actorId);

      cy.window().then((win) => {
        const actor = win.game.actors.get(actorId);
        return actor.update(
          win.JSON.parse(win.JSON.stringify({ "system.attributes.level": 6, "system.subclass": "wildheart" })),
          { dndCustomWizard: true }
        );
      });

      cy.window().should((win) => {
        const actor = win.game.actors.get(actorId);
        expect(actor.items.find((i) => i.name === "Aspect de la bête"), "Aspect de la bête octroyée").to.exist;
        expect(actor.items.find((i) => i.name === "Instincts du totem"), "Instincts du totem octroyée").to.exist;
        expect(actor.system.combat.totemSpirit, "aucun esprit totem choisi au départ").to.equal("");
      });

      cy.openActorSheet(actorId);
      goToTab("abilities");

      withItemId(actorId, "Aspect de la bête", () => {
        sheetRoot().find('li[data-item-id] button[data-action="chooseFeatureOption"]').click();

        cy.get("dialog.application.dialog", { timeout: 10000 }).should("exist");
        cy.get('dialog.application.dialog input[type="radio"][name="chosenOption"][value="eagle"]').check();
        cy.get('dialog.application.dialog button[data-action="ok"]').click();

        cy.window().should((win) => {
          expect(win.game.actors.get(actorId).system.combat.totemSpirit, "esprit totem persisté").to.equal("eagle");
        });

        // Choix verrouillé : le bouton "Choisir" ne doit plus jamais réapparaître.
        sheetRoot().find('li[data-item-id] button[data-action="chooseFeatureOption"]').should("not.exist");
      });
    });
  });

  it("Voie de la Magie sauvage — Surtenance sauvage tirée automatiquement à chaque Rage (T-SUB-BARB-002)", () => {
    cy.loginAsPlayer();
    cy.createReadyCharacter({
      name: "Sub Barb WildMagic",
      origin: "ravenmoor",
      classKey: "barbarian",
      skills: ["athletics", "intimidation"]
    }).then((actorId) => {
      createdActorIds.push(actorId);

      cy.window().then((win) => {
        const actor = win.game.actors.get(actorId);
        return actor.update(
          win.JSON.parse(win.JSON.stringify({ "system.attributes.level": 3, "system.subclass": "wildMagic" })),
          { dndCustomWizard: true }
        );
      });

      cy.window().should((win) => {
        const actor = win.game.actors.get(actorId);
        expect(actor.items.find((i) => i.name === "Surtenance sauvage"), "Surtenance sauvage octroyée").to.exist;
      });

      // Le hook createActiveEffect (dnd-custom-ai.js) ne traite l'activation de Rage que côté
      // MJ actif (game.users.activeGM), même garde que le décompte de durée existant — bascule
      // donc en session MJ ici, comme les tests "raging" existants (combat-tracker.cy.js).
      cy.loginAsGM();

      cy.window().its("game.messages.size").then((before) => {
        cy.window()
          .then((win) => win.game.actors.get(actorId).toggleStatusEffect("raging", { active: true }))
          .then(() => {
            cy.window({ timeout: 10000 }).should((win) => {
              expect(win.game.actors.get(actorId).statuses.has("raging"), "Rage activée").to.be.true;
              expect(win.game.messages.size, "tirage de Surtenance sauvage posté en chat").to.be.greaterThan(before);
            });
          });
      });

      cy.window().then((win) => win.game.actors.get(actorId).toggleStatusEffect("raging", { active: false }));
    });
  });
});
