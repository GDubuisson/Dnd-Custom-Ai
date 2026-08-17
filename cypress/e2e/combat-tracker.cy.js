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

  // Retour de test (lot 3, point 5 "Capacités à ressource" — "prévoir l'analyse d'un nombre de
  // tours d'utilisation pour les situations de combat avec combat tracker actif") : la Rage dure
  // SRD 5e jusqu'à 10 rounds, décomptés automatiquement UNIQUEMENT quand un combat est démarré
  // au moment où l'état "En Rage" est activé (cf. hooks createActiveEffect/updateCombat,
  // dnd-custom-ai.js). `combat.update({round: n})` (API, pas 10 clics réels sur "Tour suivant" —
  // déjà couvert par T-COMBAT-002 pour l'interaction DOM elle-même) vérifie que le décompte gère
  // correctement un saut de plusieurs rounds en un seul appel.
  //
  // Supprime tout combat existant avant de créer le sien : à ce stade du fichier, T-COMBAT-
  // 001/002 ont chacun laissé leur propre combat actif (nettoyage groupé dans `after()`
  // seulement) — `game.combat` (le getter "combat actif/visible") pourrait sinon résoudre vers
  // l'UN DE CES AUTRES combats plutôt que celui-ci (piège rencontré au premier run réel : le
  // hook de décompte traitait alors les Combattants d'un mauvais combat, sans erreur visible,
  // juste un compteur qui ne bougeait jamais). `cy.on("uncaught:exception", ...)`, même
  // technique que T-COMBAT-003 ci-dessus : supprimer un combat pendant qu'un autre vient d'être
  // créé/démarré déclenche parfois un rendu Foundry cassé côté CombatTracker ("Cannot use 'in'
  // operator..."/"Combat id [...] does not exist...") — un défaut de rendu du cœur Foundry, sans
  // rapport avec la logique de ce système (le hook de décompte, testé isolément, fonctionne
  // correctement), donc ignoré ici plutôt que de faire échouer le test sur autre chose que les
  // assertions métier ci-dessous.
  it("la Rage se décompte round par round en combat et prend fin automatiquement après 10 rounds (T-COMBAT-004)", () => {
    cy.on("uncaught:exception", () => false);
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

    // Bascule "En Rage" une fois le combat démarré (round >= 1, cf. `game.combat.round`) :
    // amorce le suivi de durée (cf. hook createActiveEffect).
    cy.window().then((win) => win.game.actors.get(actorId).toggleStatusEffect("raging", { active: true }));
    cy.window({ timeout: 10000 }).should((win) => {
      const actor = win.game.actors.get(actorId);
      expect(actor.statuses.has("raging")).to.be.true;
      expect(actor.system.combat.rageRoundsRemaining, "10 rounds SRD au démarrage, combat actif").to.equal(10);
    });

    // Avance de 5 rounds sur 10 : la Rage doit rester active, compteur décrémenté d'autant.
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

    // Avance des 5 rounds restants : la Rage doit se terminer automatiquement, annoncée en chat.
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

  // Même précaution que T-COMBAT-004 ci-dessus (suppression des combats existants +
  // `cy.on("uncaught:exception", ...)` pour le même défaut de rendu Foundry, sans rapport avec
  // ce système) : celui de T-COMBAT-004, démarré et non supprimé avant la fin de ce fichier,
  // doit être écarté pour que `game.combat` résolve sans ambiguïté vers celui créé ici.
  it("activer 'En Rage' avant que le combat soit démarré ne déclenche aucun suivi de durée (T-COMBAT-005)", () => {
    cy.on("uncaught:exception", () => false);
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

    // Combat existant et actif (seul combat du monde à ce stade, cf. suppression ci-dessus) mais
    // PAS démarré ("Démarrer le combat" jamais cliqué, `round` reste à 0) : même condition que
    // "pas de combat du tout" pour le hook createActiveEffect (cf. `if (!game.combat?.round)
    // return;`, dnd-custom-ai.js).
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
