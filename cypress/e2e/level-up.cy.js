// Implémente la section 8 (T-LVL-001 à T-LVL-012) de tests/E2E_TEST_PLAN.md — montée de niveau
// (bouton `data-action="levelUp"` de l'en-tête de fiche, #onLevelUp dans actor-sheet.js,
// level-up-choice.js, subclass-choice.js, ability-score-improvement.js).
//
// Préconditions de niveau/sous-classe/XP posées directement via `actor.update(data,
// { dndCustomWizard: true })` (même bypass volontaire du hook preUpdateActor que
// character-sheet.cy.js > T-SHEET-007) plutôt qu'en rejouant plusieurs vraies montées de niveau
// pour y arriver : seul le clic RÉEL sur le bouton "Monter de niveau" testé par chaque scénario
// ci-dessous doit prouver le comportement, pas la mise en place. `system.xp` n'est PAS un champ
// verrouillé (cf. preUpdateActor, dnd-custom-ai.js — seuls class/origin/subclass/level/
// abilities/saves/skills le sont) : un Joueur peut le poser librement sans bypass, direct depuis
// la session Joueur.
//
// T-LVL-004 (Capacités/Sorts octroyés à la montée de niveau) a longtemps été volontairement
// rouge (même bug que T-STATS-012, tab-stats.cy.js, corrigé le 2026-08-16) : grantClassContent
// (class-content.js) comparait le libellé de classe localisé (`game.i18n.localize`) au libellé
// français codé en dur dans world-items/features.json, ce qui ne correspondait jamais sous une
// langue de monde non française. Corrigé en comparant des clés de classe stables (cf.
// FeatureData/SpellData, scripts/data/item-data.js) — #onLevelUp (actor-sheet.js) rappelle cette
// même fonction, désormais correcte quelle que soit la langue active.
//
// Structure DOM des boîtes de dialogue (DialogV2, capturée en conditions réelles) :
// - Choix de sous-classe (subclass-choice.js) : `dialog.application.dialog` avec des
//   `input[type="radio"][name="subclassKey"]` et un bouton de confirmation
//   `button[data-action="ok"]`.
// - Choix Amélioration de caractéristiques/Don (level-up-choice.js) : deux boutons
//   `button[data-action="asi"]`/`button[data-action="feat"]` sur la première boîte, puis soit
//   des `select[name="ability1"]`/`select[name="ability2"]` + `button[data-action="ok"]` (AMC),
//   soit des `input[type="radio"][name="featId"]` + `button[data-action="ok"]` (Don).

const createdActorIds = [];
let sharedActorId;

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

function actorLevel(actorId) {
  return cy.window().then((win) => win.game.actors.get(actorId).system.attributes.level);
}

before(() => {
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
  if (!createdActorIds.length) return;
  cy.loginAsGM();
  cy.window().then((win) => win.Actor.deleteDocuments(createdActorIds));
});

describe("Montée de niveau — clic simple, PV, accessibilité Joueur", () => {
  // Niveau 5, sous-classe déjà posée (subclassLevel fighter = 3, cf. config.js) : les clics
  // testés ici (5 -> 6 -> 7) ne croisent ni le seuil de choix de sous-classe ni un seuil
  // Amélioration de caractéristiques/Don ([4, 8, 12, 16, 19]), donc aucune boîte de dialogue
  // n'interrompt le flux — seul le mécanisme "un niveau par clic" est sous test ici.
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

  it("ne monte que d'UN niveau par clic, même cliqué plusieurs fois d'affilée (T-LVL-001)", () => {
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

  it("le bouton 'Monter de niveau' aboutit pour un Joueur propriétaire, pas seulement le MJ (T-LVL-003)", () => {
    // cy.loginAsPlayer() dans le beforeEach ci-dessus suffit déjà à couvrir ce scénario (aucune
    // des assertions T-LVL-001/002 ne serait vraie si le hook preUpdateActor rejetait l'update
    // d'un Joueur) — ce test le rend explicite plutôt que de rester implicite dans les deux
    // précédents, comme demandé par le plan.
    sheetRoot().find('button[data-action="levelUp"]').click();
    actorLevel(sharedActorId).should("equal", 6);
  });
});

describe("Montée de niveau — octroi de contenu de classe", () => {
  it("octroie les Capacités/Sorts du nouveau niveau et les annonce en chat (T-LVL-004)", () => {
    cy.loginAsPlayer();
    cy.window().then((win) => {
      const actor = win.game.actors.get(sharedActorId);
      // Fighter niveau 1 -> 2 : "Sursaut d'activité" (world-items/features.json), aucun seuil
      // de sous-classe/ASI-Don ni croisé (subclassLevel fighter = 3, liste ASI = [4,8,12,16,19]).
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
    // Marqué "Quench" seul dans le plan, mais #onLevelUp (actor-sheet.js) est une méthode
    // PRIVÉE inatteignable directement depuis un test Quench (même limite documentée pour
    // #grantStartingEquipment, cf. tests/quench/quench-tests.js > submitWizardForm) — testé ici
    // en E2E via le vrai bouton, seul chemin qui exerce réellement le mécanisme "pas de message
    // si grantedNames est vide". Niveau 6 -> 7 : aucune Capacité de Guerrier/Champion à ce
    // niveau (world-items/features.json : Guerrier en a en 1/2/5/9, Champion en 3/7 -- 7 est
    // exclu ici via un personnage SANS sous-classe choisie, cf. mise en place ci-dessous).
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
    // #onLevelUp poste TOUJOURS un message "montée de niveau" (DND_CUSTOM.Chat.LevelUp), avant
    // de décider s'il y ajoute un second message "contenu octroyé" — donc exactement UN nouveau
    // message est attendu ici, pas zéro : c'est l'ABSENCE d'un second message qui est sous test.
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

    cy.then(() => openSheet(dedicatedActorId));

    // Niveau 2 -> 3 : subclassLevel fighter = 3 (config.js), aucune sous-classe encore choisie ->
    // la boîte de dialogue doit s'ouvrir automatiquement (T-LVL-006).
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

    // Niveau 3 -> 4 : sous-classe déjà choisie -> pas de nouvelle proposition (T-LVL-007). Le
    // niveau 4 déclenche en revanche la boîte Amélioration de caractéristiques/Don (hors sujet
    // ici, cf. describe suivant) : fermée sans choisir pour ne pas interférer avec ce test.
    cy.then(() => openSheet(dedicatedActorId));
    sheetRoot().find('button[data-action="levelUp"]').click();

    cy.window()
      .its("game.i18n")
      .then((i18n) => i18n.localize("DND_CUSTOM.LevelUp.ChoiceTitle"))
      .then((choiceTitle) => {
        // Niveau 4 = seuil AMC/Don (DND_CUSTOM.abilityScoreImprovementLevels) : c'est CETTE
        // boîte qui s'ouvre, jamais celle de sous-classe (déjà choisie) — la preuve la plus
        // directe de "pas de re-proposition" est que le titre affiché soit bien celui du choix
        // AMC/Don, pas celui de sous-classe.
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

    cy.then(() => openSheet(dedicatedActorId));
    sheetRoot().find('button[data-action="levelUp"]').click();

    // Ferme la boîte de choix de sous-classe (niveau 3 atteint) sans rien sélectionner.
    cy.get('dialog.application.dialog[open] .window-title', { timeout: 10000 }).should("exist");
    cy.get('dialog.application.dialog[open] button[data-action="close"]').click();
    cy.window().should((win) => {
      expect(win.game.actors.get(dedicatedActorId).system.subclass, "aucune sous-classe appliquée après fermeture").to.be.empty;
    });

    // Secours : le sélecteur permanent de l'en-tête de fiche reste utilisable, avec le même
    // octroi de contenu de sous-classe à la clé (hook updateActor, dnd-custom-ai.js) que la
    // boîte de dialogue.
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
  // Sous-classe déjà posée (champion) pour ne jamais croiser la boîte de choix de sous-classe
  // dans ce describe : seule la boîte AMC/Don est sous test ici.
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
    return cy.then(() => dedicatedActorId);
  }

  it("propose le choix AMC/Don au niveau requis, pas ailleurs (T-LVL-009, T-LVL-010)", () => {
    cy.loginAsPlayer();
    createLevel3Fighter("LevelUp ASI Threshold").then((dedicatedActorId) => {
      // Niveau 3 -> 4 : niveau ASI (DND_CUSTOM.abilityScoreImprovementLevels) -> la boîte de
      // choix doit s'ouvrir (T-LVL-009).
      openSheet(dedicatedActorId);
      sheetRoot().find('button[data-action="levelUp"]').click();

      cy.window()
        .its("game.i18n")
        .then((i18n) => i18n.localize("DND_CUSTOM.LevelUp.ChoiceTitle"))
        .then((title) => {
          cy.get("dialog.application.dialog .window-title", { timeout: 10000 }).should("contain.text", title);
        });
      cy.get('dialog.application.dialog button[data-action="close"]').click();

      // Niveau 4 -> 5 : pas un niveau ASI -> aucune boîte proposée (T-LVL-010).
      cy.then(() => openSheet(dedicatedActorId));
      sheetRoot().find('button[data-action="levelUp"]').click();
      cy.wait(1000);
      cy.get("dialog.application.dialog").should("not.exist");
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
        // Un seul choix (ability2 laissé vide) -> +2, plafonné à 20 (cf.
        // ability-score-improvement.js).
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
