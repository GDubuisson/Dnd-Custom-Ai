// Implémente la section 15 (T-PERM-001 à T-PERM-004) de tests/E2E_TEST_PLAN.md — permissions et
// champs verrouillés (hooks preUpdateActor, dnd-custom-ai.js).
//
// Marqués "Quench" dans le plan (sauf T-PERM-004), mais implémentés ici en E2E plutôt que dans
// tests/quench/quench-tests.js : les batches Quench de cette suite tournent tous en session MJ
// (cf. quench.cy.js), or preUpdateActor ne restreint QUE les updates d'un non-MJ
// (`if (game.users.get(userId)?.isGM) return;`) — un test Quench GM ne pourrait jamais exercer
// la branche restrictive elle-même. `cy.loginAsPlayer()` + un appel direct `actor.update(...)`
// depuis la fenêtre du navigateur (pas de clic UI nécessaire, le formulaire de la fiche reste de
// toute façon `disabled` pour ces champs côté Joueur) est le seul moyen de tester la vraie
// restriction still du point de vue du hook.

const createdActorIds = [];
let sharedActorId;

function updateActor(win, actor, data, options = {}) {
  return actor.update(win.JSON.parse(win.JSON.stringify(data)), options);
}

before(() => {
  cy.loginAsPlayer();
  cy.createReadyCharacter({
    name: "Permissions Fighter",
    origin: "fleuraine",
    classKey: "fighter",
    skills: ["athletics", "intimidation"]
  }).then((id) => {
    sharedActorId = id;
    createdActorIds.push(id);
  });
});

after(() => {
  cy.loginAsGM();
  cy.window().then((win) => win.Actor.deleteDocuments(createdActorIds));
});

describe("Permissions — champs verrouillés MJ, session Joueur", () => {
  beforeEach(() => {
    cy.loginAsPlayer();
  });

  it("un Joueur ne peut pas modifier class/origin/caractéristiques sans l'option dndCustomWizard (T-PERM-001)", () => {
    cy.window().then((win) => {
      const actor = win.game.actors.get(sharedActorId);
      const strBefore = actor.system.abilities.str.value;

      return updateActor(win, actor, {
        "system.class": "wizard",
        "system.origin": "ashar",
        "system.abilities.str.value": strBefore + 5
      }).then(() => {
        const updated = win.game.actors.get(sharedActorId);
        expect(updated.system.class, "system.class ne doit pas changer").to.equal("fighter");
        expect(updated.system.origin, "system.origin ne doit pas changer").to.equal("fleuraine");
        expect(updated.system.abilities.str.value, "la caractéristique ne doit pas changer").to.equal(strBefore);
      });
    });
  });

  it("l'exception dndCustomWizard laisse passer le même update (T-PERM-002, non-régression du mécanisme)", () => {
    cy.window().then((win) => {
      const actor = win.game.actors.get(sharedActorId);
      return updateActor(win, actor, { "system.origin": "ashar" }, { dndCustomWizard: true }).then(() => {
        expect(win.game.actors.get(sharedActorId).system.origin, "autorisé via dndCustomWizard").to.equal("ashar");
      });
    });

    // Remet l'Origine d'origine pour ne pas fausser un futur run de cette spec.
    cy.window().then((win) => {
      const actor = win.game.actors.get(sharedActorId);
      return updateActor(win, actor, { "system.origin": "fleuraine" }, { dndCustomWizard: true });
    });
  });

  it("l'exception dndCustomLevelUp ne laisse passer QUE le champ level (T-PERM-003)", () => {
    cy.window().then((win) => {
      const actor = win.game.actors.get(sharedActorId);
      const levelBefore = actor.system.attributes.level;

      return updateActor(
        win,
        actor,
        { "system.attributes.level": levelBefore + 1, "system.class": "wizard" },
        { dndCustomLevelUp: true }
      ).then(() => {
        const updated = win.game.actors.get(sharedActorId);
        expect(updated.system.attributes.level, "level doit être passé").to.equal(levelBefore + 1);
        expect(updated.system.class, "class ne doit PAS être passé, même dans le même update").to.equal("fighter");
      });
    });

    // Remet le niveau d'origine.
    cy.window().then((win) => {
      const actor = win.game.actors.get(sharedActorId);
      return updateActor(win, actor, { "system.attributes.level": 1 }, { dndCustomLevelUp: true });
    });
  });
});

describe("Permissions — accès à la fiche, session Joueur", () => {
  it("un Joueur non propriétaire ne peut pas ouvrir la fiche d'un autre Actor (T-PERM-004)", () => {
    let gmOnlyActorId;
    cy.loginAsGM();
    cy.window()
      .then((win) => win.Actor.create(win.JSON.parse(win.JSON.stringify({ name: "GM Only Actor", type: "character" }))))
      .then((actor) => {
        gmOnlyActorId = actor.id;
        createdActorIds.push(actor.id);
      });

    cy.loginAsPlayer();
    cy.window().then((win) => {
      const actor = win.game.actors.get(gmOnlyActorId);
      expect(actor.testUserPermission(win.game.user, "OBSERVER"), "prérequis : aucun accès pour ce Joueur").to.be.false;

      let warned = false;
      const original = win.ui.notifications.warn.bind(win.ui.notifications);
      win.ui.notifications.warn = (message) => {
        warned = true;
        return original(message);
      };

      actor.sheet.render(true);

      return cy.wait(1000).then(() => {
        expect(warned, "un avertissement de permission refusée doit être affiché").to.be.true;
        expect(
          win.document.querySelector(`[id*="${gmOnlyActorId}"].application`),
          "aucune fiche ne doit s'être ouverte pour cet Actor"
        ).to.not.exist;
      });
    });
  });
});
