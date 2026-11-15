// Les options de Canalisation divine d'un Serment partagent la réserve « Canalisation divine (Paladin) » :
// utiliser une option épuise aussi l'autre.

const createdActorIds = [];
const createdSceneItemIds = [];
let casterId;
let targetId;
let targetTokenId;
let optionAId;
let optionBId;

function sheetRoot() {
  return cy.get(".application.character");
}

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

function grantTestItems(win) {
  return win.game.actors.get(casterId).createEmbeddedDocuments("Item", [
    win.JSON.parse(
      JSON.stringify({
        name: "Test Canalisation divine (Paladin)",
        type: "feature",
        system: { uses: { max: 1, value: 1, recharge: "shortRest" } }
      })
    ),
    win.JSON.parse(
      JSON.stringify({
        name: "Test CD Option A",
        type: "feature",
        system: {
          costsResource: "Test Canalisation divine (Paladin)",
          savingThrow: "wis",
          appliesCondition: "frightened"
        }
      })
    ),
    win.JSON.parse(
      JSON.stringify({
        name: "Test CD Option B",
        type: "feature",
        system: {
          costsResource: "Test Canalisation divine (Paladin)",
          savingThrow: "wis",
          appliesCondition: "frightened"
        }
      })
    )
  ]);
}

before(() => {
  cy.loginAsGM();
  cy.createReadyCharacter({
    name: "Channel Divinity Paladin",
    origin: "ashar",
    classKey: "paladin",
    skills: ["religion", "persuasion"]
  }).then((id) => {
    casterId = id;
    createdActorIds.push(id);
  });
  cy.window().then((win) => win.game.actors.get(casterId).sheet.close());

  cy.window()
    .then((win) =>
      win.Actor.create(win.JSON.parse(JSON.stringify({ name: "CD Target", type: "npc", system: { abilities: { wis: { mod: 0 } } } })))
    )
    .then((actor) => {
      targetId = actor.id;
      createdActorIds.push(actor.id);
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

describe("Canalisation divine (Paladin) — 2 options partagent la même réserve", () => {
  beforeEach(() => cy.loginAsGM());

  it("utiliser l'option A épuise la réserve pour l'option B aussi", () => {
    cy.window()
      .then((win) => grantTestItems(win))
      .then(() =>
        cy.window().then((win) => {
          const actor = win.game.actors.get(casterId);
          // Recherche par nom : l'ordre renvoyé n'est pas garanti.
          optionAId = actor.items.find((i) => i.name === "Test CD Option A").id;
          optionBId = actor.items.find((i) => i.name === "Test CD Option B").id;
        })
      );
    cy.window().then((win) => win.canvas.tokens.get(targetTokenId).setTarget(true, { releaseOthers: true }));
    cy.window().then((win) => win.game.actors.get(casterId).sheet.render(true));
    cy.get("input.actor-name", { timeout: 15000 }).should("be.visible");
    sheetRoot().find('nav.tabs [data-tab="abilities"]').click();

    cy.forceD20(10);
    cy.then(() => {
      cy.get(`.application.character li[data-item-id="${optionAId}"] button[data-action="rollFeatureSave"]`).click();
    });

    cy.window().should((win) => {
      const actor = win.game.actors.get(casterId);
      const reservoir = actor.items.find((item) => item.name === "Test Canalisation divine (Paladin)");
      expect(reservoir.system.uses.value, "réserve consommée par l'option A").to.equal(0);
    });

    // Option B : réserve vide, avertissement sans message.
    let messagesBefore;
    captureStableBaseline((n) => (messagesBefore = n));
    cy.then(() =>
      cy.get(`.application.character li[data-item-id="${optionBId}"] button[data-action="rollFeatureSave"]`).click()
    );
    cy.window().should((win) => {
      expect(win.game.messages.size, "option B refusée, réserve partagée déjà épuisée").to.equal(messagesBefore);
    });
  });
});
