// Macro MJ « Configurer le calendrier » : applique le comput de Velencia (12 mois, Jours Muets,
// semaine de six jours, lune, fêtes) au module Simple Calendar Reborn, et crée les Cycles de
// Qasirah (calendrier lunaire d'Azhar) calés sur lui et synchronisés.
// Prérequis : le module est copié dans data/Data/modules (cf. tests/E2E_TEST_PLAN.md) ; la spec
// l'active pour ses tests puis le désactive, et supprime notes, macro, calendrier d'Azhar et
// dossier de notes ; elle rend au module ses réglages communs.

const MODULE_ID = "foundryvtt-simple-calendar-reborn";
const QASIRAH_ID = "dnd-custom-ai-qasirah";

const MONTHS = [
  "Bergerie", "Agnelée", "Reverdie", "Semailles", "Tonte", "Fenaison",
  "Moisson", "Estive", "Vendange", "Dévalée", "Glandée", "Longuenuit", "Jours Muets"
];
const WEEKDAYS = ["Prime", "Seconde", "Tierce", "Quarte", "Quinte", "Sixte"];
const QASIRAH_MONTHS = ["Hilal", "Bir", "Dalw", "Qanat", "Ayn", "Nakhla", "Qafila", "Ramla", "Najm", "Mizan", "Khatm", "Qamar"];

// Dossier de journaux que le module crée pour ranger ses notes.
const NOTES_FOLDER = "_simple_calendar_notes_directory";

let initialWorldTime;
let initialModuleConfiguration;
let initialGlobalConfiguration;

// Écrit un réglage du monde à partir d'un objet recréé dans la page :
// un objet de la spec serait vidé par la validation du réglage.
function setWorldSetting(win, namespace, key, value) {
  return win.game.settings.set(namespace, key, win.JSON.parse(JSON.stringify(value)));
}

// Écrit le réglage des modules du monde ; prend effet au chargement suivant.
function setModuleConfiguration(configOf) {
  cy.window().then((win) => setWorldSetting(win, "core", "moduleConfiguration", configOf()));
}

// Attend que le module ait chargé ses calendriers.
function calendarApi() {
  return cy
    .window({ timeout: 30000 })
    .should((win) => {
      expect(win.game.modules.get(MODULE_ID), `module ${MODULE_ID} absent de data/Data/modules`).to.exist;
      expect(win.game.modules.get(MODULE_ID).active, "module de calendrier actif").to.equal(true);
      expect(win.SimpleCalendar?.api?.getCurrentCalendar()?.months?.length, "calendriers du module chargés").to.be.greaterThan(0);
    })
    .its("SimpleCalendar.api");
}

// Notes du calendrier actif (ou d'un autre), en ignorant les entrées déjà supprimées.
function calendarNotes(api, calendarId = "active") {
  return api.getNotes(calendarId).filter(Boolean);
}

// Toutes les notes du module, tous calendriers confondus.
function deleteAllCalendarNotes(win) {
  const notes = win.game.journal.filter((entry) => entry.flags?.[MODULE_ID]?.noteData);
  return win.JournalEntry.deleteDocuments(notes.map((note) => note.id));
}

// Calendrier d'Azhar tel que le module le tient en mémoire.
function qasirah(api) {
  return api.getAllCalendars().find((calendar) => calendar.id === QASIRAH_ID);
}

function qasirahDate(api) {
  const { year, month, day } = qasirah(api).currentDate;
  return [year, month, day];
}

// Retire les Cycles de Qasirah de la liste enregistrée du module ; effectif au chargement suivant.
function removeQasirahCalendar() {
  cy.window().then((win) => {
    const calendars = win.game.settings.get(MODULE_ID, "calendar-configuration") ?? [];
    return setWorldSetting(win, MODULE_ID, "calendar-configuration", calendars.filter((calendar) => calendar?.id !== QASIRAH_ID));
  });
}

before(() => {
  cy.loginAsGM();
  cy.window().then((win) => {
    initialWorldTime = win.game.time.worldTime;
    // Sans la clé du module, pour rendre au monde un réglage où il n'a jamais figuré.
    const { [MODULE_ID]: _ignored, ...others } = win.game.settings.get("core", "moduleConfiguration");
    initialModuleConfiguration = others;
  });
  setModuleConfiguration(() => ({ ...initialModuleConfiguration, [MODULE_ID]: true }));
  cy.loginAsGM();
  calendarApi();
  cy.window().then(async (win) => {
    initialGlobalConfiguration = win.game.settings.get(MODULE_ID, "global-configuration") ?? {};
    await deleteAllCalendarNotes(win);
  });
  // Repart sans calendrier d'Azhar, d'un calendrier d'une autre forme : la macro doit tout poser.
  removeQasirahCalendar();
  cy.loginAsGM();
  calendarApi().then((api) => api.configureCalendar("gregorian"));
});

after(() => {
  cy.loginAsGM();
  calendarApi();
  // Le hook `ready` (re)crée la macro s'il ne la trouve pas : on attend qu'il ait fini avant de la supprimer.
  cy.window({ timeout: 60000 }).its("game.dndCustomAi.contentImported").should("equal", true);
  cy.window().then(async (win) => {
    await deleteAllCalendarNotes(win);
    await win.game.macros.getName(win.game.i18n.localize("DND_CUSTOM.Macros.ConfigureCalendar"))?.delete();
    await setWorldSetting(win, MODULE_ID, "global-configuration", initialGlobalConfiguration);
    await win.game.time.advance(initialWorldTime - win.game.time.worldTime);
  });
  removeQasirahCalendar();
  setModuleConfiguration(() => initialModuleConfiguration);
  // Le module actif recrée son dossier de notes : on le supprime une fois le module éteint.
  cy.loginAsGM();
  cy.window().then(async (win) => {
    const folders = win.game.folders.filter((folder) => folder.type === "JournalEntry" && folder.name === NOTES_FOLDER);
    await win.Folder.deleteDocuments(folders.map((folder) => folder.id));
  });
});

describe("Calendrier du comput et Cycles de Qasirah (Simple Calendar Reborn)", () => {
  beforeEach(() => {
    cy.loginAsGM();
    cy.assertSystemVersionMatches();
  });

  it("le module actif, la macro MJ existe et appelle la configuration (T-CAL-001)", () => {
    calendarApi();
    // La macro est créée pendant le hook `ready`, qui peut encore tourner.
    cy.window({ timeout: 30000 }).should((win) => {
      const macro = win.game.macros.getName(win.game.i18n.localize("DND_CUSTOM.Macros.ConfigureCalendar"));
      expect(macro, "macro « Configurer le calendrier »").to.exist;
      expect(macro.command).to.equal("await game.dndCustomAi.configureCalendar();");
    });
  });

  it("pose les mois, la semaine, la lune, le 1er Reverdie 887 et les fêtes visibles des joueurs (T-CAL-002)", () => {
    calendarApi();
    cy.readFile("scripts/data/calendar.json").as("calendarData");
    cy.window().then(async function (win) {
      const api = win.SimpleCalendar.api;
      const configured = await win.game.dndCustomAi.configureCalendar({ confirm: false });
      expect(configured, "configuration appliquée").to.equal(true);

      const calendar = api.getCurrentCalendar();
      expect(calendar.months.map((month) => month.name)).to.deep.equal(MONTHS);
      expect(calendar.months[12].intercalary, "Jours Muets hors des mois").to.equal(true);
      expect(calendar.months[12].numberOfDays).to.equal(5);
      expect(calendar.weekdays.map((weekday) => weekday.name)).to.deep.equal(WEEKDAYS);
      expect(calendar.weekdays.filter((weekday) => weekday.restday).map((weekday) => weekday.name)).to.deep.equal(["Sixte"]);
      expect(calendar.moons.map((moon) => moon.name)).to.deep.equal(["La Lune"]);

      const now = api.currentDateTime();
      expect([now.year, now.month, now.day], "1er Reverdie 887").to.deep.equal([887, 2, 0]);
      expect(api.getCurrentWeekday().name).to.equal("Prime");

      const notes = calendarNotes(api);
      expect(notes.map((note) => note.name)).to.have.members(this.calendarData.feasts.map((feast) => feast.name));
      const player = win.game.users.find((user) => !user.isGM);
      for (const note of notes) {
        expect(note.testUserPermission(player, "OBSERVER"), `${note.name} visible des joueurs`).to.equal(true);
      }
      expect(api.getNotesForDay(887, 2, 11).filter(Boolean).map((note) => note.name)).to.include("Fête de Sainte Colombe");
    });
  });

  it("crée les Cycles de Qasirah au 13 Bir 769, en dizaines, avec les fêtes azharies (T-CAL-005)", () => {
    calendarApi();
    cy.readFile("scripts/data/calendar-qasirah.json").as("qasirahData");
    cy.window().then(function (win) {
      const api = win.SimpleCalendar.api;
      const calendar = qasirah(api);
      expect(calendar, "calendrier des Cycles de Qasirah").to.exist;
      expect(calendar.name).to.equal("Cycles de Qasirah");
      expect(api.getCurrentCalendar().id, "le comput reste le calendrier actif").to.not.equal(QASIRAH_ID);
      expect(calendar.months.map((month) => month.name)).to.deep.equal(QASIRAH_MONTHS);
      expect(calendar.weekdays.map((weekday) => weekday.name)).to.have.length(10);
      expect(qasirahDate(api), "1er Reverdie 887 = 13 Bir, Cycle 769").to.deep.equal([769, 1, 12]);
      expect(win.game.settings.get(MODULE_ID, "global-configuration").syncCalendars, "calendriers synchronisés").to.equal(true);

      const notes = calendarNotes(api, QASIRAH_ID);
      expect(notes.map((note) => note.name)).to.have.members(this.qasirahData.feasts.map((feast) => feast.name));
      const player = win.game.users.find((user) => !user.isGM);
      for (const note of notes) {
        expect(note.testUserPermission(player, "OBSERVER"), `${note.name} visible des joueurs`).to.equal(true);
      }
    });
  });

  it("les Cycles avancent avec le comput, Jours Muets compris, sous la même lune (T-CAL-006)", () => {
    calendarApi().then((api) => {
      const phases = () => [api.getAllMoons()[0].currentPhase.name, api.getAllMoons(QASIRAH_ID)[0].currentPhase.name];

      api.setDate({ year: 887, month: 2, day: 0, hour: 12, minute: 0, seconds: 0 });
      expect(qasirahDate(api), "1er Reverdie 887").to.deep.equal([769, 1, 12]);
      expect(phases(), "lune presque pleine des deux côtés").to.deep.equal(["Gibbeuse croissante", "Gibbeuse croissante"]);

      api.setDate({ year: 887, month: 12, day: 0, hour: 12, minute: 0, seconds: 0 });
      expect(qasirahDate(api), "1er Jour Muet 887 = 18 Qamar").to.deep.equal([769, 11, 17]);
      expect(phases()).to.deep.equal(["Gibbeuse décroissante", "Gibbeuse décroissante"]);

      api.setDate({ year: 888, month: 0, day: 7, hour: 12, minute: 0, seconds: 0 });
      expect(qasirahDate(api), "8 Bergerie 888 = 1er Hilal, Cycle 770").to.deep.equal([770, 0, 0]);
      expect(phases()).to.deep.equal(["Nouvelle lune", "Nouvelle lune"]);

      api.setDate({ year: 887, month: 2, day: 0, hour: 12, minute: 0, seconds: 0 });
    });
    // Le temps du monde qui passe (repos, horloge) fait aussi avancer les Cycles.
    cy.window().then((win) => win.game.time.advance(86400));
    calendarApi().should((api) => {
      const now = api.currentDateTime();
      expect([now.year, now.month, now.day], "2 Reverdie 887").to.deep.equal([887, 2, 1]);
      expect(qasirahDate(api), "14 Bir 769").to.deep.equal([769, 1, 13]);
    });
  });

  it("chaque mois commence un Prime, Sixte le 12, et la semaine saute les Jours Muets (T-CAL-003)", () => {
    calendarApi().then((api) => {
      const weekdayOn = (year, month, day) => {
        api.setDate({ year, month, day, hour: 12, minute: 0, seconds: 0 });
        return api.getCurrentWeekday().name;
      };
      expect(weekdayOn(887, 2, 11), "12 Reverdie 887").to.equal("Sixte");
      expect(weekdayOn(887, 6, 0), "1er Moisson 887").to.equal("Prime");
      expect(weekdayOn(887, 11, 29), "30 Longuenuit 887").to.equal("Sixte");
      expect(weekdayOn(888, 0, 0), "1er Bergerie 888, après les Jours Muets").to.equal("Prime");
    });
  });

  it("relancée, garde la date du jour, recale les Cycles et n'ajoute rien en double (T-CAL-004)", () => {
    calendarApi().then((api) => {
      api.setDate({ year: 889, month: 6, day: 14, hour: 9, minute: 0, seconds: 0 });
    });
    cy.window().then(async (win) => {
      const api = win.SimpleCalendar.api;
      const computNotes = calendarNotes(api).length;
      const qasirahNotes = calendarNotes(api, QASIRAH_ID).length;
      expect(await win.game.dndCustomAi.configureCalendar({ confirm: false })).to.equal(true);
      const now = api.currentDateTime();
      expect([now.year, now.month, now.day], "15 Moisson 889 conservé").to.deep.equal([889, 6, 14]);
      expect(qasirahDate(api), "15 Moisson 889 = 22 Qafila, Cycle 771").to.deep.equal([771, 6, 21]);
      expect(api.getAllCalendars().filter((calendar) => calendar.id === QASIRAH_ID), "un seul calendrier d'Azhar").to.have.length(1);
      expect(calendarNotes(api).length, "aucune fête du comput en double").to.equal(computNotes);
      expect(calendarNotes(api, QASIRAH_ID).length, "aucune fête azharie en double").to.equal(qasirahNotes);
    });
  });

  it("après rechargement, les Cycles de Qasirah sont toujours là et toujours calés (T-CAL-007)", () => {
    calendarApi().should((api) => {
      expect(qasirah(api), "calendrier enregistré").to.exist;
      const now = api.currentDateTime();
      expect([now.year, now.month, now.day], "date du comput conservée").to.deep.equal([889, 6, 14]);
      expect(qasirahDate(api), "22 Qafila, Cycle 771").to.deep.equal([771, 6, 21]);
    });
  });
});
