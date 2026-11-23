import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildCalendarConfig,
  buildFeastNotes,
  buildQasirahConfig,
  buildQasirahFeastNotes,
  computDayNumber,
  computToQasirah,
  monthIndex,
  qasirahMeanMonth
} from "../../scripts/helpers/calendar.js";

const DATA = JSON.parse(readFileSync(new URL("../../scripts/data/calendar.json", import.meta.url), "utf8"));
const QASIRAH = JSON.parse(readFileSync(new URL("../../scripts/data/calendar-qasirah.json", import.meta.url), "utf8"));

/** Date du comput (jour à partir de 1, mois par son nom) → date du module. */
const comput = (day, month, year) => ({ year, month: monthIndex(DATA, month), day: day - 1 });

describe("scripts/data/calendar.json — le comput de Velencia", () => {
  test("douze mois de trente jours et cinq Jours Muets : 365 jours", () => {
    assert.equal(DATA.months.length, 12);
    assert.equal(new Set(DATA.months.map((month) => month.name)).size, 12);
    assert.equal(DATA.daysPerMonth, 30);
    assert.equal(DATA.silentDays.days, 5);
    assert.equal(DATA.months.length * DATA.daysPerMonth + DATA.silentDays.days, 365);
  });

  test("semaine de six jours, de Prime à Sixte, seule la Sixte chômée ; cinq semaines pleines par mois", () => {
    assert.deepEqual(
      DATA.weekdays.map((weekday) => weekday.name),
      ["Prime", "Seconde", "Tierce", "Quarte", "Quinte", "Sixte"]
    );
    assert.deepEqual(DATA.weekdays.filter((weekday) => weekday.restday).map((weekday) => weekday.name), ["Sixte"]);
    assert.equal(DATA.daysPerMonth % DATA.weekdays.length, 0);
  });

  test("saisons : printemps en Reverdie (3e), été en Fenaison (6e), automne en Vendange (9e), hiver en Longuenuit (12e)", () => {
    assert.deepEqual(
      DATA.seasons.map((season) => [season.name, monthIndex(DATA, season.month) + 1]),
      [["Printemps", 3], ["Été", 6], ["Automne", 9], ["Hiver", 12]]
    );
  });

  test("la campagne commence le 1er Reverdie 887", () => {
    assert.deepEqual(DATA.startDate, { year: 887, month: "Reverdie", day: 1 });
  });

  test("chaque fête a un nom unique, une catégorie connue, un texte et des dates valides", () => {
    const categories = new Set(DATA.noteCategories.map((category) => category.name));
    assert.equal(new Set(DATA.feasts.map((feast) => feast.name)).size, DATA.feasts.length);
    for (const feast of DATA.feasts) {
      assert.ok(categories.has(feast.category), `${feast.name} : catégorie ${feast.category}`);
      assert.ok(feast.content.length && feast.content.every((paragraph) => paragraph.trim()), feast.name);
      for (const bound of [feast.start, feast.end]) {
        const length = bound.month === DATA.silentDays.name ? DATA.silentDays.days : DATA.daysPerMonth;
        assert.doesNotThrow(() => monthIndex(DATA, bound.month), feast.name);
        assert.ok(Number.isInteger(bound.day) && bound.day >= 1 && bound.day <= length, `${feast.name} : jour ${bound.day}`);
      }
      const order = (bound) => monthIndex(DATA, bound.month) * 100 + bound.day;
      assert.ok(order(feast.start) <= order(feast.end), `${feast.name} : fin avant début`);
    }
  });
});

describe("monthIndex — position d'un mois dans le calendrier du module", () => {
  test("les douze mois puis les Jours Muets ; un nom inconnu est refusé", () => {
    assert.equal(monthIndex(DATA, "Bergerie"), 0);
    assert.equal(monthIndex(DATA, "Longuenuit"), 11);
    assert.equal(monthIndex(DATA, "Jours Muets"), 12);
    assert.throws(() => monthIndex(DATA, "Février"), /Février/);
  });
});

describe("buildCalendarConfig — configuration pour Simple Calendar", () => {
  test("douze mois commençant un Prime, puis les Jours Muets hors des mois et de la semaine", () => {
    const { months } = buildCalendarConfig(DATA);
    assert.equal(months.length, 13);
    for (const month of months.slice(0, 12)) {
      assert.equal(month.numberOfDays, 30);
      assert.equal(month.intercalary, false);
      assert.equal(month.startingWeekday, 1);
    }
    assert.deepEqual(
      { name: months[12].name, days: months[12].numberOfDays, intercalary: months[12].intercalary, include: months[12].intercalaryInclude },
      { name: "Jours Muets", days: 5, intercalary: true, include: false }
    );
  });

  test("sans date à garder : départ au 1er Reverdie 887 (indices à partir de 0)", () => {
    const config = buildCalendarConfig(DATA);
    assert.deepEqual(config.currentDate, { year: 887, month: 2, day: 0, seconds: 0 });
    assert.equal(config.year.numericRepresentation, 887);
  });

  test("avec une date à garder : elle est conservée, année comprise", () => {
    const currentDate = { year: 889, month: 7, day: 14, seconds: 43200 };
    const config = buildCalendarConfig(DATA, { currentDate });
    assert.deepEqual(config.currentDate, currentDate);
    assert.equal(config.year.numericRepresentation, 889);
  });

  test("garde les réglages généraux et les catégories du MJ, remplace les nôtres", () => {
    const config = buildCalendarConfig(DATA, {
      general: { gameWorldTimeIntegration: "mixed", showClock: true, dateFormat: { date: "MMMM DD, YYYY", custom: "x" } },
      noteCategories: [
        { name: "Session", color: "#000000", textColor: "#ffffff" },
        { name: "Foi", color: "#ff0000", textColor: "#ffffff" }
      ]
    });
    assert.equal(config.general.gameWorldTimeIntegration, "mixed");
    assert.equal(config.general.showClock, true);
    assert.equal(config.general.dateFormat.custom, "x");
    assert.equal(config.general.dateFormat.date, "dddd D MMMM YYYY");
    assert.deepEqual(
      config.noteCategories.map((category) => [category.name, category.color]),
      [["Session", "#000000"], ...DATA.noteCategories.map((category) => [category.name, category.color])]
    );
  });

  test("semaine : Sixte seul jour chômé ; année sans bissextile", () => {
    const config = buildCalendarConfig(DATA);
    assert.deepEqual(config.weekdays.map((weekday) => weekday.restday), [false, false, false, false, false, true]);
    assert.equal(config.leapYear.rule, "none");
  });

  test("une lune de 29,53 jours (le mois moyen des Cycles), nouvelle au 1er Moisson 141, dont les phases couvrent tout le cycle", () => {
    const [moon] = buildCalendarConfig(DATA).moons;
    assert.ok(Math.abs(moon.cycleLength - qasirahMeanMonth(QASIRAH)) < 1e-12, `cycle ${moon.cycleLength}`);
    assert.equal(moon.cycleLength.toFixed(2), "29.53");
    const total = moon.phases.reduce((sum, phase) => sum + phase.length, 0);
    assert.ok(Math.abs(total - moon.cycleLength) < 1e-9, `total ${total}`);
    assert.deepEqual(moon.firstNewMoon, { yearReset: "none", yearX: 0, year: 141, month: 6, day: 0 });
  });

  test("saisons placées au premier jour de leur mois, lever avant coucher", () => {
    for (const season of buildCalendarConfig(DATA).seasons) {
      assert.equal(season.startingDay, 0);
      assert.ok(season.sunriseTime < season.sunsetTime, season.name);
    }
  });
});

describe("buildFeastNotes — notes annuelles des fêtes", () => {
  test("une note par fête, en HTML, dans l'année de départ", () => {
    const notes = buildFeastNotes(DATA);
    assert.equal(notes.length, DATA.feasts.length);
    for (const note of notes) {
      assert.match(note.content, /^<p>.+<\/p>$/s);
      assert.equal(note.startDate.year, 887);
    }
  });

  test("les Jours Muets couvrent les cinq jours hors des mois ; Sainte Colombe le 12 Reverdie", () => {
    const notes = new Map(buildFeastNotes(DATA).map((note) => [note.title, note]));
    const silent = notes.get("Les Jours Muets");
    assert.deepEqual([silent.startDate.month, silent.startDate.day, silent.endDate.day], [12, 0, 4]);
    const colombe = notes.get("Fête de Sainte Colombe");
    assert.deepEqual([colombe.startDate.month, colombe.startDate.day], [2, 11]);
  });
});

describe("scripts/data/calendar-qasirah.json — les Cycles de Qasirah", () => {
  test("douze mois de 30 et 29 jours en alternance, le dernier à 30 jours un Cycle sur trois", () => {
    assert.equal(QASIRAH.months.length, 12);
    assert.equal(new Set(QASIRAH.months.map((month) => month.name)).size, 12);
    assert.deepEqual(QASIRAH.months.map((month) => month.days), [30, 29, 30, 29, 30, 29, 30, 29, 30, 29, 30, 29]);
    assert.deepEqual(QASIRAH.months.filter((month) => month.leapDays).map((month) => [month.name, month.leapDays]), [["Qamar", 30]]);
    assert.equal(QASIRAH.leapEvery, 3);
  });

  test("mois moyen de 1063/36 jours, et dizaines de Wahid à Ashara", () => {
    assert.ok(Math.abs(qasirahMeanMonth(QASIRAH) - 1063 / 36) < 1e-12);
    assert.deepEqual(QASIRAH.weekdays.map((weekday) => weekday.name), [
      "Wahid", "Ithnan", "Thalatha", "Arbaa", "Khamsa", "Sitta", "Saba", "Thamaniya", "Tisa", "Ashara"
    ]);
  });

  test("chaque fête azharie a un nom unique, la catégorie azharie, un texte et un jour du mois valide", () => {
    const categories = new Set(QASIRAH.noteCategories.map((category) => category.name));
    assert.equal(new Set(QASIRAH.feasts.map((feast) => feast.name)).size, QASIRAH.feasts.length);
    for (const feast of QASIRAH.feasts) {
      assert.ok(categories.has(feast.category), feast.name);
      assert.ok(feast.content.length && feast.content.every((paragraph) => paragraph.trim()), feast.name);
      for (const bound of [feast.start, feast.end]) {
        const month = QASIRAH.months.find((candidate) => candidate.name === bound.month);
        assert.ok(month, `${feast.name} : mois ${bound.month}`);
        assert.ok(bound.day >= 1 && bound.day <= month.days, `${feast.name} : jour ${bound.day}`);
      }
    }
  });
});

describe("computToQasirah — date du comput vers les Cycles de Qasirah", () => {
  test("le 1er Moisson 141 ouvre le Cycle 1", () => {
    assert.deepEqual(computToQasirah(DATA, QASIRAH, comput(1, "Moisson", 141)), { year: 1, month: 0, day: 0 });
    assert.deepEqual(computToQasirah(DATA, QASIRAH, comput(30, "Fenaison", 141)), { year: 0, month: 11, day: 29 });
  });

  test("1er Reverdie 887 : 13 Bir, Cycle 769 ; Sainte Colombe : 24 Bir", () => {
    assert.deepEqual(computToQasirah(DATA, QASIRAH, comput(1, "Reverdie", 887)), { year: 769, month: 1, day: 12 });
    assert.deepEqual(computToQasirah(DATA, QASIRAH, comput(12, "Reverdie", 887)), { year: 769, month: 1, day: 23 });
  });

  test("les Jours Muets de 887 tombent du 18 au 22 Qamar ; le Cycle 770 s'ouvre le 8 Bergerie 888", () => {
    const silent = (day) => ({ year: 887, month: 12, day: day - 1 });
    assert.deepEqual(computToQasirah(DATA, QASIRAH, silent(1)), { year: 769, month: 11, day: 17 });
    assert.deepEqual(computToQasirah(DATA, QASIRAH, silent(5)), { year: 769, month: 11, day: 21 });
    assert.deepEqual(computToQasirah(DATA, QASIRAH, comput(7, "Bergerie", 888)), { year: 769, month: 11, day: 28 });
    assert.deepEqual(computToQasirah(DATA, QASIRAH, comput(8, "Bergerie", 888)), { year: 770, month: 0, day: 0 });
  });

  test("du 30 Longuenuit au 1er Bergerie : six jours, Jours Muets compris", () => {
    assert.equal(computDayNumber(DATA, comput(1, "Bergerie", 888)) - computDayNumber(DATA, comput(30, "Longuenuit", 887)), 6);
  });

  test("sur 900 ans, chaque mois commence à moins d'un jour de la nouvelle lune", () => {
    const epoch = computDayNumber(DATA, comput(1, "Moisson", 141));
    const cycle = qasirahMeanMonth(QASIRAH);
    let worst = 0;
    for (let days = 0; days < 900 * 365; days++) {
      const n = epoch + days;
      const inYear = n % 365;
      const date = computToQasirah(DATA, QASIRAH, { year: Math.floor(n / 365), month: Math.floor(inYear / 30), day: inYear % 30 });
      if (date.day !== 0) continue;
      const age = days % cycle;
      worst = Math.max(worst, Math.min(age, cycle - age));
    }
    assert.ok(worst < 1, `écart maximal ${worst}`);
  });
});

describe("buildQasirahConfig — les Cycles de Qasirah pour Simple Calendar", () => {
  test("calé sur la date du comput, heure comprise ; un Cycle long sur trois", () => {
    const config = buildQasirahConfig(DATA, QASIRAH, { computDate: { ...comput(1, "Reverdie", 887), seconds: 36000 } });
    assert.deepEqual(config.currentDate, { year: 769, month: 1, day: 12, seconds: 36000 });
    assert.deepEqual(config.leapYear, { rule: "custom", customMod: 3, startingYear: 0 });
    assert.deepEqual(config.months.map((month) => month.numberOfLeapYearDays - month.numberOfDays), [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1]);
    assert.ok(config.months.every((month) => month.startingWeekday === 1), "chaque mois commence une dizaine");
    assert.equal(config.weekdays.length, 10);
    assert.deepEqual(config.seasons, []);
    assert.equal(config.year.numericRepresentation, 769);
  });

  test("la même lune que le comput, nouvelle au premier jour du Cycle 1", () => {
    const [moon] = buildQasirahConfig(DATA, QASIRAH, { computDate: comput(1, "Reverdie", 887) }).moons;
    const [computMoon] = buildCalendarConfig(DATA).moons;
    assert.equal(moon.cycleLength, computMoon.cycleLength);
    assert.deepEqual(moon.firstNewMoon, { yearReset: "none", yearX: 0, year: 1, month: 0, day: 0 });
  });

  test("les fêtes azharies sont datées dans le Cycle 769", () => {
    const notes = new Map(buildQasirahFeastNotes(DATA, QASIRAH).map((note) => [note.title, note]));
    assert.equal(notes.size, QASIRAH.feasts.length);
    assert.deepEqual(notes.get("La Nuit du Croissant").startDate, { year: 769, month: 0, day: 0, hour: 0, minute: 0, seconds: 0 });
    const zaynab = notes.get("La Nuit de Zaynab").startDate;
    assert.deepEqual([zaynab.month, zaynab.day], [8, 28]);
  });
});
