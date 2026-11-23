// Macro MJ « Configurer le calendrier » : applique le comput de Velencia (12 mois, Jours Muets,
// semaine de six jours, lune, fêtes) au module Simple Calendar Reborn.
// Prérequis : le module est copié dans data/Data/modules (cf. tests/E2E_TEST_PLAN.md) ; la spec
// l'active pour ses tests puis le désactive, et supprime les notes et la macro qu'elle a créées.

const MODULE_ID = "foundryvtt-simple-calendar-reborn";

const MONTHS = [
  "Bergerie", "Agnelée", "Reverdie", "Semailles", "Tonte", "Fenaison",
  "Moisson", "Estive", "Vendange", "Dévalée", "Glandée", "Longuenuit", "Jours Muets"
];
const WEEKDAYS = ["Prime", "Seconde", "Tierce", "Quarte", "Quinte", "Sixte"];

// Dossier de journaux que le module crée pour ranger ses notes.
const NOTES_FOLDER = "_simple_calendar_notes_directory";

let initialWorldTime;
let initialModuleConfiguration;

// Écrit le réglage des modules du monde ; prend effet au chargement suivant.
// L'objet est recréé dans la page : un objet de la spec serait vidé par la validation du réglage.
function setModuleConfiguration(configOf) {
  cy.window().then(async (win) => {
    await win.game.settings.set("core", "moduleConfiguration", win.JSON.parse(JSON.stringify(configOf())));
  });
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

// Notes du module, en ignorant les entrées déjà supprimées.
function calendarNotes(api) {
  return api.getNotes().filter(Boolean);
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
  calendarApi().then(async (api) => {
    // Repart d'un calendrier d'une autre forme, sans note : la macro doit tout poser.
    for (const note of calendarNotes(api)) await note.delete(); // NOSONAR : séquentiel voulu
    await api.configureCalendar("gregorian");
  });
});

after(() => {
  cy.loginAsGM();
  calendarApi();
  cy.window().then(async (win) => {
    const api = win.SimpleCalendar?.api;
    if (api) {
      for (const note of calendarNotes(api)) await note.delete(); // NOSONAR : séquentiel voulu
    }
    const macro = win.game.macros.getName(win.game.i18n.localize("DND_CUSTOM.Macros.ConfigureCalendar"));
    if (macro) await macro.delete();
    await win.game.time.advance(initialWorldTime - win.game.time.worldTime);
  });
  setModuleConfiguration(() => initialModuleConfiguration);
  // Le module actif recrée son dossier de notes : on le supprime une fois le module éteint.
  cy.loginAsGM();
  cy.window().then(async (win) => {
    const folders = win.game.folders.filter((folder) => folder.type === "JournalEntry" && folder.name === NOTES_FOLDER);
    await win.Folder.deleteDocuments(folders.map((folder) => folder.id));
  });
});

describe("Calendrier du comput (Simple Calendar Reborn)", () => {
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

  it("relancée, garde la date du jour et n'ajoute pas de fête en double (T-CAL-004)", () => {
    calendarApi().then((api) => {
      api.setDate({ year: 889, month: 6, day: 14, hour: 9, minute: 0, seconds: 0 });
    });
    cy.window().then(async (win) => {
      const api = win.SimpleCalendar.api;
      const before = calendarNotes(api).length;
      expect(await win.game.dndCustomAi.configureCalendar({ confirm: false })).to.equal(true);
      const now = api.currentDateTime();
      expect([now.year, now.month, now.day], "15 Moisson 889 conservé").to.deep.equal([889, 6, 14]);
      expect(calendarNotes(api).length, "aucune fête en double").to.equal(before);
    });
  });
});
