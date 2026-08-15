// Implémente la section 2 (T-SHEET-001 à T-SHEET-008) de tests/E2E_TEST_PLAN.md — en-tête et
// navigation de la fiche personnage (character-sheet.hbs, actor-sheet.js). Tous les scénarios
// sont marqués "E2E" seul dans le plan (pas de volet Quench) : rien ici n'a d'équivalent dans
// tests/quench/quench-tests.js.
//
// Un seul personnage complet est créé une fois pour toute la spec (`before()`, pas
// `beforeEach()`) plutôt qu'un par test comme dans wizard.cy.js : ces scénarios testent
// l'affichage/la navigation de la fiche, pas l'assistant de création lui-même — le recréer à
// chaque test n'apporterait rien et ralentirait la suite pour rien. Chaque test réouvre juste la
// fiche de ce même Actor via game.actors.get(id).sheet.render(true) plutôt que de repasser par
// l'assistant.
//
// T-SHEET-007 (niveau 20) utilise un second Actor dédié, créé directement avec classe/origine/
// niveau déjà posés (cf. cy.toAutObject, session MJ qui contourne le hook preUpdateActor et
// l'assistant) plutôt que de faire monter de niveau le personnage partagé jusqu'à 20 — testé en
// isolation pour ne pas dépendre de l'ordre d'exécution des autres scénarios de ce fichier.

const createdActorIds = [];
let sharedActorId;

function openSheet(actorId) {
  cy.window().then((win) => win.game.actors.get(actorId).sheet.render(true));
  return cy.get("input.actor-name", { timeout: 15000 }).should("be.visible");
}

// La fiche personnage n'est pas seule dans le DOM : la sidebar native de Foundry a elle aussi un
// `nav.tabs` et des panneaux `[data-tab="journal"]` (son propre onglet Journal, sans rapport
// avec celui de la fiche) — un sélecteur non scopé matche les deux et cy.click()/les
// assertions échouent ("Your subject contained 2 elements", découvert au premier run réel,
// 2026-08-15). `.application.character` (classes posées par DndCustomActorSheet.DEFAULT_OPTIONS,
// actor-sheet.js) scope tout ce qui suit à la fenêtre de la fiche elle-même.
function sheetRoot() {
  return cy.get(".application.character");
}

// Même piège que dans wizard.cy.js/support/e2e.js (objet littéral Cypress-realm rejeté par
// Foundry) pour actor.update() cette fois, pas seulement Actor.create().
function updateActor(win, actor, data) {
  return actor.update(win.JSON.parse(win.JSON.stringify(data)));
}

before(() => {
  cy.loginAsPlayer();
  cy.createReadyCharacter({
    name: "Fiche T-SHEET",
    origin: "ravenmoor",
    classKey: "fighter",
    skills: ["athletics", "intimidation"]
  }).then((id) => {
    sharedActorId = id;
    createdActorIds.push(id);
  });
});

after(() => {
  if (!createdActorIds.length) return;
  // Session MJ : peut toujours supprimer, quel que soit le propriétaire (cf. wizard.cy.js pour
  // le même piège rencontré la première fois).
  cy.loginAsGM();
  cy.window().then((win) => win.Actor.deleteDocuments(createdActorIds));
});

describe("Fiche personnage — en-tête et navigation, session Joueur", () => {
  beforeEach(() => {
    cy.loginAsPlayer();
    openSheet(sharedActorId);
  });

  it("navigue entre les 5 onglets, un seul actif à la fois (T-SHEET-001)", () => {
    const tabs = ["stats", "equipment", "inventory", "abilities", "journal"];

    sheetRoot().find('section.tab[data-tab="stats"]').should("have.class", "active");

    tabs
      .filter((tab) => tab !== "stats")
      .forEach((tab) => {
        sheetRoot().find(`nav.tabs [data-tab="${tab}"]`).click();
        sheetRoot().find(`section.tab[data-tab="${tab}"]`).should("have.class", "active").and("be.visible");
        tabs
          .filter((other) => other !== tab)
          .forEach((other) => {
            sheetRoot().find(`section.tab[data-tab="${other}"]`).should("not.have.class", "active");
          });
      });
  });

  it("la barre de PV reflète hp.value / hp.max, jamais < 0% ni > 100% (T-SHEET-002)", () => {
    cy.window().then((win) => {
      const actor = win.game.actors.get(sharedActorId);
      const max = actor.system.attributes.hp.max;
      const half = Math.floor(max / 2);
      return updateActor(win, actor, { "system.attributes.hp.value": half }).then(() => {
        const expectedPercent = Math.round((half / max) * 100);
        sheetRoot().find(".hp-bar-fill").invoke("attr", "style").should("include", `width: ${expectedPercent}%`);
      });
    });

    // hp.value au-delà de hp.max (ex. soin appliqué avant que le prochain rendu ne clampe
    // l'affichage) : la barre ne doit jamais dépasser 100%, même temporairement — posé
    // directement via l'Actor plutôt que tapé dans le champ, dont l'attribut HTML `max` empêche
    // justement de reproduire ce cas au clavier.
    cy.window().then((win) => {
      const actor = win.game.actors.get(sharedActorId);
      return updateActor(win, actor, { "system.attributes.hp.value": actor.system.attributes.hp.max + 50 });
    });
    sheetRoot().find(".hp-bar-fill").invoke("attr", "style").should("include", "width: 100%");

    cy.window().then((win) => {
      const actor = win.game.actors.get(sharedActorId);
      return updateActor(win, actor, { "system.attributes.hp.value": 0 });
    });
    sheetRoot().find(".hp-bar-fill").invoke("attr", "style").should("include", "width: 0%");

    // Remet le personnage partagé à pleine santé pour ne pas fausser les tests suivants (Repos,
    // panneau Agonie...) qui pourraient s'exécuter après celui-ci dans la même spec.
    cy.window().then((win) => {
      const actor = win.game.actors.get(sharedActorId);
      return updateActor(win, actor, { "system.attributes.hp.value": actor.system.attributes.hp.max });
    });
  });

  it("un état actif reste visible dans le résumé de l'en-tête quel que soit l'onglet ouvert (T-SHEET-003)", () => {
    sheetRoot().find('button[data-action="toggleCondition"][data-key="poisoned"]').click();
    sheetRoot().find('button[data-action="toggleCondition"][data-key="poisoned"]').should("have.class", "active");

    cy.window()
      .its("game.i18n")
      .then((i18n) => i18n.localize("DND_CUSTOM.Conditions.poisoned"))
      .then((poisonedLabel) => {
        sheetRoot().find(".active-condition-chip").should("contain.text", poisonedLabel);

        sheetRoot().find('nav.tabs [data-tab="equipment"]').click();
        sheetRoot().find(".active-condition-chip").should("contain.text", poisonedLabel);
      });

    // Nettoyage : retire l'état pour ne pas fausser un test suivant de la même spec.
    sheetRoot().find('nav.tabs [data-tab="stats"]').click();
    sheetRoot().find('button[data-action="toggleCondition"][data-key="poisoned"]').click();
    sheetRoot().find(".active-condition-chip").should("not.exist");
  });

  it("le bouton 'Créer un personnage' est masqué une fois Classe et Origine renseignées (T-SHEET-004)", () => {
    sheetRoot().find('button[data-action="openCreationWizard"]').should("not.exist");
  });

  it("la barre XP est visible mais sans valeur chiffrée pour le Joueur (T-SHEET-005)", () => {
    sheetRoot().find(".xp-bar").should("be.visible");
    sheetRoot().find(".xp-gm-field").should("not.exist");
  });
});

describe("Fiche personnage — en-tête et navigation, session MJ", () => {
  beforeEach(() => {
    cy.loginAsGM();
  });

  it("le bloc XP détaillé (total + seuil) n'est visible qu'au MJ (T-SHEET-006)", () => {
    openSheet(sharedActorId);
    sheetRoot().find(".xp-gm-field").should("be.visible");
    sheetRoot().find(".xp-gm-field .fixed-field-value").invoke("text").should("match", /\d/);
  });

  it("la barre XP affiche 100% au niveau 20, sans erreur de calcul (T-SHEET-007)", () => {
    cy.window()
      .then((win) =>
        win.Actor.create(
          win.JSON.parse(
            win.JSON.stringify({
              name: "Fiche T-SHEET-007 niveau 20",
              type: "character",
              system: { class: "wizard", origin: "ashar", attributes: { level: 20 } }
            })
          )
        )
      )
      .then((actor) => {
        createdActorIds.push(actor.id);
        return openSheet(actor.id);
      });

    sheetRoot().find(".xp-bar-fill").invoke("attr", "style").should("include", "width: 100%");
    cy.window()
      .its("game.i18n")
      .then((i18n) => i18n.localize("DND_CUSTOM.Actor.XpMaxLevel"))
      .then((maxLevelLabel) => {
        sheetRoot().find(".xp-gm-field .fixed-field-value").invoke("text").should("include", maxLevelLabel);
      });
  });

  it("aucun select Classe/Origine directement sur la fiche (T-SHEET-008)", () => {
    openSheet(sharedActorId);
    sheetRoot().find('select[name="system.class"]').should("not.exist");
    sheetRoot().find('select[name="system.origin"]').should("not.exist");
  });
});
