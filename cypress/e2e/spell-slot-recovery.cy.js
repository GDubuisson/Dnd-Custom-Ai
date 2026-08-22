// Implémente le point "Récupération arcanique/naturelle : recharge + fenêtre de répartition"
// d'ANOMALIES_ACTIVES.md (lot testeur 2026-08-19), cadré avec l'utilisateur le 2026-08-22 :
// le texte SRD de ces deux Capacités ("une fois par jour, LORS D'UN REPOS COURT") n'était suivi
// par aucun code (bouton de jet manuel cliquable à tout moment, aucune fenêtre de répartition).
//
// Modèle retenu (cf. FeatureData#recoversSpellSlots, item-data.js ; #onRestShort/
// #offerSpellSlotRecoveries, actor-sheet.js) : au clic sur "Repos court", toute Capacité de ce
// type encore chargée calcule son total de niveaux récupérables (rollFormula) et ouvre une
// fenêtre de répartition (chooseSpellSlotRecovery, spell-slot-choice.js) — la charge n'est
// consommée QUE si le joueur confirme une répartition non vide.
//
// Capacité de test créée directement via createEmbeddedDocuments (comme "Test Fireball" dans
// spell-saving-throws.cy.js) plutôt que depuis le compendium Capacités : évite de dépendre de sa
// resynchronisation (piège déjà documenté, importSystemContent n'importe que les entrées
// absentes par nom) et fixe un rollFormula déterministe ("3", sans dé) pour un total prévisible.

const createdActorIds = [];
let actorId;

function sheetRoot() {
  return cy.get(".application.character");
}

function updateActor(win, actor, data, options = {}) {
  return actor.update(win.JSON.parse(JSON.stringify(data)), options);
}

function grantRecoveryFeature(win, id) {
  return win.game.actors.get(id).createEmbeddedDocuments("Item", [
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
  ]);
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
    cy.window()
      .then((win) => grantRecoveryFeature(win, actorId))
      .then((items) => {
        featureId = items[0].id;
      });

    cy.window().then((win) => {
      const actor = win.game.actors.get(actorId);
      // Niveau 3 (magicien, lanceur complet) : table SRD (spell-slots.json) donne 4 emplacements
      // de niveau 1 et 2 de niveau 2 — `slots.<n>.max` est une donnée DÉRIVÉE recalculée depuis
      // cette table à chaque prepareDerivedData (character-data.js), impossible à forcer
      // directement par update ; seul `.value` (charges consommées) est un champ persisté.
      return updateActor(win, actor, { "system.attributes.level": 3 }).then(() =>
        updateActor(win, actor, {
          "system.spells.slots.1.value": 2,
          "system.spells.slots.2.value": 1
        })
      );
    });

    cy.window().then((win) => win.game.actors.get(actorId).sheet.render(true));
    cy.get("input.actor-name", { timeout: 15000 }).should("be.visible");

    sheetRoot().find('button[data-action="restShort"]').click();

    cy.window()
      .its("game.i18n")
      .then((i18n) => i18n.localize("DND_CUSTOM.Spells.RecoveryDialogTitle"))
      .then((title) => {
        cy.get("dialog.application.dialog .window-title", { timeout: 10000 }).should("contain.text", title);
      });

    cy.get('dialog.application.dialog input[name="level1"]').clear().type("2");
    cy.get('dialog.application.dialog input[name="level2"]').clear().type("1");
    cy.get('dialog.application.dialog button[data-action="ok"]').click();
    cy.get("dialog.application.dialog").should("not.exist");

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
    cy.window()
      .then((win) => grantRecoveryFeature(win, actorId))
      .then((items) => {
        featureId = items[0].id;
      });

    cy.window().then((win) => {
      const actor = win.game.actors.get(actorId);
      // Niveau déjà porté à 3 par le test précédent (même Actor partagé) : level1.max = 4
      // (table SRD) — un `.value` en dessous suffit à recréer un déficit sans redépendre de
      // l'ordre d'exécution des tests (redondant mais inoffensif si déjà à 3).
      return updateActor(win, actor, { "system.attributes.level": 3 }).then(() =>
        updateActor(win, actor, { "system.spells.slots.1.value": 2 })
      );
    });

    cy.window().then((win) => win.game.actors.get(actorId).sheet.render(true));
    cy.get("input.actor-name", { timeout: 15000 }).should("be.visible");

    sheetRoot().find('button[data-action="restShort"]').click();
    cy.get("dialog.application.dialog .window-title", { timeout: 10000 }).should("exist");
    cy.get('dialog.application.dialog button[data-action="close"]').click();
    cy.get("dialog.application.dialog").should("not.exist");

    cy.window().should((win) => {
      const actor = win.game.actors.get(actorId);
      expect(actor.system.spells.slots[1].value, "emplacement inchangé").to.equal(2);
      const feature = actor.items.get(featureId);
      expect(feature.system.uses.value, "charge non consommée, réutilisable au prochain repos court").to.equal(1);
    });
  });
});
