// Implémente la correction "les 2 options de Canalisation divine d'un Serment de Paladin
// doivent partager la MÊME réserve" (revue de conception du 2026-08-22, ANOMALIES_ACTIVES.md) :
// Voile des anciens (Anciens) et Traque implacable (Vengeance) avaient chacune leur PROPRE
// réserve indépendante au lieu de puiser dans "Canalisation divine (Paladin)" comme Arme sacrée
// (Dévotion) le fait déjà — contraire au SRD (1 seule réserve de Canalisation divine, peu
// importe l'option choisie) et plus généreux qu'attendu.
//
// Modèle retenu : #onRollFeatureSave (actor-sheet.js) accepte maintenant `costsResource` (cf.
// FeatureData#costsResource, item-data.js) exactement comme #onUseResourceTechnique déjà
// existant pour les techniques de Moine consommant du Ki — la charge est décomptée sur la
// Capacité RÉSERVOIR nommée, jamais sur l'option elle-même.
//
// Cette spec vérifie spécifiquement le PARTAGE de réserve entre 2 options différentes (pas le
// mécanisme de jet de sauvegarde lui-même, déjà couvert en détail par turn-undead-feature.cy.js) :
// utiliser une option épuise la réserve pour l'AUTRE option aussi.

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
          // L'ordre du tableau renvoyé par createEmbeddedDocuments (et celui de la collection
          // actor.items) ne correspond pas forcément à l'ordre d'entrée du batch — recherche
          // par nom plutôt que par index, piège rencontré en écrivant ce test.
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

    // Option B : même réserve, déjà vide -> avertissement, aucun nouveau message posté.
    let messagesBefore;
    cy.window()
      .then((win) => (messagesBefore = win.game.messages.size))
      .then(() => {
        cy.get(`.application.character li[data-item-id="${optionBId}"] button[data-action="rollFeatureSave"]`).click();
      });
    cy.window().should((win) => {
      expect(win.game.messages.size, "option B refusée, réserve partagée déjà épuisée").to.equal(messagesBefore);
    });
  });
});
