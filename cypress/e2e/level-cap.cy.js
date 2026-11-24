// T-CAP-001 à 006 : plafond de niveau lié aux pierres brisées (réglages de monde du MJ).
// 0-1 pierre : niv. 4, puis 8, 12, 16, 20 ; XP bloqué au seuil du niveau suivant le plafond.
// La spec remet tous les réglages du plafond à leur valeur initiale, supprime son personnage
// et les messages de chat qu'elle a fait poster.

const SYSTEM_ID = "dnd-custom-ai";
const SITE_SETTINGS = [
  "brokenSiteLogne",
  "brokenSiteSumpfenmark",
  "brokenSiteKis",
  "brokenSiteTirwen",
  "brokenSiteZahir",
  "brokenSiteVelencia"
];
const DISABLED_SETTING = "levelCapDisabled";
const ALL_SETTINGS = [...SITE_SETTINGS, DISABLED_SETTING];

const initialSettings = {};
let actorId;
let initialMessageIds;

function sheetRoot() {
  return cy.get(".application.character");
}

// Écrit plusieurs réglages du plafond (clé → booléen), attendus avant la suite.
function setCapSettings(values) {
  return cy.window().then((win) =>
    Promise.all(Object.entries(values).map(([key, value]) => win.game.settings.set(SYSTEM_ID, key, value)))
  );
}

// Aucun site coché, plafond actif.
function resetCapSettings() {
  return setCapSettings(Object.fromEntries(ALL_SETTINGS.map((key) => [key, false])));
}

// Met à jour le personnage (objet recréé dans la page).
function updateActor(data) {
  return cy.window().then((win) =>
    win.game.actors.get(actorId).update(win.JSON.parse(win.JSON.stringify(data)), { dndCustomWizard: true })
  );
}

function actorSystem() {
  return cy.window().then((win) => win.game.actors.get(actorId).system);
}

before(() => {
  cy.loginAsGM();
  cy.window().then((win) => {
    for (const key of ALL_SETTINGS) initialSettings[key] = win.game.settings.get(SYSTEM_ID, key);
    initialMessageIds = new Set(win.game.messages.map((message) => message.id));
  });
  resetCapSettings();
  cy.createReadyCharacter({ name: "LevelCap Fighter" }).then((id) => {
    actorId = id;
  });
});

after(() => {
  cy.loginAsGM();
  setCapSettings(initialSettings);
  cy.window().then((win) => {
    const newMessageIds = win.game.messages.filter((message) => !initialMessageIds?.has(message.id)).map((m) => m.id);
    return Promise.all([
      actorId ? win.Actor.deleteDocuments([actorId]) : null,
      newMessageIds.length ? win.ChatMessage.deleteDocuments(newMessageIds) : null
    ]);
  });
});

describe("Plafond de niveau des pierres brisées", () => {
  beforeEach(() => {
    cy.loginAsGM();
    resetCapSettings();
  });

  it("aucune pierre cochée : plafond 4, l'XP s'arrête au seuil du niveau 5 (T-CAP-001)", () => {
    updateActor({ "system.attributes.level": 1, "system.xp": 0 });
    cy.window().its("game.dndCustomAi").invoke("currentLevelCap").should("equal", 4);

    updateActor({ "system.xp": 999999 });
    actorSystem().its("xp").should("equal", 6500);
  });

  it("au plafond : cadenas à la place du bouton, plafond affiché au MJ (T-CAP-002)", () => {
    updateActor({ "system.attributes.level": 4, "system.xp": 6500 });
    cy.openActorSheet(actorId);

    sheetRoot().find('[data-action="levelUp"]').should("not.exist");
    sheetRoot().find(".level-cap-reached").should("be.visible").and("have.attr", "data-tooltip");
    cy.window().then((win) => {
      const capped = win.game.i18n.format("DND_CUSTOM.Actor.XpCapped", { cap: 4 });
      sheetRoot().find(".xp-gm-field").should("contain.text", capped);
    });
  });

  it("deux pierres brisées : plafond 8, la fiche ouverte rend le bouton et la montée aboutit (T-CAP-003)", () => {
    // Sous-classe déjà choisie : aucun dialogue au passage 4 → 5.
    updateActor({ "system.attributes.level": 4, "system.subclass": "champion", "system.xp": 6500 });
    cy.openActorSheet(actorId);
    sheetRoot().find(".level-cap-reached").should("exist");

    setCapSettings({ brokenSiteLogne: true, brokenSiteSumpfenmark: true });
    cy.window().its("game.dndCustomAi").invoke("currentLevelCap").should("equal", 8);

    sheetRoot().find(".level-cap-reached").should("not.exist");
    sheetRoot().find('button[data-action="levelUp"]').click();
    actorSystem().its("attributes.level").should("equal", 5);

    // Nouvelle limite : seuil du niveau 9.
    updateActor({ "system.xp": 999999 });
    actorSystem().its("xp").should("equal", 48000);
  });

  it("cinq pierres : niveau 20 atteignable, plus aucune limite d'XP (T-CAP-004)", () => {
    setCapSettings(Object.fromEntries(SITE_SETTINGS.slice(0, 5).map((key) => [key, true])));
    cy.window().its("game.dndCustomAi").invoke("currentLevelCap").should("equal", 20);

    updateActor({ "system.attributes.level": 19, "system.xp": 999999 });
    actorSystem().its("xp").should("equal", 999999);
  });

  it("plafond désactivé (hors campagne) : aucune limite, même sans pierre (T-CAP-005)", () => {
    setCapSettings({ [DISABLED_SETTING]: true });
    cy.window().its("game.dndCustomAi").invoke("currentLevelCap").should("equal", 20);

    updateActor({ "system.attributes.level": 1, "system.xp": 999999 });
    actorSystem().its("xp").should("equal", 999999);
  });

  it("un total d'XP déjà au-delà de la limite n'est jamais réduit, seulement figé (T-CAP-006)", () => {
    // Pierres décochées après coup : le personnage garde son XP mais n'en gagne plus.
    setCapSettings({ [DISABLED_SETTING]: true });
    updateActor({ "system.attributes.level": 5, "system.xp": 50000 });
    setCapSettings({ [DISABLED_SETTING]: false });

    updateActor({ "system.xp": 50300 });
    actorSystem().its("xp").should("equal", 50000);
  });
});
