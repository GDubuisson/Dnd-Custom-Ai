// sheetRollFlags : marqueur du style de carte de jet du système.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { d20Die, sheetRollFlags } from "../../scripts/helpers/rolls.js";

describe("d20Die — avantage et désavantage s'annulent", () => {
  test("avantage seul", () => assert.equal(d20Die(true, false), "2d20kh1"));
  test("désavantage seul", () => assert.equal(d20Die(false, true), "2d20kl1"));
  test("aucun ou les deux : 1d20", () => {
    assert.equal(d20Die(false, false), "1d20");
    assert.equal(d20Die(true, true), "1d20");
  });
});

describe("sheetRollFlags — marqueur des jets générés par le système (cf. .dnd-sheet-roll)", () => {
  test("sans argument : ne pose que sheetRoll", () => {
    assert.deepEqual(sheetRollFlags(), { "dnd-custom-ai": { sheetRoll: true } });
  });

  test("fusionne sheetRoll avec les autres flags déjà posés par l'appelant (ex. damageRoll)", () => {
    const flags = sheetRollFlags({ damageRoll: true, damageType: "fire" });
    assert.deepEqual(flags, { "dnd-custom-ai": { damageRoll: true, damageType: "fire", sheetRoll: true } });
  });

  test("sheetRoll: true l'emporte même si l'appelant le passe explicitement à false", () => {
    // Le marqueur ne peut pas être désactivé par l'appelant.
    const flags = sheetRollFlags({ sheetRoll: false });
    assert.equal(flags["dnd-custom-ai"].sheetRoll, true);
  });
});
