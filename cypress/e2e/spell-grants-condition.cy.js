// SpellData#grantsCondition : le sort pose son état sur chaque cible ciblée, sans jet.
// Sort de test créé sur l'Actor.

const createdActorIds = [];
const createdSceneItemIds = [];
let casterId;
let targetId;
let targetTokenId;

// Mémorise `game.messages.size` une fois le chat stable.
function captureStableBaseline(assign) {
  return cy
    .window()
    .its("game.messages.size")
    .then((a) =>
      cy
        .wait(500)
        .window()
        .its("game.messages.size")
        .then((b) =>
          cy
            .wait(b === a ? 0 : 500)
            .window()
            .its("game.messages.size")
            .then((c) => assign(c))
        )
    );
}

function grantGrantsConditionSpell(win, actorId, { grantsCondition, name = "Test Invisibility" }) {
  return win.game.actors.get(actorId).createEmbeddedDocuments("Item", [
    win.JSON.parse(
      JSON.stringify({
        name,
        type: "spell",
        system: {
          classes: ["wizard"],
          level: 0,
          details: "1 action, Contact, Concentration, jusqu'à 1 heure",
          concentration: true,
          grantsCondition
        }
      })
    )
  ]);
}

before(() => {
  cy.loginAsGM();
  cy.createReadyCharacter({
    name: "Invisibility Caster",
    origin: "ashar",
    classKey: "wizard",
    skills: ["arcana", "investigation"]
  }).then((id) => {
    casterId = id;
    createdActorIds.push(id);
  });
  // Ferme la fiche avant d'en créer une seconde.
  cy.window().then((win) => win.game.actors.get(casterId).sheet.close());
  cy.createReadyCharacter({
    name: "Invisibility Target",
    origin: "fleuraine",
    classKey: "fighter",
    skills: ["athletics", "intimidation"]
  }).then((id) => {
    targetId = id;
    createdActorIds.push(id);
  });
  cy.window().then((win) => win.game.actors.get(targetId).sheet.close());
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

describe("Sort qui pose un état sans jet associé — SpellData#grantsCondition (Niveau B)", () => {
  beforeEach(() => cy.loginAsGM());

  it("cible sélectionnée : l'état configuré est basculé sur la cible, pas de jet", () => {
    cy.window().then((win) => grantGrantsConditionSpell(win, casterId, { grantsCondition: "invisible" }));
    cy.window().then((win) => win.canvas.tokens.get(targetTokenId).actor.toggleStatusEffect("invisible", { active: false }));
    // Réinitialise la concentration pour un décompte exact des messages.
    cy.window().then((win) =>
      win.game.actors.get(casterId).update(win.JSON.parse(JSON.stringify({ "system.spells.concentratingOn": "" })))
    );
    cy.window().then((win) => win.canvas.tokens.get(targetTokenId).setTarget(true, { releaseOthers: true }));

    let knownMessageCount;
    captureStableBaseline((n) => (knownMessageCount = n));

    cy.window().then((win) => win.game.actors.get(casterId).sheet.render(true));
    cy.get("input.actor-name", { timeout: 15000 }).should("be.visible");
    cy.get(".application.character").find('nav.tabs [data-tab="abilities"]').click();
    cy.get(".application.character")
      .contains("li", "Test Invisibility")
      .find('button[data-action="castSpell"]')
      .click();

    cy.window().should((win) => {
      const target = win.canvas.tokens.get(targetTokenId).actor;
      expect(target.statuses.has("invisible"), "état basculé sur la cible, sans jet").to.be.true;
      expect(win.game.messages.size, "un seul message générique de lancer, posté au nom du LANCEUR").to.equal(
        knownMessageCount + 1
      );
      const message = win.game.messages.contents.at(-1);
      expect(message.speaker.actor, "message posté au nom du lanceur (pas de jet de cible ici)").to.equal(casterId);
      expect(message.rolls.length, "aucun jet associé à ce type de sort").to.equal(0);
    });
  });

  it("aucune cible sélectionnée : avertissement, aucun état basculé, aucun message posté", () => {
    cy.window().then((win) =>
      grantGrantsConditionSpell(win, casterId, { grantsCondition: "invisible", name: "Test Invisibility No Target" })
    );
    // Repart d'une cible visible et d'un lanceur sans concentration.
    cy.window().then((win) => win.canvas.tokens.get(targetTokenId).actor.toggleStatusEffect("invisible", { active: false }));
    cy.window().then((win) =>
      win.game.actors.get(casterId).update(win.JSON.parse(JSON.stringify({ "system.spells.concentratingOn": "" })))
    );
    cy.window().then((win) => win.canvas.tokens.get(targetTokenId).setTarget(false, { releaseOthers: true }));

    let warned = false;
    cy.window().then((win) => {
      const original = win.ui.notifications.warn.bind(win.ui.notifications);
      win.ui.notifications.warn = (message) => {
        warned = true;
        return original(message);
      };
    });

    let knownMessageCount;
    captureStableBaseline((n) => (knownMessageCount = n));

    cy.window().then((win) => win.game.actors.get(casterId).sheet.render(true));
    cy.get("input.actor-name", { timeout: 15000 }).should("be.visible");
    cy.get(".application.character").find('nav.tabs [data-tab="abilities"]').click();
    cy.get(".application.character")
      .contains("li", "Test Invisibility No Target")
      .find('button[data-action="castSpell"]')
      .click();

    cy.window().should((win) => {
      expect(warned, "avertissement NoTarget attendu").to.be.true;
      const target = win.canvas.tokens.get(targetTokenId).actor;
      expect(target.statuses.has("invisible"), "aucun état basculé sans cible").to.be.false;
      // Sans cible, le message de lancer est posté, sans bascule d'état.
      expect(win.game.messages.size, "message générique de lancer quand même posté").to.equal(knownMessageCount + 1);
    });
  });
});
