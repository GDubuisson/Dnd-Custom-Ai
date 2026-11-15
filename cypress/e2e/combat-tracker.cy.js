// T-COMBAT-001 à 005 : intégration au Combat Tracker ; T-COMBAT-002 avance le tour via le vrai bouton.

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

let barbareId; // Durée de Rage suivie automatiquement round par round (T-COMBAT-004/005)

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

  cy.window()
    .then((win) => win.Actor.create(win.JSON.parse(win.JSON.stringify({ name: "Combat Tracker Barbarian", type: "character" }))))
    .then((actor) => {
      createdActorIds.push(actor.id);
      barbareId = actor.id;
      return cy.window().then((win) =>
        updateActor(win, actor, { "system.class": "barbarian", "system.origin": "altenmark" }, { dndCustomWizard: true })
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

// Erreur intermittente du cœur Foundry lors de la suppression de plusieurs combats ;
// toute autre erreur fait échouer le test.
const ignoreDeletedCombatError = (err) => !err.message.includes("does not exist in the CombatEncounters collection");

describe("Intégration Combat Tracker", () => {
  beforeEach(() => {
    cy.loginAsGM();
  });

  // Combattant ajouté via l'API native (pas de bouton d'initiative sur la fiche).
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

  it("la réaction, l'Action et l'Action bonus se régénèrent en début de tour propre, via le vrai bouton 'Tour suivant' (T-COMBAT-002)", () => {
    const actorId = createdActorIds[0];

    cy.window().then((win) => {
      const actor = win.game.actors.get(actorId);
      return updateActor(win, actor, {
        "system.combat.reactionAvailable": false,
        "system.combat.actionAvailable": false,
        "system.combat.bonusActionAvailable": false
      });
    });

    cy.window().then((win) => {
      // Combat dédié à un seul Combattant : « Tour suivant » revient sur lui.
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
      const system = win.game.actors.get(actorId).system;
      expect(system.combat.reactionAvailable, "réaction régénérée au début du combat/tour").to.be.true;
      expect(system.combat.actionAvailable, "Action régénérée au début du combat/tour").to.be.true;
      expect(system.combat.bonusActionAvailable, "Action bonus régénérée au début du combat/tour").to.be.true;
    });

    // Consomme les trois ressources puis clique « Tour suivant ».
    cy.window().then((win) =>
      updateActor(win, win.game.actors.get(actorId), {
        "system.combat.reactionAvailable": false,
        "system.combat.actionAvailable": false,
        "system.combat.bonusActionAvailable": false
      })
    );
    cy.get('#combat button[data-action="nextTurn"]', { timeout: 10000 }).click();

    cy.window({ timeout: 10000 }).should((win) => {
      const system = win.game.actors.get(actorId).system;
      expect(system.combat.reactionAvailable, "réaction régénérée après 'Tour suivant'").to.be.true;
      expect(system.combat.actionAvailable, "Action régénérée après 'Tour suivant'").to.be.true;
      expect(system.combat.bonusActionAvailable, "Action bonus régénérée après 'Tour suivant'").to.be.true;
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
    // La fiche reste utilisable après suppression du combat.
    cy.window().then((win) => {
      const actor = win.game.actors.get(actorId);
      return updateActor(win, actor, { "system.attributes.hp.value": actor.system.attributes.hp.max });
    });
    cy.window().should(() => {
      expect(jsErrorFired, "aucune erreur JS ne doit avoir été levée par la suppression du combat").to.be.false;
    });
  });

  // Rage décomptée sur 10 rounds en combat démarré (saut de rounds via `combat.update`).
  // Combats existants supprimés au préalable (cf. ignoreDeletedCombatError).
  it("la Rage se décompte round par round en combat et prend fin automatiquement après 10 rounds (T-COMBAT-004)", () => {
    cy.on("uncaught:exception", ignoreDeletedCombatError);
    const actorId = barbareId;

    cy.window().then((win) => {
      const staleIds = win.game.combats.contents.map((c) => c.id);
      for (const id of staleIds) {
        const index = createdCombatIds.indexOf(id);
        if (index !== -1) createdCombatIds.splice(index, 1);
      }
      return staleIds.length ? win.Combat.deleteDocuments(staleIds) : null;
    });

    cy.window().then((win) =>
      win.Combat.create(win.JSON.parse(win.JSON.stringify({ scene: win.canvas.scene.id, active: true }))).then((combat) => {
        createdCombatIds.push(combat.id);
        cy.wrap(combat).as("rageCombat");
        return combat.createEmbeddedDocuments("Combatant", win.JSON.parse(win.JSON.stringify([{ actorId, initiative: 8 }])));
      })
    );

    cy.get("@rageCombat").then((combat) => combat.startCombat());

    // Rage activée en combat démarré : amorce le décompte.
    cy.window().then((win) => win.game.actors.get(actorId).toggleStatusEffect("raging", { active: true }));
    cy.window({ timeout: 10000 }).should((win) => {
      const actor = win.game.actors.get(actorId);
      expect(actor.statuses.has("raging")).to.be.true;
      expect(actor.system.combat.rageRoundsRemaining, "10 rounds SRD au démarrage, combat actif").to.equal(10);
    });

    // +5 rounds : Rage toujours active.
    cy.get("@rageCombat").then((combat) =>
      cy.window().then((win) => combat.update(win.JSON.parse(win.JSON.stringify({ round: combat.round + 5 }))))
    );
    cy.window({ timeout: 10000 }).should((win) => {
      const actor = win.game.actors.get(actorId);
      expect(actor.statuses.has("raging"), "Rage encore active à mi-durée").to.be.true;
      expect(actor.system.combat.rageRoundsRemaining).to.equal(5);
    });

    let messageCountBefore;
    cy.window()
      .its("game.messages.size")
      .then((size) => {
        messageCountBefore = size;
      });

    // +5 rounds : fin automatique annoncée en chat.
    cy.get("@rageCombat").then((combat) =>
      cy.window().then((win) => combat.update(win.JSON.parse(win.JSON.stringify({ round: combat.round + 5 }))))
    );
    cy.window({ timeout: 10000 }).should((win) => {
      const actor = win.game.actors.get(actorId);
      expect(actor.statuses.has("raging"), "Rage terminée automatiquement, durée écoulée").to.be.false;
      expect(actor.system.combat.rageRoundsRemaining, "compteur remis à zéro").to.equal(0);
      expect(win.game.messages.size, "message de fin de Rage posté").to.be.greaterThan(messageCountBefore);
    });
    cy.window()
      .its("game.i18n")
      .then((i18n) => i18n.format("DND_CUSTOM.Chat.RageEnded", { name: "Combat Tracker Barbarian" }))
      .then((expectedContent) => {
        cy.window().should((win) => {
          expect(win.game.messages.contents.at(-1).content).to.equal(expectedContent);
        });
      });
  });

  // Mêmes précautions que T-COMBAT-004.
  it("activer 'En Rage' avant que le combat soit démarré ne déclenche aucun suivi de durée (T-COMBAT-005)", () => {
    cy.on("uncaught:exception", ignoreDeletedCombatError);
    const actorId = barbareId;

    cy.window().then((win) => {
      const staleIds = win.game.combats.contents.map((c) => c.id);
      for (const id of staleIds) {
        const index = createdCombatIds.indexOf(id);
        if (index !== -1) createdCombatIds.splice(index, 1);
      }
      return staleIds.length ? win.Combat.deleteDocuments(staleIds) : null;
    });

    cy.window().then((win) =>
      win.Combat.create(win.JSON.parse(win.JSON.stringify({ scene: win.canvas.scene.id, active: true }))).then((combat) => {
        createdCombatIds.push(combat.id);
        return combat.createEmbeddedDocuments("Combatant", win.JSON.parse(win.JSON.stringify([{ actorId, initiative: 3 }])));
      })
    );

    // Combat non démarré (round 0) : aucun décompte.
    cy.window().then((win) => {
      expect(win.game.combat?.round, "prérequis : combat existant mais pas démarré").to.equal(0);
      return win.game.actors.get(actorId).toggleStatusEffect("raging", { active: true });
    });
    cy.window({ timeout: 10000 }).should((win) => {
      const actor = win.game.actors.get(actorId);
      expect(actor.statuses.has("raging")).to.be.true;
      expect(actor.system.combat.rageRoundsRemaining, "pas de suivi tant que le combat n'est pas démarré").to.equal(0);
    });

    cy.window().then((win) => win.game.actors.get(actorId).toggleStatusEffect("raging", { active: false }));
  });
});
