// Implémente la section 14 (T-COMBAT-001 à T-COMBAT-003) de tests/E2E_TEST_PLAN.md —
// intégration Combat Tracker.
//
// T-COMBAT-002 (réaction régénérée en début de tour propre) est EXACTEMENT le même scénario que
// T-ABIL-021 (section 6, cf. tests/quench/quench-tests.js > batch dndCustomAi.combatReaction) :
// même hook `updateCombat` (dnd-custom-ai.js), même comportement. Pas dupliqué à l'identique ici
// — testé une seconde fois avec une variante qui apporte une garantie RÉELLEMENT différente :
// avancer le tour via le vrai bouton "Tour suivant" du Combat Tracker (interaction DOM), pas via
// `combat.startCombat()`/l'API Combat appelée directement côté Quench.

const createdActorIds = [];
const createdCombatIds = [];

function sheetRoot() {
  return cy.get(".application.character");
}

function openSheet(actorId) {
  cy.window().then((win) => win.game.actors.get(actorId).sheet.render(true));
  return cy.get("input.actor-name", { timeout: 15000 }).should("be.visible");
}

function updateActor(win, actor, data, options = {}) {
  return actor.update(win.JSON.parse(win.JSON.stringify(data)), options);
}

function openCombatTrackerTab() {
  return cy.window().then((win) => win.document.querySelector('#sidebar-tabs [data-tab="combat"]')?.click());
}

before(() => {
  cy.loginAsGM();
  cy.window()
    .then((win) => win.Actor.create(win.JSON.parse(win.JSON.stringify({ name: "Combat Tracker Fighter", type: "character" }))))
    .then((actor) => {
      createdActorIds.push(actor.id);
      return cy.window().then((win) =>
        updateActor(win, actor, { "system.class": "fighter", "system.origin": "fleuraine" }, { dndCustomWizard: true })
      );
    });
});

after(() => {
  cy.loginAsGM();
  cy.window().then((win) => {
    const cleanup = [];
    if (createdCombatIds.length) cleanup.push(win.Combat.deleteDocuments(createdCombatIds));
    if (createdActorIds.length) cleanup.push(win.Actor.deleteDocuments(createdActorIds));
    return Promise.all(cleanup);
  });
});

describe("Intégration Combat Tracker", () => {
  beforeEach(() => {
    cy.loginAsGM();
  });

  // Retour de test (2026-08-16) : le bouton de jet d'Initiative de la fiche personnage a été
  // retiré (`#onRollInitiative`, actor-sheet.js) — décision explicite pour ne garder qu'un seul
  // point d'entrée (le Combat Tracker natif de Foundry). Ce scénario passe donc par l'ajout
  // natif d'un Combattant (ce que fait le tracker en coulisses quand le MJ clique "Ajouter au
  // combat" sur un token) plutôt que par la fiche.
  it("un Combattant ajouté au combat apparaît dans le tracker (T-COMBAT-001)", () => {
    const actorId = createdActorIds[0];

    cy.window().then((win) => {
      const ensureCombat = win.game.combat
        ? Promise.resolve(win.game.combat)
        : win.Combat.create(win.JSON.parse(win.JSON.stringify({ scene: win.canvas.scene.id, active: true }))).then(
            (combat) => {
              createdCombatIds.push(combat.id);
              return combat;
            }
          );
      return ensureCombat.then((combat) =>
        combat.createEmbeddedDocuments("Combatant", win.JSON.parse(win.JSON.stringify([{ actorId, initiative: 12 }])))
      );
    });

    cy.window({ timeout: 10000 }).should((win) => {
      const combatant = win.game.combat?.combatants.find((c) => c.actor?.id === actorId);
      expect(combatant, "un Combattant doit exister").to.exist;
    });

    openCombatTrackerTab();
    cy.window().then((win) => {
      const combatant = win.game.combat.combatants.find((c) => c.actor?.id === actorId);
      cy.get(`#combat li.combatant[data-combatant-id="${combatant.id}"]`, { timeout: 10000 }).should("be.visible");
    });
  });

  it("la réaction se régénère en début de tour propre, via le vrai bouton 'Tour suivant' (T-COMBAT-002)", () => {
    const actorId = createdActorIds[0];

    cy.window().then((win) => {
      const actor = win.game.actors.get(actorId);
      return updateActor(win, actor, { "system.combat.reactionAvailable": false });
    });

    cy.window().then((win) => {
      // Combat dédié (pas celui, possiblement déjà entamé, de T-COMBAT-001) : un seul
      // Combattant, pour que "Tour suivant" retombe systématiquement sur son tour.
      return win.Combat.create(win.JSON.parse(win.JSON.stringify({ scene: win.canvas.scene.id, active: true }))).then(
        (combat) => {
          createdCombatIds.push(combat.id);
          return combat
            .createEmbeddedDocuments("Combatant", win.JSON.parse(win.JSON.stringify([{ actorId, initiative: 10 }])))
            .then(() => combat);
        }
      );
    });

    openCombatTrackerTab();
    cy.window().then((win) => win.game.combat.startCombat());

    cy.window({ timeout: 10000 }).should((win) => {
      expect(win.game.actors.get(actorId).system.combat.reactionAvailable, "réaction régénérée au début du combat/tour").to.be.true;
    });

    // Reconsomme la réaction, puis avance le tour via le VRAI bouton du Combat Tracker (pas
    // l'API) : seul Combattant du combat, donc "Tour suivant" boucle sur son propre tour.
    cy.window().then((win) => updateActor(win, win.game.actors.get(actorId), { "system.combat.reactionAvailable": false }));
    cy.get('#combat button[data-action="nextTurn"]', { timeout: 10000 }).click();

    cy.window({ timeout: 10000 }).should((win) => {
      expect(win.game.actors.get(actorId).system.combat.reactionAvailable, "réaction régénérée après 'Tour suivant'").to.be.true;
    });
  });

  it("supprimer le combat en cours ne casse rien, la fiche reste utilisable (T-COMBAT-003)", () => {
    const actorId = createdActorIds[0];
    let combatId;

    cy.window()
      .then((win) => win.Combat.create(win.JSON.parse(win.JSON.stringify({ scene: win.canvas.scene.id, active: true }))))
      .then((combat) => {
        combatId = combat.id;
        return cy.window().then((win) =>
          combat.createEmbeddedDocuments("Combatant", win.JSON.parse(win.JSON.stringify([{ actorId, initiative: 5 }])))
        );
      });

    let jsErrorFired = false;
    cy.on("uncaught:exception", () => {
      jsErrorFired = true;
      return false;
    });

    cy.window().then((win) => win.Combat.deleteDocuments([combatId]));

    openSheet(actorId);
    // La fiche reste utilisable : une action normale (édition directe des PV, MJ) doit encore
    // aboutir après la suppression du combat.
    cy.window().then((win) => {
      const actor = win.game.actors.get(actorId);
      return updateActor(win, actor, { "system.attributes.hp.value": actor.system.attributes.hp.max });
    });
    cy.window().should((win) => {
      expect(jsErrorFired, "aucune erreur JS ne doit avoir été levée par la suppression du combat").to.be.false;
    });
  });
});
