// Capacités réduisant les dégâts reçus (`reducesDamage`) : bouton « Appliquer la réduction ».
// Capacité de test à formule fixe ("5") et activation « action ».

const createdActorIds = [];
const createdSceneItemIds = [];
let reactorId;
let targetId;
let targetTokenId;
let featureId;

function sheetRoot() {
  return cy.get(".application.character");
}

function updateActor(win, actor, data, options = {}) {
  return actor.update(win.JSON.parse(JSON.stringify(data)), options);
}

before(() => {
  cy.loginAsGM();
  cy.createReadyCharacter({
    name: "Reduction Cleric",
    origin: "ashar",
    classKey: "cleric",
    skills: ["religion", "insight"]
  }).then((id) => {
    reactorId = id;
    createdActorIds.push(id);
  });
  cy.window().then((win) => win.game.actors.get(reactorId).sheet.close());
  cy.createReadyCharacter({
    name: "Reduction Target",
    origin: "fleuraine",
    classKey: "fighter",
    skills: ["athletics", "intimidation"]
  }).then((id) => {
    targetId = id;
    createdActorIds.push(id);
  });
  cy.window()
    .then((win) => win.game.actors.get(targetId).getTokenDocument(win.JSON.parse(win.JSON.stringify({ x: 450, y: 450 }))))
    .then((tokenDoc) =>
      cy.window().then((win) =>
        win.canvas.scene.createEmbeddedDocuments("Token", [win.JSON.parse(win.JSON.stringify(tokenDoc.toObject()))]).then((tokens) => {
          targetTokenId = tokens[0].id;
          createdSceneItemIds.push(targetTokenId);
        })
      )
    );
});

after(() => {
  cy.loginAsGM();
  cy.window().then((win) => {
    const cleanup = [];
    if (createdSceneItemIds.length) cleanup.push(win.canvas.scene.deleteEmbeddedDocuments("Token", createdSceneItemIds));
    if (createdActorIds.length) cleanup.push(win.Actor.deleteDocuments(createdActorIds));
    return Promise.all(cleanup);
  });
});

describe("Réduction de dégâts reçus — jet puis application à la cible ciblée", () => {
  beforeEach(() => cy.loginAsGM());

  it("réduit les PV manquants de la cible, plafonné au max, non ré-applicable deux fois", () => {
    // Lève la pause éventuelle du monde de test.
    cy.window().then((win) => (win.game.paused ? win.game.togglePause(false, { broadcast: true }) : null));

    cy.window()
      .then((win) =>
        win.game.actors.get(reactorId).createEmbeddedDocuments("Item", [
          win.JSON.parse(
            JSON.stringify({
              name: "Test Réduction",
              type: "feature",
              system: { activation: "action", requiresRoll: true, rollFormula: "5", reducesDamage: true }
            })
          )
        ])
      )
      .then((items) => {
        featureId = items[0].id;
      });

    cy.window().then((win) => {
      const target = win.game.actors.get(targetId);
      return updateActor(win, target, { "system.attributes.hp.value": 5, "system.attributes.hp.max": 10 });
    });
    cy.window().then((win) => win.canvas.tokens.get(targetTokenId).setTarget(true, { releaseOthers: true }));

    cy.window().then((win) => win.game.actors.get(reactorId).sheet.render(true));
    cy.get("input.actor-name", { timeout: 15000 }).should("be.visible");
    sheetRoot().find('nav.tabs [data-tab="abilities"]').click();
    sheetRoot().contains("li", "Test Réduction").find('button[data-action="rollFeature"]').click();
    // Ferme la fiche, qui recouvre le chat.
    cy.window().then((win) => win.game.actors.get(reactorId).sheet.close());

    cy.window()
      .its("game.i18n")
      .then((i18n) => i18n.format("DND_CUSTOM.Chat.ApplyDamageReduction", { amount: 5 }))
      .then((buttonLabel) => {
        cy.get(".chat-message .dnd-apply-heal-btn", { timeout: 10000 }).last().should("contain.text", buttonLabel);
      });

    // `force` : un voile de chargement du canvas peut recouvrir la sidebar.
    cy.get(".chat-message .dnd-apply-heal-btn").last().click({ force: true }); // NOSONAR : voile de chargement (cf. ci-dessus)

    cy.window().should((win) => {
      const target = win.game.actors.get(targetId);
      expect(target.system.attributes.hp.value, "5 PV manquants + réduction de 5 -> plafonné au max (10)").to.equal(10);
    });

    cy.get(".chat-message .dnd-apply-heal-btn").last().should("be.disabled");
  });
});
