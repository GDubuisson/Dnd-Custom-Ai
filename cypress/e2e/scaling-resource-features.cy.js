// Implémente "Ki/Sorcellerie innée : réserves fixes, ne progressent pas avec le niveau",
// restriction de conception levée le 2026-08-22 (revue ANOMALIES_ACTIVES.md). SRD 5e : ces deux
// réserves valent le niveau du personnage dans sa classe (Moine/Ensorceleur), jamais un nombre
// fixe. Nouveau FeatureData#scalesWithLevel (item-data.js) + FeatureData#prepareDerivedData :
// recalcule `uses.max` au niveau actuel de l'Actor propriétaire à chaque préparation de données,
// sans jamais toucher `uses.value` (charges restantes, préservées telles quelles au changement
// de niveau — seul un repos les restaure).
//
// Capacité de test créée directement via createEmbeddedDocuments (comme dans les autres specs
// de ce lot) plutôt que de dépendre du compendium Capacités, pour un contrôle déterministe du
// niveau de départ.

const createdActorIds = [];
let actorId;
let featureId;

function sheetRoot() {
  return cy.get(".application.character");
}

before(() => {
  cy.loginAsGM();
  cy.createReadyCharacter({
    name: "Scaling Resource Test",
    origin: "ashar",
    classKey: "monk",
    skills: ["acrobatics", "stealth"]
  }).then((id) => {
    actorId = id;
    createdActorIds.push(id);
  });
});

after(() => {
  cy.loginAsGM();
  cy.window().then((win) => (createdActorIds.length ? win.Actor.deleteDocuments(createdActorIds) : null));
});

describe("Réserve à progression (Ki/Sorcellerie innée) — uses.max suit le niveau, uses.value préservé", () => {
  beforeEach(() => cy.loginAsGM());

  it("recalcule le maximum à chaque niveau sans jamais réinitialiser les charges restantes", () => {
    cy.window()
      .then((win) =>
        win.game.actors.get(actorId).createEmbeddedDocuments("Item", [
          win.JSON.parse(
            JSON.stringify({
              name: "Test Ki",
              type: "feature",
              system: { scalesWithLevel: true, uses: { max: 2, value: 2, recharge: "shortRest" } }
            })
          )
        ])
      )
      .then((items) => {
        featureId = items[0].id;
      });

    // Niveau 1 (création par défaut) : le max fourni à la création (2, arbitraire) est déjà
    // écrasé par la donnée dérivée dès la lecture de l'Item.
    cy.window().should((win) => {
      const feature = win.game.actors.get(actorId).items.get(featureId);
      expect(feature.system.uses.max, "max recalculé au niveau 1 dès la création").to.equal(1);
    });

    // Simule 1 charge dépensée avant de monter de niveau.
    cy.window().then((win) => {
      const feature = win.game.actors.get(actorId).items.get(featureId);
      return feature.update(win.JSON.parse(JSON.stringify({ "system.uses.value": 0 })));
    });

    cy.window().then((win) =>
      win.game.actors.get(actorId).update(win.JSON.parse(JSON.stringify({ "system.attributes.level": 5 })))
    );

    cy.window().should((win) => {
      const feature = win.game.actors.get(actorId).items.get(featureId);
      expect(feature.system.uses.max, "max recalculé au niveau 5").to.equal(5);
      expect(feature.system.uses.value, "charges restantes préservées, pas remises à niveau").to.equal(0);
    });

    // Confirmation côté UI : la puce affichée sur l'onglet Capacités reflète bien 0/5.
    cy.window().then((win) => win.game.actors.get(actorId).sheet.render(true));
    cy.get("input.actor-name", { timeout: 15000 }).should("be.visible");
    sheetRoot().find('nav.tabs [data-tab="abilities"]').click();
    sheetRoot()
      .contains("li", "Test Ki")
      .find(".feature-uses")
      .should("have.text", "0/5");
  });
});
