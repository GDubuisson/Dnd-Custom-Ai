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

  // Retour de test (bug majeur, sécurité) : un Joueur pouvait s'appliquer lui-même des dégâts
  // en tapant une valeur dans le champ PV de l'en-tête (désormais `disabled` côté Joueur, cf.
  // character-sheet.hbs) — filet de sécurité côté données ici (preUpdateActor, dnd-custom-ai.js),
  // au cas où l'update viendrait d'ailleurs qu'un vrai clic (macro, console).
  it("un Joueur ne peut pas BAISSER ses propres PV via un update direct (T-PERM-005)", () => {
    cy.window().then((win) => {
      const actor = win.game.actors.get(sharedActorId);
      const hpBefore = actor.system.attributes.hp.value;

      return updateActor(win, actor, { "system.attributes.hp.value": Math.max(0, hpBefore - 5) }).then(() => {
        expect(
          win.game.actors.get(sharedActorId).system.attributes.hp.value,
          "aucune baisse de PV directe ne doit passer"
        ).to.equal(hpBefore);
      });
    });
  });

  it("un Joueur peut toujours AUGMENTER ses propres PV — non-régression, ex. soin (T-PERM-006)", () => {
    cy.window().then((win) => {
      const actor = win.game.actors.get(sharedActorId);
      const hpBefore = Math.max(1, actor.system.attributes.hp.value - 1);

      return updateActor(win, actor, { "system.attributes.hp.value": hpBefore }).then(() =>
        updateActor(win, win.game.actors.get(sharedActorId), { "system.attributes.hp.value": hpBefore + 1 }).then(() => {
          expect(
            win.game.actors.get(sharedActorId).system.attributes.hp.value,
            "une hausse de PV directe doit rester autorisée (soin, repos...)"
          ).to.equal(hpBefore + 1);
        })
      );
    });

    // Remet les PV au maximum pour ne pas fausser un futur run de cette spec.
    cy.window().then((win) => {
      const actor = win.game.actors.get(sharedActorId);
      return updateActor(win, actor, { "system.attributes.hp.value": actor.system.attributes.hp.max });
    });
  });

  it("l'exception dndCustomDamageApply laisse passer une baisse de PV — mécanisme du bouton 'Appliquer les dégâts' (T-PERM-007)", () => {
    cy.window().then((win) => {
      const actor = win.game.actors.get(sharedActorId);
      const hpBefore = actor.system.attributes.hp.value;

      return updateActor(win, actor, { "system.attributes.hp.value": hpBefore - 3 }, { dndCustomDamageApply: true }).then(() => {
        expect(
          win.game.actors.get(sharedActorId).system.attributes.hp.value,
          "une baisse marquée dndCustomDamageApply (dégât appliqué via un vrai jet) doit passer"
        ).to.equal(hpBefore - 3);
      });
    });

    // Remet les PV au maximum pour ne pas fausser un futur run de cette spec.
    cy.window().then((win) => {
      const actor = win.game.actors.get(sharedActorId);
      return updateActor(win, actor, { "system.attributes.hp.value": actor.system.attributes.hp.max });
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

// Retour de test (ANOMALIES_ACTIVES.md, "Sécurité/Combat") : un Joueur pouvait contourner le
// blocage PvP en se ciblant lui-même avant de cliquer "Appliquer les dégâts" (mécanisme partagé
// avec le blocage PvP, cf. applyDamageToTargets dans dnd-custom-ai.js) — seul le MJ peut
// désormais s'appliquer des dégâts à soi-même (poison, chute, piège... à sa discrétion). Actor
// dédié (magicien avec "Trait de feu", qui poste un jet de dégâts sans nécessiter d'arme
// équipée) + un token sur la scène active pour pouvoir se cibler soi-même via game.user.targets.
describe("Permissions — auto-dégâts (se cibler soi-même)", () => {
  let mageId;
  let tokenId;

  before(() => {
    cy.loginAsPlayer();
    cy.createReadyCharacter({
      name: "Permissions Self Damage Mage",
      origin: "fleuraine",
      classKey: "wizard",
      skills: ["arcana", "history"]
    }).then((id) => {
      mageId = id;
      createdActorIds.push(id);
    });

    cy.window().then((win) => {
      const pack = win.game.packs.get("dnd-custom-ai.sorts");
      return pack.getIndex().then(() => {
        const entry = [...pack.index].find((candidate) => candidate.name === "Trait de feu");
        expect(entry, "Item 'Trait de feu' introuvable dans le compendium sorts").to.exist;
        return pack.getDocument(entry._id).then((doc) =>
          win.game.actors.get(mageId).createEmbeddedDocuments("Item", [win.JSON.parse(win.JSON.stringify(doc.toObject()))])
        );
      });
    });

    cy.loginAsGM();
    cy.window()
      .then((win) => win.game.actors.get(mageId).getTokenDocument(win.JSON.parse(win.JSON.stringify({ x: 400, y: 400 }))))
      .then((tokenDoc) =>
        cy.window().then((win) =>
          win.canvas.scene.createEmbeddedDocuments("Token", [win.JSON.parse(win.JSON.stringify(tokenDoc.toObject()))]).then((tokens) => {
            tokenId = tokens[0].id;
          })
        )
      );
  });

  after(() => {
    cy.loginAsGM();
    cy.window().then((win) => (tokenId ? win.canvas.scene.deleteEmbeddedDocuments("Token", [tokenId]) : null));
  });

  function rollFireBoltDamage() {
    cy.openActorSheet(mageId);
    cy.get('.application.character nav.tabs [data-tab="abilities"]').click();
    cy.window().then((win) => {
      const item = win.game.actors.get(mageId).items.find((candidate) => candidate.name === "Trait de feu");
      expect(item, "Trait de feu introuvable sur l'Actor").to.exist;
      cy.get(`.application.character li[data-item-id="${item.id}"] button[data-action="rollSpellDamage"]`).click();
    });
  }

  // Cible le token (lui-même), ferme la fiche (elle recouvre le chat) et clique le bouton
  // "Appliquer les dégâts" du DERNIER message de chat — même geste que tab-abilities.cy.js >
  // T-ABIL-024 (soin), pour les dégâts.
  function applyLastDamageMessage() {
    cy.window().then((win) => win.canvas.tokens.get(tokenId).setTarget(true, { releaseOthers: true }));
    cy.window().then((win) => win.game.actors.get(mageId).sheet.close());
    cy.window().then((win) => win.document.querySelector('#sidebar-tabs [data-tab="chat"]')?.click());
    cy.get(".chat-message").last().find("button.dnd-apply-damage-btn").click();
  }

  it("bloqué côté Joueur qui se cible lui-même (T-PERM-008)", () => {
    cy.loginAsPlayer();
    let hpBefore;
    let warned = false;
    cy.window().then((win) => {
      hpBefore = win.game.actors.get(mageId).system.attributes.hp.value;
      const original = win.ui.notifications.warn.bind(win.ui.notifications);
      win.ui.notifications.warn = (message) => {
        warned = true;
        return original(message);
      };
    });

    rollFireBoltDamage();
    applyLastDamageMessage();

    cy.window().should((win) => {
      expect(warned, "avertissement SelfDamageBlocked attendu côté Joueur").to.be.true;
      expect(win.game.actors.get(mageId).system.attributes.hp.value, "PV inchangés, auto-dégât bloqué").to.equal(hpBefore);
    });
  });

  it("autorisé côté MJ qui se cible lui-même (T-PERM-009)", () => {
    cy.loginAsGM();
    let hpBefore;
    cy.window().then((win) => {
      hpBefore = win.game.actors.get(mageId).system.attributes.hp.value;
    });

    rollFireBoltDamage();
    applyLastDamageMessage();

    cy.window().should((win) => {
      const amount = win.game.messages.contents.at(-1).rolls?.[0]?.total ?? 0;
      expect(win.game.actors.get(mageId).system.attributes.hp.value, "PV baissés, auto-dégât autorisé au MJ").to.equal(
        Math.max(0, hpBefore - amount)
      );
    });

    // Remonte les PV au max : état propre pour un futur run de cette spec.
    cy.window().then((win) => {
      const actor = win.game.actors.get(mageId);
      return actor.update(win.JSON.parse(win.JSON.stringify({ "system.attributes.hp.value": actor.system.attributes.hp.max })));
    });
  });
});
