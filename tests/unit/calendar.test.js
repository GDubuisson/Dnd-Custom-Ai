import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildCalendarConfig, buildFeastNotes, monthIndex } from "../../scripts/helpers/calendar.js";

const DATA = JSON.parse(readFileSync(new URL("../../scripts/data/calendar.json", import.meta.url), "utf8"));

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

  test("une lune de 29,53 jours, dont les phases couvrent tout le cycle", () => {
    const [moon] = buildCalendarConfig(DATA).moons;
    const total = moon.phases.reduce((sum, phase) => sum + phase.length, 0);
    assert.ok(Math.abs(total - 29.53) < 1e-9, `total ${total}`);
    assert.deepEqual(moon.firstNewMoon, { yearReset: "none", yearX: 0, year: 887, month: 0, day: 0 });
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
