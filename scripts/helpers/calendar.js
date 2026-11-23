import { loadSystemJson } from "./system-json.js";

/** Identifiant du module de calendrier pris en charge. */
export const SIMPLE_CALENDAR_ID = "foundryvtt-simple-calendar-reborn";

/** Valeur de l'API du module pour une note qui revient chaque année. */
const REPEAT_YEARLY = 3;

/** Nom donné au calendrier du comput dans le module. */
const CALENDAR_NAME = "Comput de Velencia";

/** Réglages du module : liste des calendriers, et réglages communs (synchronisation). */
const CALENDARS_SETTING = "calendar-configuration";
const GLOBAL_SETTING = "global-configuration";

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

/** Position d'un mois des Cycles de Qasirah. */
export function qasirahMonthIndex(qasirah, name) {
  const index = qasirah.months.findIndex((month) => month.name === name);
  if (index < 0) throw new Error(`Mois inconnu des Cycles de Qasirah : ${name}`);
  return index;
}

/** Date du JSON ({ year, month: nom, day: 1-30 }) → date du module (indices à partir de 0). */
function moduleDate(indexOf, { year, month, day }) {
  return { year, month: indexOf(month), day: day - 1, hour: 0, minute: 0, seconds: 0 };
}

/**
 * Jours écoulés depuis le 1er Bergerie de l'an 0, Jours Muets compris.
 * @param {object} data - contenu de scripts/data/calendar.json
 * @param {{year: number, month: number, day: number}} date - date du module (indices à partir de 0)
 */
export function computDayNumber(data, { year, month, day }) {
  const yearLength = data.months.length * data.daysPerMonth + data.silentDays.days;
  return year * yearLength + month * data.daysPerMonth + day;
}

/** Durée d'un mois des Cycles : le dernier prend un jour de plus un Cycle sur `leapEvery`. */
function qasirahMonthLength(qasirah, cycle, index) {
  const month = qasirah.months[index];
  return cycle % qasirah.leapEvery === 0 ? (month.leapDays ?? month.days) : month.days;
}

function qasirahCycleLength(qasirah, cycle) {
  return qasirah.months.reduce((total, _month, index) => total + qasirahMonthLength(qasirah, cycle, index), 0);
}

/** Durée moyenne d'un mois des Cycles, en jours : c'est la durée du cycle de la lune. */
export function qasirahMeanMonth(qasirah) {
  let days = 0;
  for (let cycle = 1; cycle <= qasirah.leapEvery; cycle++) days += qasirahCycleLength(qasirah, cycle);
  return days / (qasirah.leapEvery * qasirah.months.length);
}

/**
 * Date du comput → date des Cycles de Qasirah (indices à partir de 0, comme le module).
 * Le Cycle 1 commence à la date `epoch` du comput ; les Cycles se répètent par blocs de `leapEvery`.
 * @param {object} data - contenu de scripts/data/calendar.json
 * @param {object} qasirah - contenu de scripts/data/calendar-qasirah.json
 * @param {{year: number, month: number, day: number}} computDate
 */
export function computToQasirah(data, qasirah, computDate) {
  const epoch = moduleDate((name) => monthIndex(data, name), qasirah.epoch);
  const elapsed = computDayNumber(data, computDate) - computDayNumber(data, epoch);
  let blockLength = 0;
  for (let cycle = 1; cycle <= qasirah.leapEvery; cycle++) blockLength += qasirahCycleLength(qasirah, cycle);

  const blocks = Math.floor(elapsed / blockLength);
  let rest = elapsed - blocks * blockLength;
  let cycle = 1 + blocks * qasirah.leapEvery;
  while (rest >= qasirahCycleLength(qasirah, cycle)) {
    rest -= qasirahCycleLength(qasirah, cycle);
    cycle += 1;
  }
  let month = 0;
  while (rest >= qasirahMonthLength(qasirah, cycle, month)) {
    rest -= qasirahMonthLength(qasirah, cycle, month);
    month += 1;
  }
  return { year: cycle, month, day: rest };
}

/** Lune du module : un jour pour les phases ponctuelles, le reste du cycle partagé entre les autres. */
function moonConfig(moon, firstNewMoon) {
  const singleDays = moon.phases.filter((phase) => phase.singleDay).length;
  const spreadLength = (moon.cycleLength - singleDays) / (moon.phases.length - singleDays);
  return {
    name: moon.name,
    cycleLength: moon.cycleLength,
    firstNewMoon: { yearReset: "none", yearX: 0, year: firstNewMoon.year, month: firstNewMoon.month, day: firstNewMoon.day },
    phases: moon.phases.map((phase) => ({ ...phase, length: phase.singleDay ? 1 : spreadLength })),
    color: moon.color,
    cycleDayAdjust: 0.5
  };
}

/** Réglages de l'année du module, sans préfixe ni noms d'années. */
function yearConfig(year) {
  return {
    numericRepresentation: year,
    prefix: "",
    postfix: "",
    showWeekdayHeadings: true,
    firstWeekday: 0,
    yearZero: 0,
    yearNames: [],
    yearNamingRule: "default",
    yearNamesStart: 0
  };
}

/** Jours de la semaine (ou de la dizaine) du module. */
function weekdaysConfig(weekdays) {
  return weekdays.map((weekday, index) => ({
    name: weekday.name,
    abbreviation: weekday.abbreviation,
    description: weekday.description ?? "",
    numericRepresentation: index + 1,
    restday: Boolean(weekday.restday)
  }));
}

/** Réglages généraux du MJ, avec nos formats de date. */
function generalConfig(general, dateFormat) {
  return { ...general, dateFormat: { ...general.dateFormat, ...dateFormat } };
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
  const indexOf = (name) => monthIndex(data, name);
  const start = moduleDate(indexOf, data.startDate);
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

  return {
    name: CALENDAR_NAME,
    currentDate: date,
    general: generalConfig(general, {
      date: "dddd D MMMM YYYY",
      time: "HH:mm",
      monthYear: "MMMM YYYY",
      chatTime: "D MMM YYYY HH:mm"
    }),
    leapYear: { rule: "none", customMod: 0 },
    months,
    weekdays: weekdaysConfig(data.weekdays),
    seasons: data.seasons.map((season) => ({
      name: season.name,
      description: "",
      startingMonth: indexOf(season.month),
      startingDay: 0,
      color: season.color,
      icon: season.icon,
      sunriseTime: timeToSeconds(season.sunrise),
      sunsetTime: timeToSeconds(season.sunset)
    })),
    moons: [moonConfig(data.moon, moduleDate(indexOf, data.moon.firstNewMoon))],
    noteCategories: [
      ...noteCategories.filter((category) => !ourCategoryNames.has(category.name)),
      ...data.noteCategories
    ],
    year: yearConfig(date.year)
  };
}

/**
 * Configuration des Cycles de Qasirah, calée sur une date du comput.
 * Les mois suivent la lune ; chaque mois se découpe en trois dizaines (Wahid à Ashara).
 * @param {object} data - contenu de scripts/data/calendar.json
 * @param {object} qasirah - contenu de scripts/data/calendar-qasirah.json
 * @param {object} options
 * @param {{year: number, month: number, day: number, seconds?: number}} options.computDate
 * @param {object} [options.general] - réglages généraux à reprendre
 */
export function buildQasirahConfig(data, qasirah, { computDate, general = {} }) {
  const date = computToQasirah(data, qasirah, computDate);
  return {
    id: qasirah.id,
    name: qasirah.name,
    currentDate: { ...date, seconds: computDate.seconds ?? 0 },
    general: generalConfig(general, {
      date: "D MMMM, Cycle YYYY",
      time: "HH:mm",
      monthYear: "MMMM, Cycle YYYY",
      chatTime: "D MMM, Cycle YYYY HH:mm"
    }),
    leapYear: { rule: "custom", customMod: qasirah.leapEvery, startingYear: 0 },
    months: qasirah.months.map((month, index) => ({
      name: month.name,
      abbreviation: month.abbreviation,
      description: month.description,
      numericRepresentation: index + 1,
      numericRepresentationOffset: 0,
      numberOfDays: month.days,
      numberOfLeapYearDays: month.leapDays ?? month.days,
      intercalary: false,
      intercalaryInclude: false,
      // Chaque mois commence une dizaine.
      startingWeekday: 1
    })),
    weekdays: weekdaysConfig(qasirah.weekdays),
    // Les mois glissent à travers les saisons : pas de saison fixe.
    seasons: [],
    // La même lune que le comput : nouvelle au premier jour du Cycle 1.
    moons: [moonConfig(data.moon, { year: 1, month: 0, day: 0 })],
    noteCategories: qasirah.noteCategories,
    year: yearConfig(date.year)
  };
}

/** Notes annuelles des fêtes d'un calendrier, datées dans l'année `year`. */
function feastNotes(feasts, indexOf, year) {
  return feasts.map((feast) => ({
    title: feast.name,
    content: feast.content.map((paragraph) => `<p>${paragraph}</p>`).join(""),
    startDate: moduleDate(indexOf, { year, ...feast.start }),
    endDate: moduleDate(indexOf, { year, ...feast.end }),
    categories: [feast.category]
  }));
}

/** Fêtes et foires du comput : une note par entrée, dans l'année de départ, répétée chaque année. */
export function buildFeastNotes(data) {
  return feastNotes(data.feasts, (name) => monthIndex(data, name), data.startDate.year);
}

/** Fêtes azharies, datées dans le Cycle où commence la campagne, répétées chaque Cycle. */
export function buildQasirahFeastNotes(data, qasirah) {
  const start = moduleDate((name) => monthIndex(data, name), data.startDate);
  const { year } = computToQasirah(data, qasirah, start);
  return feastNotes(qasirah.feasts, (name) => qasirahMonthIndex(qasirah, name), year);
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

/** Ajoute à un calendrier du module les fêtes qui n'y sont pas encore ; renvoie leur nombre. */
async function addMissingNotes(api, notes, calendarId) {
  const existingTitles = new Set(api.getNotes(calendarId).filter(Boolean).map((note) => note.name));
  const missing = notes.filter((note) => !existingTitles.has(note.title));
  for (const { title, content, startDate, endDate, categories } of missing) {
    // Note de journée entière, annuelle, visible de tous les joueurs.
    await api.addNote(title, content, startDate, endDate, true, REPEAT_YEARLY, categories, calendarId, null, ["default"]); // NOSONAR : séquentiel voulu
  }
  return missing.length;
}

/**
 * Crée les Cycles de Qasirah s'ils n'existent pas (l'API du module ne crée pas de calendrier :
 * on l'ajoute à sa liste enregistrée, qu'il relit aussitôt), sinon les reconfigure.
 */
async function applyQasirahCalendar(api, config) {
  if (!api.getAllCalendars().some((calendar) => calendar.id === config.id)) {
    const calendars = api.getAllCalendars();
    await game.settings.set(SIMPLE_CALENDAR_ID, CALENDARS_SETTING, [...calendars, config]);
    for (let attempt = 0; attempt < 20 && !api.getAllCalendars().some((calendar) => calendar.id === config.id); attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 100)); // NOSONAR : attente du rechargement du module
    }
  }
  // Reconfigure aussi un calendrier tout juste créé : l'enregistrement du module part de sa mémoire.
  return api.configureCalendar(config, config.id);
}

/** Le temps qui passe dans le calendrier actif fait avancer d'autant les autres calendriers. */
async function enableCalendarSync() {
  const global = game.settings.get(SIMPLE_CALENDAR_ID, GLOBAL_SETTING) ?? {};
  if (global.syncCalendars === true && global.calendarsSameTimestamp === false) return;
  await game.settings.set(SIMPLE_CALENDAR_ID, GLOBAL_SETTING, {
    secondsInCombatRound: 6,
    showNotesFolder: false,
    ...global,
    // Chaque calendrier garde sa propre date ; seuls les écarts se propagent.
    calendarsSameTimestamp: false,
    syncCalendars: true
  });
}

/**
 * Applique le comput au calendrier actif du module, crée et cale les Cycles de Qasirah,
 * et ajoute les fêtes qui manquent. Relancée sur un calendrier déjà configuré, elle garde
 * la date du jour (et recale les Cycles dessus).
 * @param {object} [options]
 * @param {boolean} [options.confirm=true] - demander confirmation au MJ
 * @returns {Promise<boolean>} vrai si les calendriers ont été configurés
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
  const qasirah = await loadSystemJson("scripts/data/calendar-qasirah.json");
  const current = api.getCurrentCalendar() ?? {};
  const alreadyConfigured = current.months?.[0]?.name === data.months[0].name;
  const computConfig = buildCalendarConfig(data, {
    general: current.general,
    noteCategories: current.noteCategories,
    currentDate: alreadyConfigured ? current.currentDate : null
  });
  const qasirahConfig = buildQasirahConfig(data, qasirah, {
    computDate: computConfig.currentDate,
    general: computConfig.general
  });

  if (!(await api.configureCalendar(computConfig)) || !(await applyQasirahCalendar(api, qasirahConfig))) {
    ui.notifications.error(game.i18n.localize("DND_CUSTOM.Calendar.Failed"));
    return false;
  }
  await enableCalendarSync();

  const added =
    (await addMissingNotes(api, buildFeastNotes(data), "active")) +
    (await addMissingNotes(api, buildQasirahFeastNotes(data, qasirah), qasirah.id));
  ui.notifications.info(game.i18n.format("DND_CUSTOM.Calendar.Done", { notes: added }));
  return true;
}
