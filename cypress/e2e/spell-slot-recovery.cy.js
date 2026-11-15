// Récupération arcanique/naturelle au repos court : fenêtre de répartition, charge consommée seulement
// si une répartition est validée. Capacité de test à formule fixe ("3"), seule récupératrice de l'Actor.

const createdActorIds = [];
let actorId;

function sheetRoot() {
  return cy.get(".application.character");
}

function updateActor(win, actor, data, options = {}) {
  return actor.update(win.JSON.parse(JSON.stringify(data)), options);
}

function grantRecoveryFeature(win, id) {
  const actor = win.game.actors.get(id);
  // Retire les autres Capacités de récupération (une seule fenêtre attendue).
  const existing = actor.items
    .filter((item) => item.type === "feature" && item.system.recoversSpellSlots)
    .map((item) => item.id);
  return actor.deleteEmbeddedDocuments("Item", existing).then(() =>
    actor.createEmbeddedDocuments("Item", [
      win.JSON.parse(
        JSON.stringify({
          name: "Test Récupération",
          type: "feature",
          system: {
            requiresRoll: true,
            rollFormula: "3",
            recoversSpellSlots: true,
            uses: { max: 1, value: 1, recharge: "longRest" }
          }
        })
      )
    ])
  );
}

before(() => {
  cy.loginAsGM();
  cy.createReadyCharacter({
    name: "Recovery Caster",
    origin: "ashar",
    classKey: "wizard",
    skills: ["arcana", "investigation"]
  }).then((id) => {
    actorId = id;
    createdActorIds.push(id);
  });
});

after(() => {
  cy.loginAsGM();
  cy.window().then((win) => (createdActorIds.length ? win.Actor.deleteDocuments(createdActorIds) : null));
});

describe("Récupération arcanique/naturelle — auto au repos court, fenêtre de répartition", () => {
  beforeEach(() => cy.loginAsGM());

  it("distribution confirmée : récupère les paliers choisis, consomme la charge, poste un message", () => {
    let featureId;
    cy.window().then((win) => {
      const actor = win.game.actors.get(actorId);
      // Niveau 3 : 4 emplacements de niveau 1 et 2 de niveau 2 (`max` dérivé).
      return updateActor(win, actor, { "system.attributes.level": 3 }).then(() =>
        updateActor(win, actor, {
          "system.spells.slots.1.value": 2,
          "system.spells.slots.2.value": 1
        })
      );
    });

    // Après la montée de niveau, « Test Récupération » est la seule Capacité de récupération.
    cy.window()
      .then((win) => grantRecoveryFeature(win, actorId))
      .then((items) => {
        featureId = items[0].id;
      });

    cy.window().then((win) => win.game.actors.get(actorId).sheet.render(true));
    cy.get("input.actor-name", { timeout: 15000 }).should("be.visible");

    sheetRoot().find('button[data-action="restShort"]').click();

    cy.window()
      .its("game.i18n")
      .then((i18n) => i18n.localize("DND_CUSTOM.Spells.RecoveryDialogTitle"))
      .then((title) => {
        cy.get("dialog.application.dialog[open] .window-title", { timeout: 10000 }).should("contain.text", title);
      });

    cy.get('dialog.application.dialog[open] input[name="level1"]').clear().type("2");
    cy.get('dialog.application.dialog[open] input[name="level2"]').clear().type("1");
    cy.get('dialog.application.dialog[open] button[data-action="ok"]').click();
    cy.get("dialog.application.dialog[open]").should("not.exist");

    cy.window().should((win) => {
      const actor = win.game.actors.get(actorId);
      expect(actor.system.spells.slots[1].value, "palier 1 comblé (+2)").to.equal(4);
      expect(actor.system.spells.slots[2].value, "palier 2 comblé (+1)").to.equal(2);
      const feature = actor.items.get(featureId);
      expect(feature.system.uses.value, "charge consommée").to.equal(0);
      const message = win.game.messages.contents.at(-1);
      expect(message.content, "message posté au nom du personnage, citant la Capacité").to.include("Test Récupération");
    });
  });

  it("fenêtre annulée : aucune charge consommée, aucun emplacement modifié", () => {
    let featureId;
    cy.window().then((win) => {
      const actor = win.game.actors.get(actorId);
      // Niveau 3 garanti, quel que soit l'ordre des tests.
      return updateActor(win, actor, { "system.attributes.level": 3 }).then(() =>
        updateActor(win, actor, { "system.spells.slots.1.value": 2 })
      );
    });

    cy.window()
      .then((win) => grantRecoveryFeature(win, actorId))
      .then((items) => {
        featureId = items[0].id;
      });

    cy.window().then((win) => win.game.actors.get(actorId).sheet.render(true));
    cy.get("input.actor-name", { timeout: 15000 }).should("be.visible");

    sheetRoot().find('button[data-action="restShort"]').click();
    cy.get("dialog.application.dialog[open] .window-title", { timeout: 10000 }).should("exist");
    cy.get('dialog.application.dialog[open] button[data-action="close"]').click();
    cy.get("dialog.application.dialog[open]").should("not.exist");

    cy.window().should((win) => {
      const actor = win.game.actors.get(actorId);
      expect(actor.system.spells.slots[1].value, "emplacement inchangé").to.equal(2);
      const feature = actor.items.get(featureId);
      expect(feature.system.uses.value, "charge non consommée, réutilisable au prochain repos court").to.equal(1);
    });
  });
});
