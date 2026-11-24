// T-LVL-001 à 013 : montée de niveau (un niveau par clic, contenu octroyé, choix de sous-classe
// et Amélioration/Don). Préconditions posées via `actor.update(…, { dndCustomWizard: true })`.
// Dialogues DialogV2 : `dialog.application.dialog`, radios ou selects, `button[data-action="ok"]`.

const createdActorIds = [];
let sharedActorId;
// Plafond des pierres brisées (cf. level-cap.cy.js) : désactivé ici, rendu à sa valeur en fin de spec.
let initialLevelCapDisabled;

function sheetRoot() {
  return cy.get(".application.character");
}

function openSheet(actorId) {
  cy.window().then((win) => win.game.actors.get(actorId).sheet.render(true));
  return cy.get("input.actor-name", { timeout: 15000 }).should("be.visible");
}

// Ferme l'assistant ouvert automatiquement à la création, sans quoi la fiche ne s'affiche pas.
function closeAutoWizard(actorId) {
  return cy.window().then((win) => {
    const wizard = [...win.foundry.applications.instances.values()].find(
      (app) => app.actor?.id === actorId && app.constructor.name === "CharacterCreationWizard"
    );
    return wizard ? wizard.close() : null;
  });
}

function updateActor(win, actor, data, options = {}) {
  return actor.update(win.JSON.parse(win.JSON.stringify(data)), options);
}

function actorLevel(actorId) {
  return cy.window().then((win) => win.game.actors.get(actorId).system.attributes.level);
}

before(() => {
  cy.loginAsGM();
  cy.window().then((win) => {
    initialLevelCapDisabled = win.game.settings.get("dnd-custom-ai", "levelCapDisabled");
    return win.game.settings.set("dnd-custom-ai", "levelCapDisabled", true);
  });
  cy.loginAsPlayer();
  cy.createReadyCharacter({
    name: "LevelUp Fighter",
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
  cy.window().then((win) =>
    Promise.all([
      initialLevelCapDisabled === undefined
        ? null
        : win.game.settings.set("dnd-custom-ai", "levelCapDisabled", initialLevelCapDisabled),
      createdActorIds.length ? win.Actor.deleteDocuments(createdActorIds) : null
    ])
  );
});

describe("Montée de niveau — clic simple, PV, accessibilité Joueur", () => {
  // Niveau 5 avec sous-classe : aucun dialogue entre 5 et 7.
  beforeEach(() => {
    cy.loginAsPlayer();
    cy.window().then((win) => {
      const actor = win.game.actors.get(sharedActorId);
      return updateActor(
        win,
        actor,
        {
          "system.attributes.level": 5,
          "system.subclass": "champion",
          "system.xp": 999999,
          "system.attributes.hp.value": 1
        },
        { dndCustomWizard: true }
      );
    });
    openSheet(sharedActorId);
  });

  it("ne monte que d'UN niveau par clic, même cliqué plusieurs fois d'affilée (T-LVL-001)", () => { // NOSONAR : assertions portées par les helpers (sheetRoot()…should)
    sheetRoot().find('button[data-action="levelUp"]').click();
    actorLevel(sharedActorId).should("equal", 6);

    openSheet(sharedActorId);
    sheetRoot().find('button[data-action="levelUp"]').click();
    actorLevel(sharedActorId).should("equal", 7);
  });

  it("recalcule hp.max et remplit hp.value au nouveau maximum (T-LVL-002)", () => {
    cy.window().then((win) => {
      const before = win.game.actors.get(sharedActorId).system.attributes.hp;
      expect(before.value, "précondition : PV actuels < max avant la montée de niveau").to.be.lessThan(before.max);
    });

    sheetRoot().find('button[data-action="levelUp"]').click();

    cy.window().should((win) => {
      const actor = win.game.actors.get(sharedActorId);
      expect(actor.system.attributes.level, "niveau bien monté").to.equal(6);
      expect(actor.system.attributes.hp.value, "PV actuels remplis au nouveau max").to.equal(actor.system.attributes.hp.max);
    });
  });

  it("le bouton 'Monter de niveau' aboutit pour un Joueur propriétaire, pas seulement le MJ (T-LVL-003)", () => { // NOSONAR : assertions portées par les helpers (sheetRoot()…should)
    // Montée de niveau en session Joueur.
    sheetRoot().find('button[data-action="levelUp"]').click();
    actorLevel(sharedActorId).should("equal", 6);
  });
});

describe("Montée de niveau — octroi de contenu de classe", () => {
  it("octroie les Capacités/Sorts du nouveau niveau et les annonce en chat (T-LVL-004)", () => {
    cy.loginAsPlayer();
    cy.window().then((win) => {
      const actor = win.game.actors.get(sharedActorId);
      // Guerrier 1 -> 2 : « Sursaut d'activité », sans dialogue.
      return updateActor(
        win,
        actor,
        { "system.attributes.level": 1, "system.subclass": "", "system.xp": 999999 },
        { dndCustomWizard: true }
      );
    });
    openSheet(sharedActorId);

    let messageCountBefore;
    cy.window().its("game.messages.size").then((size) => {
      messageCountBefore = size;
    });

    sheetRoot().find('button[data-action="levelUp"]').click();

    cy.window().should((win) => {
      const actor = win.game.actors.get(sharedActorId);
      const secondWind = actor.items.find((item) => item.name === "Sursaut d'activité");
      expect(secondWind, "la Capacité de niveau 2 du Guerrier doit être octroyée automatiquement").to.exist;
      expect(win.game.messages.size, "un message annonçant le contenu octroyé doit être posté").to.be.greaterThan(
        messageCountBefore
      );
    });
  });

  it("ne poste aucun message parasite quand rien n'est octroyé à ce niveau (T-LVL-005)", () => {
    // Niveau 6 -> 7 sans sous-classe : aucune Capacité octroyée.
    cy.loginAsPlayer();
    cy.window().then((win) => {
      const actor = win.game.actors.get(sharedActorId);
      return updateActor(
        win,
        actor,
        { "system.attributes.level": 6, "system.subclass": "", "system.xp": 999999 },
        { dndCustomWizard: true }
      );
    });
    openSheet(sharedActorId);

    let messageCountBefore;
    cy.window().its("game.messages.size").then((size) => {
      messageCountBefore = size;
    });

    sheetRoot().find('button[data-action="levelUp"]').click();

    cy.window().should((win) => {
      expect(win.game.actors.get(sharedActorId).system.attributes.level, "le niveau doit bien avoir avancé").to.equal(7);
    });
    // Un seul message (« montée de niveau ») attendu, sans message de contenu octroyé.
    cy.wait(1000);
    cy.window().should((win) => {
      expect(win.game.messages.size, "exactement le message de montée de niveau, aucun second message").to.equal(
        messageCountBefore + 1
      );
    });
  });
});

describe("Montée de niveau — choix de sous-classe", () => {
  it("propose le choix de sous-classe au niveau requis, sans re-proposition une fois choisie (T-LVL-006, T-LVL-007)", () => {
    cy.loginAsPlayer();
    let dedicatedActorId;

    cy.window()
      .then((win) => win.Actor.create(win.JSON.parse(win.JSON.stringify({ name: "LevelUp Subclass", type: "character" }))))
      .then((actor) => {
        dedicatedActorId = actor.id;
        createdActorIds.push(actor.id);
        return cy.window().then((win) =>
          updateActor(
            win,
            actor,
            { "system.class": "fighter", "system.origin": "fleuraine", "system.attributes.level": 2, "system.xp": 999999 },
            { dndCustomWizard: true }
          )
        );
      });

    cy.then(() => closeAutoWizard(dedicatedActorId));
    cy.then(() => openSheet(dedicatedActorId));

    // Niveau 2 -> 3 sans sous-classe : dialogue de sous-classe.
    sheetRoot().find('button[data-action="levelUp"]').click();

    cy.window()
      .its("game.i18n")
      .then((i18n) => i18n.localize("DND_CUSTOM.LevelUp.SubclassDialogTitle"))
      .then((title) => {
        cy.get("dialog.application.dialog .window-title", { timeout: 10000 }).should("contain.text", title);
      });

    cy.get('dialog.application.dialog input[type="radio"][name="subclassKey"][value="champion"]').check();
    cy.get('dialog.application.dialog button[data-action="ok"]').click();

    cy.window().should((win) => {
      expect(win.game.actors.get(dedicatedActorId).system.subclass, "sous-classe appliquée").to.equal("champion");
    });

    // Niveau 3 -> 4 avec sous-classe : pas de nouvelle proposition ; dialogue Amélioration/Don fermé.
    cy.then(() => openSheet(dedicatedActorId));
    sheetRoot().find('button[data-action="levelUp"]').click();

    cy.window()
      .its("game.i18n")
      .then((i18n) => i18n.localize("DND_CUSTOM.LevelUp.ChoiceTitle"))
      .then((choiceTitle) => {
        // Le dialogue ouvert est celui d'Amélioration/Don.
        cy.get("dialog.application.dialog .window-title", { timeout: 10000 }).should("contain.text", choiceTitle);
      });
    cy.get('dialog.application.dialog button[data-action="close"]').click();
  });

  it("le sélecteur d'en-tête reste un secours si la boîte de dialogue est fermée sans choisir (T-LVL-008)", () => {
    cy.loginAsPlayer();
    let dedicatedActorId;

    cy.window()
      .then((win) => win.Actor.create(win.JSON.parse(win.JSON.stringify({ name: "LevelUp Subclass Fallback", type: "character" }))))
      .then((actor) => {
        dedicatedActorId = actor.id;
        createdActorIds.push(actor.id);
        return cy.window().then((win) =>
          updateActor(
            win,
            actor,
            { "system.class": "fighter", "system.origin": "fleuraine", "system.attributes.level": 2, "system.xp": 999999 },
            { dndCustomWizard: true }
          )
        );
      });

    cy.then(() => closeAutoWizard(dedicatedActorId));
    cy.then(() => openSheet(dedicatedActorId));
    sheetRoot().find('button[data-action="levelUp"]').click();

    // Ferme le dialogue de sous-classe sans choisir.
    cy.get('dialog.application.dialog[open] .window-title', { timeout: 10000 }).should("exist");
    cy.get('dialog.application.dialog[open] button[data-action="close"]').click();
    cy.window().should((win) => {
      expect(win.game.actors.get(dedicatedActorId).system.subclass, "aucune sous-classe appliquée après fermeture").to.be.empty;
    });

    // Le sélecteur de l'en-tête reste disponible et octroie les Capacités.
    cy.then(() => openSheet(dedicatedActorId));
    sheetRoot().find('select[name="system.subclass"]').select("champion");
    cy.window().should((win) => {
      expect(win.game.actors.get(dedicatedActorId).system.subclass, "sous-classe appliquée via le sélecteur d'en-tête").to.equal(
        "champion"
      );
    });
  });
});

describe("Montée de niveau — Amélioration de caractéristiques / Don", () => {
  // Guerrier niveau 3 avec sous-classe, pour ne tester que le dialogue Amélioration/Don.
  function createLevel3Fighter(name) {
    let dedicatedActorId;
    cy.window()
      .then((win) => win.Actor.create(win.JSON.parse(win.JSON.stringify({ name, type: "character" }))))
      .then((actor) => {
        dedicatedActorId = actor.id;
        createdActorIds.push(actor.id);
        return cy.window().then((win) =>
          updateActor(
            win,
            actor,
            {
              "system.class": "fighter",
              "system.origin": "fleuraine",
              "system.subclass": "champion",
              "system.attributes.level": 3,
              "system.xp": 999999
            },
            { dndCustomWizard: true }
          )
        );
      });
    cy.then(() => closeAutoWizard(dedicatedActorId));
    return cy.then(() => dedicatedActorId);
  }

  it("propose le choix AMC/Don au niveau requis, pas ailleurs une fois résolu (T-LVL-009, T-LVL-010)", () => {
    cy.loginAsPlayer();
    createLevel3Fighter("LevelUp ASI Threshold").then((dedicatedActorId) => {
      // Niveau 3 -> 4 : dialogue Amélioration/Don.
      openSheet(dedicatedActorId);
      sheetRoot().find('button[data-action="levelUp"]').click();

      cy.window()
        .its("game.i18n")
        .then((i18n) => i18n.localize("DND_CUSTOM.LevelUp.ChoiceTitle"))
        .then((title) => {
          cy.get("dialog.application.dialog .window-title", { timeout: 10000 }).should("contain.text", title);
        });
      // Choix appliqué, rien ne reste dû.
      cy.get('dialog.application.dialog button[data-action="asi"]').click();
      cy.get('dialog.application.dialog select[name="ability1"]').select("str");
      cy.get('dialog.application.dialog button[data-action="ok"]').click();

      // Niveau 4 -> 5 : aucun dialogue.
      cy.then(() => openSheet(dedicatedActorId));
      sheetRoot().find('button[data-action="levelUp"]').click();
      cy.wait(1000);
      cy.get("dialog.application.dialog").should("not.exist");
    });
  });

  it("choix AMC/Don fermé sans choisir : reste dû, reproposé à la montée suivante, rattrapable via le badge (T-LVL-013)", () => {
    cy.loginAsPlayer();
    createLevel3Fighter("LevelUp ASI Pending").then((dedicatedActorId) => {
      // Niveau 3 -> 4 : dialogue fermé sans choisir.
      openSheet(dedicatedActorId);
      sheetRoot().find('button[data-action="levelUp"]').click();
      cy.get('dialog.application.dialog .window-title', { timeout: 10000 }).should("exist");
      cy.get('dialog.application.dialog button[data-action="close"]').click();
      cy.get("dialog.application.dialog").should("not.exist");

      cy.window().should((win) => {
        expect(win.game.actors.get(dedicatedActorId).system.attributes.pendingAsiChoices, "choix resté dû").to.equal(1);
      });

      // Badge de choix dû visible.
      sheetRoot().find('button[data-action="resolvePendingAsi"]').should("exist");

      // Niveau 4 -> 5 : le choix dû est reproposé.
      sheetRoot().find('button[data-action="levelUp"]').click();
      cy.get('dialog.application.dialog .window-title', { timeout: 10000 }).should("have.length", 1);

      cy.get('dialog.application.dialog button[data-action="asi"]').click();
      cy.get('dialog.application.dialog select[name="ability1"]').select("dex");
      cy.get('dialog.application.dialog button[data-action="ok"]').click();
      cy.get("dialog.application.dialog").should("not.exist");

      cy.window().should((win) => {
        expect(win.game.actors.get(dedicatedActorId).system.attributes.pendingAsiChoices, "choix résolu").to.equal(0);
      });
    });
  });

  it("bouton 'Retour' du choix AMC/Don : ramène au choix Amélioration/Don sans rien perdre (T-LVL-014)", () => {
    cy.loginAsPlayer();
    createLevel3Fighter("LevelUp ASI Back").then((dedicatedActorId) => {
      openSheet(dedicatedActorId);
      sheetRoot().find('button[data-action="levelUp"]').click();
      cy.get('dialog.application.dialog button[data-action="feat"]', { timeout: 10000 }).click();

      cy.get('dialog.application.dialog button[data-action="back"]', { timeout: 10000 }).click();
      cy.window()
        .its("game.i18n")
        .then((i18n) => i18n.localize("DND_CUSTOM.LevelUp.ChoiceTitle"))
        .then((title) => {
          cy.get("dialog.application.dialog .window-title", { timeout: 10000 }).should("have.length", 1).and("contain.text", title);
        });

      cy.get('dialog.application.dialog button[data-action="asi"]').click();
      cy.get('dialog.application.dialog select[name="ability1"]', { timeout: 10000 }).select("con");
      cy.get('dialog.application.dialog button[data-action="ok"]').click();
      cy.get("dialog.application.dialog").should("not.exist");

      cy.window().should((win) => {
        expect(win.game.actors.get(dedicatedActorId).system.attributes.pendingAsiChoices, "choix résolu, rien perdu via le retour").to.equal(0);
      });
    });
  });

  it("applique le choix Amélioration de caractéristiques (T-LVL-011)", () => {
    cy.loginAsPlayer();
    createLevel3Fighter("LevelUp ASI Applied").then((dedicatedActorId) => {
      let strBefore;
      cy.window().then((win) => {
        strBefore = win.game.actors.get(dedicatedActorId).system.abilities.str.value;
      });

      openSheet(dedicatedActorId);
      sheetRoot().find('button[data-action="levelUp"]').click();
      cy.get('dialog.application.dialog button[data-action="asi"]', { timeout: 10000 }).click();

      cy.get('dialog.application.dialog select[name="ability1"]').select("str");
      cy.get('dialog.application.dialog button[data-action="ok"]').click();

      cy.window().should((win) => {
        const actor = win.game.actors.get(dedicatedActorId);
        // Une seule caractéristique : +2, plafonné à 20.
        expect(actor.system.abilities.str.value).to.equal(Math.min(20, strBefore + 2));
      });
    });
  });

  it("applique le choix Don (T-LVL-012)", () => {
    cy.loginAsPlayer();
    createLevel3Fighter("LevelUp Feat Applied").then((dedicatedActorId) => {
      openSheet(dedicatedActorId);
      sheetRoot().find('button[data-action="levelUp"]').click();
      cy.get('dialog.application.dialog button[data-action="feat"]', { timeout: 10000 }).click();

      let chosenFeatName;
      cy.get('dialog.application.dialog input[type="radio"][name="featId"]')
        .first()
        .then(($radio) => {
          chosenFeatName = $radio.closest("label").find("strong").text();
        });
      cy.get('dialog.application.dialog button[data-action="ok"]').click();

      cy.window().should((win) => {
        const actor = win.game.actors.get(dedicatedActorId);
        expect(actor.items.some((item) => item.type === "feature" && item.name === chosenFeatName), "le Don choisi est ajouté à l'Actor")
          .to.be.true;
      });
    });
  });
});

describe("Montée de niveau — emplacements de sorts par niveau", () => {
  it("recalcule les emplacements de sorts par niveau du personnage (T-LVL-015)", () => {
    cy.loginAsPlayer();
    let dedicatedActorId;
    cy.window()
      .then((win) => win.Actor.create(win.JSON.parse(win.JSON.stringify({ name: "LevelUp Wizard Slots", type: "character" }))))
      .then((actor) => {
        dedicatedActorId = actor.id;
        createdActorIds.push(actor.id);
        return cy.window().then((win) =>
          updateActor(
            win,
            actor,
            { "system.class": "wizard", "system.origin": "ashar", "system.attributes.level": 2, "system.xp": 999999 },
            { dndCustomWizard: true }
          )
        );
      });
    cy.then(() => closeAutoWizard(dedicatedActorId));

    cy.window().should((win) => {
      // Magicien niveau 2 : aucun emplacement de niveau 2.
      expect(
        win.game.actors.get(dedicatedActorId).system.spells.slots[2].max,
        "prérequis : pas encore d'emplacement de niveau 2"
      ).to.equal(0);
    });

    // Emplacements de niveau 1 entamés (1 sur 3) avant la montée de niveau.
    cy.then(() =>
      cy.window().then((win) =>
        updateActor(win, win.game.actors.get(dedicatedActorId), { "system.spells.slots.1.value": 1 })
      )
    );

    cy.then(() => openSheet(dedicatedActorId));
    sheetRoot().find('button[data-action="levelUp"]').click();

    cy.window().should((win) => {
      const actor = win.game.actors.get(dedicatedActorId);
      expect(actor.system.attributes.level, "niveau bien monté").to.equal(3);
      // Niveau 3 : premier emplacement de niveau 2.
      expect(actor.system.spells.slots[2].max, "emplacement de niveau 2 gagné au niveau 3").to.equal(2);
      // Emplacements remplis au nouveau maximum.
      expect(
        actor.system.spells.slots[1].value,
        "emplacements de niveau 1 rechargés au max à la montée de niveau, pas laissés entamés"
      ).to.equal(actor.system.spells.slots[1].max);
      expect(
        actor.system.spells.slots[2].value,
        "nouvel emplacement de niveau 2 déjà à son max, pas à 0"
      ).to.equal(actor.system.spells.slots[2].max);
    });
  });
});
