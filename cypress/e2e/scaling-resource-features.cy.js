// Réserves à progression (Ki, Sorcellerie innée) : `uses.max` égal au niveau, `uses.value` préservé.
// Capacité de test créée directement sur l'Actor.

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

    // Le max fourni à la création est remplacé par la valeur dérivée.
    cy.window().should((win) => {
      const feature = win.game.actors.get(actorId).items.get(featureId);
      expect(feature.system.uses.max, "max recalculé au niveau 1 dès la création").to.equal(1);
    });

    // Une charge dépensée avant la montée de niveau.
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

    // La puce de l'onglet Capacités affiche 0/5.
    cy.window().then((win) => win.game.actors.get(actorId).sheet.render(true));
    cy.get("input.actor-name", { timeout: 15000 }).should("be.visible");
    sheetRoot().find('nav.tabs [data-tab="abilities"]').click();
    sheetRoot()
      .contains("li", "Test Ki")
      .find(".feature-uses")
      .should("have.text", "0/5");
  });
});
