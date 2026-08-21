// L'ordre des imports compte : foundry-stub.js DOIT être importé (pour son effet de bord sur
// globalThis.foundry) avant character-data.js, sans quoi `class CharacterData extends
// foundry.abstract.TypeDataModel` lève une ReferenceError au chargement du module.
import "../support/foundry-stub.js";
import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { setGameStub } from "../support/foundry-stub.js";
import { buildCharacterFixture, buildEquippedItem, ORIGINS, SPELL_SLOT_TABLES } from "../support/fixtures.js";
import { CharacterData } from "../../scripts/data/character-data.js";

/** Exécute la VRAIE méthode de calcul dérivé du système (jamais une réécriture) sur un objet
 *  brut au format du schéma, sans passer par le pipeline Document/DataModel complet de Foundry
 *  (cf. tests/support/foundry-stub.js pour pourquoi c'est possible/suffisant ici). */
function prepare(fixture) {
  CharacterData.prototype.prepareDerivedData.call(fixture);
  return fixture;
}

beforeEach(() => {
  setGameStub({ dndCustomAi: { origins: ORIGINS, spellSlotTables: SPELL_SLOT_TABLES } });
});

describe("CharacterData#prepareDerivedData — caractéristiques", () => {
  test("total = value + bonus d'Origine", () => {
    const fixture = buildCharacterFixture({
      origin: "altenmark", // str +2, con +1 (cf. origins.json)
      abilities: { str: { value: 14, total: 0 }, con: { value: 12, total: 0 } }
    });
    prepare(fixture);
    assert.equal(fixture.abilities.str.total, 16);
    assert.equal(fixture.abilities.con.total, 13);
  });
  test("sans Origine : total = value", () => {
    const fixture = buildCharacterFixture({ abilities: { str: { value: 14, total: 0 } } });
    prepare(fixture);
    assert.equal(fixture.abilities.str.total, 14);
  });

  describe("Don 'Doué' — +1 Charisme fixe, appliqué automatiquement", () => {
    test("avec le don -> +1 Charisme, autres caractéristiques inchangées", () => {
      const fixture = buildCharacterFixture({
        abilities: { cha: { value: 14, total: 0 }, str: { value: 12, total: 0 } },
        items: [{ type: "feature", name: "Doué" }]
      });
      prepare(fixture);
      assert.equal(fixture.abilities.cha.total, 15);
      assert.equal(fixture.abilities.str.total, 12);
    });
    test("sans le don -> aucun bonus", () => {
      const fixture = buildCharacterFixture({ abilities: { cha: { value: 14, total: 0 } } });
      prepare(fixture);
      assert.equal(fixture.abilities.cha.total, 14);
    });
    test("cumulable avec le bonus d'Origine", () => {
      const fixture = buildCharacterFixture({
        origin: "lucentia", // cha +2 (cf. origins.json)
        abilities: { cha: { value: 14, total: 0 } },
        items: [{ type: "feature", name: "Doué" }]
      });
      prepare(fixture);
      assert.equal(fixture.abilities.cha.total, 17); // 14 + 2 (origine) + 1 (don)
    });
  });

  describe("Dons 'Athlète'/'Résilient' — choix de caractéristique posé sur le don lui-même", () => {
    function abilityChoiceFeature(name, chosenAbility) {
      return { type: "feature", name, system: { offersAbilityChoice: true, chosenAbility } };
    }

    test("Athlète, choix réglé -> +1 sur la caractéristique choisie", () => {
      const fixture = buildCharacterFixture({
        abilities: { dex: { value: 14, total: 0 } },
        items: [abilityChoiceFeature("Athlète", "dex")]
      });
      prepare(fixture);
      assert.equal(fixture.abilities.dex.total, 15);
    });

    test("Athlète, choix PAS ENCORE réglé (chosenAbility vide) -> aucun bonus", () => {
      const fixture = buildCharacterFixture({
        abilities: { dex: { value: 14, total: 0 } },
        items: [abilityChoiceFeature("Athlète", "")]
      });
      prepare(fixture);
      assert.equal(fixture.abilities.dex.total, 14);
    });

    test("Résilient, choix réglé -> +1 ET maîtrise de sauvegarde correspondante", () => {
      const fixture = buildCharacterFixture({
        abilities: { wis: { value: 12, total: 0 } },
        items: [abilityChoiceFeature("Résilient", "wis")]
      });
      prepare(fixture);
      assert.equal(fixture.abilities.wis.total, 13);
      assert.equal(fixture.saves.wis.proficient, true);
    });

    test("Résilient ne retire jamais une maîtrise déjà acquise par ailleurs sur une AUTRE caractéristique", () => {
      const fixture = buildCharacterFixture({
        saves: { str: { proficient: true } },
        items: [abilityChoiceFeature("Résilient", "wis")]
      });
      prepare(fixture);
      assert.equal(fixture.saves.str.proficient, true);
    });

    test("les deux dons cumulés sur la MÊME caractéristique -> bonus additionnés (+2)", () => {
      const fixture = buildCharacterFixture({
        abilities: { con: { value: 14, total: 0 } },
        items: [abilityChoiceFeature("Athlète", "con"), abilityChoiceFeature("Résilient", "con")]
      });
      prepare(fixture);
      assert.equal(fixture.abilities.con.total, 16); // 14 + 1 (Athlète) + 1 (Résilient)
      assert.equal(fixture.saves.con.proficient, true); // toujours accordée par Résilient
    });
  });
});

describe("CharacterData#prepareDerivedData — PV max", () => {
  test("guerrier niveau 1, dé d10, CON 14 (+2) -> 12 PV", () => {
    const fixture = buildCharacterFixture({
      class: "fighter",
      attributes: { level: 1 },
      abilities: { con: { value: 14, total: 14 } }
    });
    prepare(fixture);
    assert.equal(fixture.attributes.hp.max, 12);
  });
  test("magicien niveau 1, dé d6, CON 10 (+0) -> 6 PV", () => {
    const fixture = buildCharacterFixture({ class: "wizard", attributes: { level: 1 } });
    prepare(fixture);
    assert.equal(fixture.attributes.hp.max, 6);
  });
  test("exhaustion niveau 4+ : PV max divisés par deux", () => {
    const fixture = buildCharacterFixture({
      class: "fighter",
      attributes: { level: 1, exhaustion: 4 },
      abilities: { con: { value: 14, total: 14 } }
    });
    prepare(fixture);
    assert.equal(fixture.attributes.hp.max, 6); // floor(12/2)
  });

  describe("Don 'Tenace' — +2 PV max par niveau, appliqué automatiquement", () => {
    test("avec le don, niveau 1 -> +2 PV max", () => {
      const fixture = buildCharacterFixture({
        class: "fighter",
        attributes: { level: 1 },
        abilities: { con: { value: 14, total: 14 } },
        items: [{ type: "feature", name: "Tenace" }]
      });
      prepare(fixture);
      assert.equal(fixture.attributes.hp.max, 14); // 12 (base) + 2×1 (Tenace)
    });
    test("avec le don, niveau 5 -> bonus recalculé à 2×niveau, pas figé au niveau d'acquisition", () => {
      const fixture = buildCharacterFixture({
        class: "fighter",
        attributes: { level: 5 },
        abilities: { con: { value: 14, total: 14 } },
        items: [{ type: "feature", name: "Tenace" }]
      });
      prepare(fixture);
      // maxHitPoints(10, 5, 2) = 10+2 + 4×(5+1+2) = 44 ; +2×5 (Tenace) = 54.
      assert.equal(fixture.attributes.hp.max, 54);
    });
    test("sans le don -> aucun bonus, comportement inchangé", () => {
      const fixture = buildCharacterFixture({
        class: "fighter",
        attributes: { level: 1 },
        abilities: { con: { value: 14, total: 14 } }
      });
      prepare(fixture);
      assert.equal(fixture.attributes.hp.max, 12);
    });
    test("exhaustion niveau 4+ : le bonus de Tenace est inclus dans le halving, pas ajouté après", () => {
      const fixture = buildCharacterFixture({
        class: "fighter",
        attributes: { level: 1, exhaustion: 4 },
        abilities: { con: { value: 14, total: 14 } },
        items: [{ type: "feature", name: "Tenace" }]
      });
      prepare(fixture);
      assert.equal(fixture.attributes.hp.max, 7); // floor((12+2)/2)
    });
  });
});

describe("CharacterData#prepareDerivedData — Classe d'Armure", () => {
  test("sans armure : 10 + mod Dex", () => {
    const fixture = buildCharacterFixture({ abilities: { dex: { value: 16, total: 16 } } });
    prepare(fixture);
    assert.equal(fixture.attributes.ac.value, 13);
  });
  test("armure légère équipée : CA armure + dex illimité", () => {
    const armor = buildEquippedItem("armor", { slot: "armor", armorType: "light", baseAC: 11 });
    const fixture = buildCharacterFixture({ abilities: { dex: { value: 18, total: 18 } }, items: [armor] });
    prepare(fixture);
    assert.equal(fixture.attributes.ac.value, 15); // 11 + 4
  });
  test("armure lourde + bouclier équipés : dex ignoré, bouclier additionné", () => {
    const armor = buildEquippedItem("armor", { slot: "armor", armorType: "heavy", baseAC: 16 });
    const shield = buildEquippedItem("armor", { slot: "offHand", baseAC: 2 });
    const fixture = buildCharacterFixture({ abilities: { dex: { value: 20, total: 20 } }, items: [armor, shield] });
    prepare(fixture);
    assert.equal(fixture.attributes.ac.value, 18); // 16 + 0 (lourde) + 2 (bouclier)
  });
  test("armure non équipée : ignorée dans le calcul", () => {
    const armor = { type: "armor", system: { slot: "armor", armorType: "heavy", baseAC: 16, equipped: false } };
    const fixture = buildCharacterFixture({ abilities: { dex: { value: 14, total: 14 } }, items: [armor] });
    prepare(fixture);
    assert.equal(fixture.attributes.ac.value, 12); // 10 + mod dex (+2), armure ignorée
  });

  describe("Défense sans armure (Barbare) — Capacité, appliquée automatiquement", () => {
    const unarmoredDefenseFeature = { type: "feature", name: "Défense sans armure (Barbare)" };

    test("sans armure, avec la Capacité -> 10 + mod Dex + mod Con", () => {
      const fixture = buildCharacterFixture({
        class: "barbarian",
        abilities: { dex: { value: 14, total: 14 }, con: { value: 16, total: 16 } },
        items: [unarmoredDefenseFeature]
      });
      prepare(fixture);
      assert.equal(fixture.attributes.ac.value, 15); // 10 + 2 (dex) + 3 (con)
    });
    test("sans armure, SANS la Capacité -> formule normale (10 + mod Dex), comportement inchangé", () => {
      const fixture = buildCharacterFixture({
        class: "barbarian",
        abilities: { dex: { value: 14, total: 14 }, con: { value: 16, total: 16 } }
      });
      prepare(fixture);
      assert.equal(fixture.attributes.ac.value, 12); // 10 + 2 (dex), pas de bonus Con
    });
    test("armure équipée, avec la Capacité -> la Capacité ne s'applique pas (SRD : sans armure uniquement)", () => {
      const armor = buildEquippedItem("armor", { slot: "armor", armorType: "light", baseAC: 11 });
      const fixture = buildCharacterFixture({
        class: "barbarian",
        abilities: { dex: { value: 14, total: 14 }, con: { value: 16, total: 16 } },
        items: [unarmoredDefenseFeature, armor]
      });
      prepare(fixture);
      assert.equal(fixture.attributes.ac.value, 13); // 11 + 2 (dex), formule d'armure normale
    });
    test("bouclier équipé, avec la Capacité -> le bonus de bouclier s'additionne normalement", () => {
      const shield = buildEquippedItem("armor", { slot: "offHand", baseAC: 2 });
      const fixture = buildCharacterFixture({
        class: "barbarian",
        abilities: { dex: { value: 14, total: 14 }, con: { value: 16, total: 16 } },
        items: [unarmoredDefenseFeature, shield]
      });
      prepare(fixture);
      assert.equal(fixture.attributes.ac.value, 17); // 10 + 2 (dex) + 3 (con) + 2 (bouclier)
    });
  });
});

describe("CharacterData#prepareDerivedData — Vitesse", () => {
  test("vitesse de base sans malus/bonus", () => {
    const fixture = buildCharacterFixture({ class: "wizard" });
    prepare(fixture);
    assert.equal(fixture.attributes.speed, 30);
  });
  test("armure trop lourde pour la Force du personnage : -10", () => {
    const armor = buildEquippedItem("armor", { slot: "armor", armorType: "heavy", baseAC: 16, strengthRequired: 15 });
    const fixture = buildCharacterFixture({
      abilities: { str: { value: 10, total: 10 } },
      items: [armor]
    });
    prepare(fixture);
    assert.equal(fixture.attributes.speed, 20);
  });
  test("barbare niveau 5+ sans armure lourde : +10", () => {
    const fixture = buildCharacterFixture({ class: "barbarian", attributes: { level: 5 } });
    prepare(fixture);
    assert.equal(fixture.attributes.speed, 40);
  });
  test("exhaustion niveau 2 : vitesse divisée par deux (après bonus de classe)", () => {
    const fixture = buildCharacterFixture({ class: "barbarian", attributes: { level: 5, exhaustion: 2 } });
    prepare(fixture);
    assert.equal(fixture.attributes.speed, 20); // (30+10)/2
  });
});

describe("CharacterData#prepareDerivedData — dérivés non persistés", () => {
  test("stealthDisadvantage reflète l'armure équipée", () => {
    const armor = buildEquippedItem("armor", { slot: "armor", armorType: "heavy", baseAC: 16, stealthDisadvantage: true });
    const fixture = buildCharacterFixture({ items: [armor] });
    prepare(fixture);
    assert.equal(fixture.stealthDisadvantage, true);
  });
  test("stealthDisadvantage false sans armure", () => {
    const fixture = buildCharacterFixture({});
    prepare(fixture);
    assert.equal(fixture.stealthDisadvantage, false);
  });
  test("initiativeMod = mod Dex", () => {
    const fixture = buildCharacterFixture({ abilities: { dex: { value: 18, total: 18 } } });
    prepare(fixture);
    assert.equal(fixture.attributes.initiativeMod, 4);
  });

  describe("Don 'Alerte' — +5 Initiative, appliqué automatiquement", () => {
    test("avec le don -> mod Dex + 5", () => {
      const fixture = buildCharacterFixture({
        abilities: { dex: { value: 18, total: 18 } },
        items: [{ type: "feature", name: "Alerte" }]
      });
      prepare(fixture);
      assert.equal(fixture.attributes.initiativeMod, 9); // 4 (dex) + 5 (Alerte)
    });
    test("sans le don -> aucun bonus, comportement inchangé", () => {
      const fixture = buildCharacterFixture({ abilities: { dex: { value: 18, total: 18 } } });
      prepare(fixture);
      assert.equal(fixture.attributes.initiativeMod, 4);
    });
    test("cumulable avec le bonus de sous-classe (Traqueur des ténèbres)", () => {
      const fixture = buildCharacterFixture({
        subclass: "gloomStalker",
        abilities: { dex: { value: 18, total: 18 } },
        items: [{ type: "feature", name: "Alerte" }]
      });
      prepare(fixture);
      assert.equal(fixture.attributes.initiativeMod, 11); // 4 (dex) + 2 (sous-classe) + 5 (Alerte)
    });
  });
});

describe("CharacterData#prepareDerivedData — emplacements de sorts par niveau (1-9)", () => {
  test("classe non lanceuse : tous les paliers à 0, maxLevel = 0, isPactMagic = false", () => {
    const fixture = buildCharacterFixture({ class: "fighter", attributes: { level: 5 } });
    prepare(fixture);
    for (let level = 1; level <= 9; level++) assert.equal(fixture.spells.slots[level].max, 0);
    assert.equal(fixture.spells.maxLevel, 0);
    assert.equal(fixture.spells.isPactMagic, false);
  });
  test("magicien niveau 5 : chaque palier dérivé de fullCaster[5], maxLevel = 3", () => {
    const row = SPELL_SLOT_TABLES.fullCaster["5"];
    const fixture = buildCharacterFixture({ class: "wizard", attributes: { level: 5 } });
    prepare(fixture);
    row.forEach((count, index) => assert.equal(fixture.spells.slots[index + 1].max, count));
    assert.equal(fixture.spells.maxLevel, 3);
    assert.equal(fixture.spells.isPactMagic, false);
  });
  test("occultiste niveau 3 : un seul palier peuplé (Magie de Pacte), isPactMagic = true", () => {
    const pact = SPELL_SLOT_TABLES.warlockPact["3"];
    const fixture = buildCharacterFixture({ class: "warlock", attributes: { level: 3 } });
    prepare(fixture);
    for (let level = 1; level <= 9; level++) {
      assert.equal(fixture.spells.slots[level].max, level === pact.level ? pact.slots : 0);
    }
    assert.equal(fixture.spells.maxLevel, pact.level);
    assert.equal(fixture.spells.isPactMagic, true);
  });
  test("`value` (charges restantes) n'est jamais touché par prepareDerivedData", () => {
    const fixture = buildCharacterFixture({
      class: "wizard",
      attributes: { level: 5 },
      spells: { slots: { 1: { value: 1, max: 0 } } }
    });
    prepare(fixture);
    assert.equal(fixture.spells.slots[1].value, 1);
  });
});
