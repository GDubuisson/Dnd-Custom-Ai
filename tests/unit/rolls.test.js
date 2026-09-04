// `sheetRollFlags` est la seule partie de rolls.js testable sans stub complet de `Roll`/`game`
// (rollCheck/rollDamage/rollHeal évaluent un vrai `Roll`, natif Foundry, absent de ce stub) :
// une fonction pure, mais son comportement conditionne le style "parchemin déchiré" de TOUTE
// carte de jet du système (cf. .dnd-sheet-roll, dnd-custom-ai.css, et le hook
// renderChatMessageHTML dédié dans dnd-custom-ai.js) — vaut la peine d'être couvert isolément.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { sheetRollFlags } from "../../scripts/helpers/rolls.js";

describe("sheetRollFlags — marqueur des jets générés par le système (cf. .dnd-sheet-roll)", () => {
  test("sans argument : ne pose que sheetRoll", () => {
    assert.deepEqual(sheetRollFlags(), { "dnd-custom-ai": { sheetRoll: true } });
  });

  test("fusionne sheetRoll avec les autres flags déjà posés par l'appelant (ex. damageRoll)", () => {
    const flags = sheetRollFlags({ damageRoll: true, damageType: "fire" });
    assert.deepEqual(flags, { "dnd-custom-ai": { damageRoll: true, damageType: "fire", sheetRoll: true } });
  });

  test("sheetRoll: true l'emporte même si l'appelant le passe explicitement à false", () => {
    // Ne devrait jamais arriver en pratique (aucun appelant du système ne fait ça), mais
    // documente l'intention : ce marqueur n'est jamais désactivable depuis l'appelant.
    const flags = sheetRollFlags({ sheetRoll: false });
    assert.equal(flags["dnd-custom-ai"].sheetRoll, true);
  });
});
