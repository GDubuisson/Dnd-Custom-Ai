// T-SHEET-001 à 008 : en-tête et navigation de la fiche personnage, sur un personnage partagé ;
// T-SHEET-007 utilise un second Actor créé directement au niveau 20.

const createdActorIds = [];
let sharedActorId;

function openSheet(actorId) {
  cy.window().then((win) => win.game.actors.get(actorId).sheet.render(true));
  return cy.get("input.actor-name", { timeout: 15000 }).should("be.visible");
}

// Racine de la fiche (la sidebar a aussi un `nav.tabs`).
function sheetRoot() {
  return cy.get(".application.character");
}

// actor.update() avec des données recréées dans la réalité JS de la page.
function updateActor(win, actor, data, options = {}) {
  return actor.update(win.JSON.parse(win.JSON.stringify(data)), options);
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
  // Suppression en session MJ.
  cy.loginAsGM();
  cy.window().then((win) => win.Actor.deleteDocuments(createdActorIds));
});

describe("Fiche personnage — en-tête et navigation, session Joueur", () => {
  beforeEach(() => {
    cy.loginAsPlayer();
    openSheet(sharedActorId);
  });

  it("navigue entre les 5 onglets, un seul actif à la fois (T-SHEET-001)", () => { // NOSONAR : assertions portées par les helpers (sheetRoot()…should)
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

  it("la barre de PV reflète hp.value / hp.max, jamais < 0% ni > 100% (T-SHEET-002)", () => { // NOSONAR : assertions portées par les helpers (sheetRoot()…should)
    cy.window().then((win) => {
      const actor = win.game.actors.get(sharedActorId);
      const max = actor.system.attributes.hp.max;
      const half = Math.floor(max / 2);
      // `dndCustomDamageApply` autorise la baisse de PV simulée.
      return updateActor(win, actor, { "system.attributes.hp.value": half }, { dndCustomDamageApply: true }).then(() => {
        const expectedPercent = Math.round((half / max) * 100);
        sheetRoot().find(".hp-bar-fill").invoke("attr", "style").should("include", `width: ${expectedPercent}%`);
      });
    });

    // PV au-delà du max : la barre reste à 100 %.
    cy.window().then((win) => {
      const actor = win.game.actors.get(sharedActorId);
      return updateActor(win, actor, { "system.attributes.hp.value": actor.system.attributes.hp.max + 50 });
    });
    sheetRoot().find(".hp-bar-fill").invoke("attr", "style").should("include", "width: 100%");

    cy.window().then((win) => {
      const actor = win.game.actors.get(sharedActorId);
      return updateActor(win, actor, { "system.attributes.hp.value": 0 }, { dndCustomDamageApply: true });
    });
    sheetRoot().find(".hp-bar-fill").invoke("attr", "style").should("include", "width: 0%");

    // Personnage remis à pleine santé.
    cy.window().then((win) => {
      const actor = win.game.actors.get(sharedActorId);
      return updateActor(win, actor, { "system.attributes.hp.value": actor.system.attributes.hp.max });
    });
  });

  it("un état actif reste visible dans le résumé de l'en-tête quel que soit l'onglet ouvert (T-SHEET-003)", () => { // NOSONAR : assertions portées par les helpers (sheetRoot()…should)
    // Les états cochés s'appliquent à la fermeture de la liste.
    sheetRoot().find(".conditions-dropdown summary").click();
    sheetRoot().find('button[data-action="toggleConditionSelection"][data-key="poisoned"]').click();
    sheetRoot().find(".conditions-dropdown summary").click(); // ferme -> applique

    cy.window()
      .its("game.i18n")
      .then((i18n) => i18n.localize("DND_CUSTOM.Conditions.poisoned"))
      .then((poisonedLabel) => {
        sheetRoot().find(".active-condition-chip").should("contain.text", poisonedLabel);

        sheetRoot().find('nav.tabs [data-tab="equipment"]').click();
        sheetRoot().find(".active-condition-chip").should("contain.text", poisonedLabel);
      });

    // Retire l'état ; la liste est rouverte pour décocher.
    sheetRoot().find('nav.tabs [data-tab="stats"]').click();
    sheetRoot().find(".conditions-dropdown summary").click();
    sheetRoot().find('button[data-action="toggleConditionSelection"][data-key="poisoned"]').click();
    sheetRoot().find(".conditions-dropdown summary").click(); // ferme -> applique le retrait
    sheetRoot().find(".active-condition-chip").should("not.exist");
  });

  it("le bouton 'Créer un personnage' est masqué une fois Classe et Origine renseignées (T-SHEET-004)", () => { // NOSONAR : assertions portées par les helpers (sheetRoot()…should)
    sheetRoot().find('button[data-action="openCreationWizard"]').should("not.exist");
  });

  it("la barre XP est visible mais sans valeur chiffrée pour le Joueur (T-SHEET-005)", () => { // NOSONAR : assertions portées par les helpers (sheetRoot()…should)
    sheetRoot().find(".xp-bar").should("be.visible");
    sheetRoot().find(".xp-gm-field").should("not.exist");
  });
});

describe("Fiche personnage — en-tête et navigation, session MJ", () => {
  beforeEach(() => {
    cy.loginAsGM();
  });

  it("le bloc XP détaillé (total + seuil) n'est visible qu'au MJ (T-SHEET-006)", () => { // NOSONAR : assertions portées par les helpers (sheetRoot()…should)
    openSheet(sharedActorId);
    sheetRoot().find(".xp-gm-field").should("be.visible");
    sheetRoot().find(".xp-gm-field .fixed-field-value").invoke("text").should("match", /\d/);
  });

  it("la barre XP affiche 100% au niveau 20, sans erreur de calcul (T-SHEET-007)", () => { // NOSONAR : assertions portées par les helpers (sheetRoot()…should)
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

  it("aucun select Classe/Origine directement sur la fiche (T-SHEET-008)", () => { // NOSONAR : assertions portées par les helpers (sheetRoot()…should)
    openSheet(sharedActorId);
    sheetRoot().find('select[name="system.class"]').should("not.exist");
    sheetRoot().find('select[name="system.origin"]').should("not.exist");
  });
});
