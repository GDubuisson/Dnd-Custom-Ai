import { loadSystemJson } from "./system-json.js";

/** Identifiant du module de calendrier pris en charge. */
export const SIMPLE_CALENDAR_ID = "foundryvtt-simple-calendar-reborn";

/** Valeur de l'API du module pour une note qui revient chaque année. */
const REPEAT_YEARLY = 3;

/** Nom donné au calendrier dans le module. */
const CALENDAR_NAME = "Comput de Velencia";

/** « 06:30 » → secondes depuis minuit. */
function timeToSeconds(time) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 3600 + minutes * 60;
}

/**
 * Position d'un mois dans le calendrier du module : les douze mois, puis les Jours Muets.
 * @param {object} data - contenu de scripts/data/calendar.json
 * @param {string} name
 */
export function monthIndex(data, name) {
  if (name === data.silentDays.name) return data.months.length;
  const index = data.months.findIndex((month) => month.name === name);
  if (index < 0) throw new Error(`Mois inconnu du calendrier : ${name}`);
  return index;
}

/** Date du JSON ({ year, month: nom, day: 1-30 }) → date du module (indices à partir de 0). */
function moduleDate(data, { year, month, day }) {
  return { year, month: monthIndex(data, month), day: day - 1, hour: 0, minute: 0, seconds: 0 };
}

/** Durée des phases : un jour pour les phases ponctuelles, le reste du cycle partagé entre les autres. */
function moonPhases(moon) {
  const singleDays = moon.phases.filter((phase) => phase.singleDay).length;
  const spreadLength = (moon.cycleLength - singleDays) / (moon.phases.length - singleDays);
  return moon.phases.map((phase) => ({ ...phase, length: phase.singleDay ? 1 : spreadLength }));
}

/**
 * Configuration du calendrier pour `SimpleCalendar.api.configureCalendar`.
 * Les réglages généraux et les catégories de notes déjà présents sont conservés.
 * @param {object} data - contenu de scripts/data/calendar.json
 * @param {object} [current] - réglages actuels du calendrier actif
 * @param {object} [current.general]
 * @param {object[]} [current.noteCategories]
 * @param {object|null} [current.currentDate] - date à garder ; sinon, date de départ de la campagne
 */
export function buildCalendarConfig(data, { general = {}, noteCategories = [], currentDate = null } = {}) {
  const start = moduleDate(data, data.startDate);
  const date = currentDate ?? { year: start.year, month: start.month, day: start.day, seconds: 0 };
  const ourCategoryNames = new Set(data.noteCategories.map((category) => category.name));

  const months = data.months.map((month, index) => ({
    name: month.name,
    abbreviation: month.abbreviation,
    description: month.description,
    numericRepresentation: index + 1,
    numericRepresentationOffset: 0,
    numberOfDays: data.daysPerMonth,
    numberOfLeapYearDays: data.daysPerMonth,
    intercalary: false,
    intercalaryInclude: false,
    // Chaque mois compte cinq semaines pleines : il commence toujours un Prime.
    startingWeekday: 1
  }));
  months.push({
    name: data.silentDays.name,
    abbreviation: data.silentDays.abbreviation,
    description: data.silentDays.description,
    numericRepresentation: -1,
    numericRepresentationOffset: 0,
    numberOfDays: data.silentDays.days,
    numberOfLeapYearDays: data.silentDays.days,
    // Hors des mois et hors de la semaine.
    intercalary: true,
    intercalaryInclude: false,
    startingWeekday: null
  });

  const newMoon = moduleDate(data, data.moon.firstNewMoon);

  return {
    name: CALENDAR_NAME,
    currentDate: date,
    general: {
      ...general,
      dateFormat: {
        ...general.dateFormat,
        date: "dddd D MMMM YYYY",
        time: "HH:mm",
        monthYear: "MMMM YYYY",
        chatTime: "D MMM YYYY HH:mm"
      }
    },
    leapYear: { rule: "none", customMod: 0 },
    months,
    weekdays: data.weekdays.map((weekday, index) => ({
      name: weekday.name,
      abbreviation: weekday.abbreviation,
      description: weekday.description ?? "",
      numericRepresentation: index + 1,
      restday: Boolean(weekday.restday)
    })),
    seasons: data.seasons.map((season) => ({
      name: season.name,
      description: "",
      startingMonth: monthIndex(data, season.month),
      startingDay: 0,
      color: season.color,
      icon: season.icon,
      sunriseTime: timeToSeconds(season.sunrise),
      sunsetTime: timeToSeconds(season.sunset)
    })),
    moons: [
      {
        name: data.moon.name,
        cycleLength: data.moon.cycleLength,
        firstNewMoon: { yearReset: "none", yearX: 0, year: newMoon.year, month: newMoon.month, day: newMoon.day },
        phases: moonPhases(data.moon),
        color: data.moon.color,
        cycleDayAdjust: 0.5
      }
    ],
    noteCategories: [
      ...noteCategories.filter((category) => !ourCategoryNames.has(category.name)),
      ...data.noteCategories
    ],
    year: {
      numericRepresentation: date.year,
      prefix: "",
      postfix: "",
      showWeekdayHeadings: true,
      firstWeekday: 0,
      yearZero: 0,
      yearNames: [],
      yearNamingRule: "default",
      yearNamesStart: 0
    }
  };
}

/** Fêtes et foires de l'année : une note par entrée, dans l'année de départ, répétée chaque année. */
export function buildFeastNotes(data) {
  const year = data.startDate.year;
  return data.feasts.map((feast) => ({
    title: feast.name,
    content: feast.content.map((paragraph) => `<p>${paragraph}</p>`).join(""),
    startDate: moduleDate(data, { year, ...feast.start }),
    endDate: moduleDate(data, { year, ...feast.end }),
    categories: [feast.category]
  }));
}

/** Crée la macro MJ « Configurer le calendrier » quand le module de calendrier est actif. */
export async function ensureCalendarMacro() {
  if (!game.user.isGM || !game.modules.get(SIMPLE_CALENDAR_ID)?.active) return;

  const name = game.i18n.localize("DND_CUSTOM.Macros.ConfigureCalendar");
  if (game.macros.getName(name)) return;

  await Macro.create({
    name,
    type: "script",
    scope: "global",
    img: "icons/svg/clockwork.svg",
    command: "await game.dndCustomAi.configureCalendar();"
  });
}

/**
 * Applique le comput au calendrier actif du module et ajoute les fêtes qui manquent.
 * Relancée sur un calendrier déjà configuré, elle garde la date du jour.
 * @param {object} [options]
 * @param {boolean} [options.confirm=true] - demander confirmation au MJ
 * @returns {Promise<boolean>} vrai si le calendrier a été configuré
 */
export async function configureCalendar({ confirm = true } = {}) {
  if (!game.user.isGM) {
    ui.notifications.warn(game.i18n.localize("DND_CUSTOM.Calendar.GmOnly"));
    return false;
  }
  const api = globalThis.SimpleCalendar?.api;
  if (!game.modules.get(SIMPLE_CALENDAR_ID)?.active || !api) {
    ui.notifications.warn(game.i18n.localize("DND_CUSTOM.Calendar.ModuleMissing"));
    return false;
  }
  if (confirm) {
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: game.i18n.localize("DND_CUSTOM.Macros.ConfigureCalendar") },
      content: `<p>${game.i18n.localize("DND_CUSTOM.Calendar.Confirm")}</p>`
    });
    if (!confirmed) return false;
  }

  const data = await loadSystemJson("scripts/data/calendar.json");
  const current = api.getCurrentCalendar() ?? {};
  const alreadyConfigured = current.months?.[0]?.name === data.months[0].name;
  const configured = await api.configureCalendar(
    buildCalendarConfig(data, {
      general: current.general,
      noteCategories: current.noteCategories,
      currentDate: alreadyConfigured ? current.currentDate : null
    })
  );
  if (!configured) {
    ui.notifications.error(game.i18n.localize("DND_CUSTOM.Calendar.Failed"));
    return false;
  }

  const existingTitles = new Set(api.getNotes().filter(Boolean).map((note) => note.name));
  const missing = buildFeastNotes(data).filter((note) => !existingTitles.has(note.title));
  for (const note of missing) {
    const { title, content, startDate, endDate, categories } = note;
    // Note de journée entière, annuelle, visible de tous les joueurs.
    await api.addNote(title, content, startDate, endDate, true, REPEAT_YEARLY, categories, "active", null, ["default"]); // NOSONAR : séquentiel voulu
  }

  ui.notifications.info(game.i18n.format("DND_CUSTOM.Calendar.Done", { notes: missing.length }));
  return true;
}
