import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  abilityModifier,
  proficiencyBonus,
  levelForXp,
  carryingCapacity,
  carriedWeight,
  carryingCapacityBonus,
  skillModifier,
  toolCheckModifier,
  currencyTotalInCopper,
  formatModifier,
  passivePerception,
  spellSaveDC,
  spellAttackBonus,
  spellSlotsForClass,
  spellSlotFillUpdates,
  SPELL_LEVELS,
  maxHitPoints,
  armorClass,
  armorContribution,
  speedPenalty,
  classSpeedBonus,
  exhaustionSpeed,
  exhaustionMaxHp,
  equipmentSlots,
  isOffHandEligible,
  isProficientWithWeapon,
  weaponAttackDamage,
  hasFeature,
  canUseReaction,
  opportunityAttackTrigger
} from "../../scripts/helpers/rules.js";
import { SPELL_SLOT_TABLES } from "../support/fixtures.js";

describe("canUseReaction (économie d'action, SRD 5e : 1 réaction/round)", () => {
  test("réaction disponible : true", () => {
    assert.equal(canUseReaction({ combat: { reactionAvailable: true } }), true);
  });

  test("réaction déjà consommée ce round-ci : false", () => {
    assert.equal(canUseReaction({ combat: { reactionAvailable: false } }), false);
  });

  test("system.combat absent (donnée pas encore migrée) : disponible par défaut", () => {
    assert.equal(canUseReaction({}), true);
  });
});

describe("opportunityAttackTrigger (le don Sentinelle modifie le déclencheur affiché)", () => {
  const base = "Une créature que vous voyez quitte votre portée d'attaque au corps à corps.";

  test("sans Sentinelle : déclencheur inchangé", () => {
    assert.equal(opportunityAttackTrigger(base, false), base);
  });

  test("avec Sentinelle : déclencheur étendu, mentionne le désengagement et la cible tierce", () => {
    const merged = opportunityAttackTrigger(base, true);
    assert.notEqual(merged, base);
    assert.match(merged, /désengage/);
    assert.match(merged, /cible autre que vous/);
    assert.match(merged, /Sentinelle/);
  });
});

describe("abilityModifier (SRD 5e: floor((score - 10) / 2))", () => {
  const cases = [
    [1, -5], [8, -1], [9, -1], [10, 0], [11, 0], [12, 1],
    [13, 1], [15, 2], [16, 3], [18, 4], [20, 5]
  ];
  for (const [score, expected] of cases) {
    test(`score ${score} -> mod ${expected}`, () => {
      assert.equal(abilityModifier(score), expected);
    });
  }
});

describe("proficiencyBonus (ceil(level/4) + 1)", () => {
  const cases = [[1, 2], [4, 2], [5, 3], [8, 3], [9, 4], [12, 4], [13, 5], [16, 5], [17, 6], [20, 6]];
  for (const [level, expected] of cases) {
    test(`level ${level} -> +${expected}`, () => assert.equal(proficiencyBonus(level), expected));
  }
});

describe("levelForXp (table SRD 5e)", () => {
  test("0 xp = niveau 1", () => assert.equal(levelForXp(0), 1));
  test("juste sous le seuil du niveau 2 = niveau 1", () => assert.equal(levelForXp(299), 1));
  test("pile le seuil du niveau 2 = niveau 2", () => assert.equal(levelForXp(300), 2));
  test("XP énorme plafonne au niveau 20", () => assert.equal(levelForXp(9_999_999), 20));
});

describe("carryingCapacity / carriedWeight / carryingCapacityBonus", () => {
  test("Force 10 en kg = 75 kg (x7.5)", () => assert.equal(carryingCapacity(10, "kg"), 75));
  test("Force 10 en lb = 150 lb (x15)", () => assert.equal(carryingCapacity(10, "lb"), 150));
  test("poids porté = somme(poids unitaire x quantité)", () => {
    const items = [
      { system: { weight: 2, quantity: 3 } },
      { system: { weight: 0.5, quantity: 2 } }
    ];
    assert.equal(carriedWeight(items), 7);
  });
  test("poids porté ignore les objets sans system.weight (0 par défaut)", () => {
    assert.equal(carriedWeight([{ system: {} }]), 0);
  });
  test("bonus de charge : seuls les objets 'gear' équipés comptent", () => {
    const items = [
      { type: "gear", system: { equipped: true, capacityBonus: 20 } },
      { type: "gear", system: { equipped: false, capacityBonus: 20 } },
      { type: "weapon", system: { equipped: true, capacityBonus: 20 } }
    ];
    assert.equal(carryingCapacityBonus(items), 20);
  });
});

describe("skillModifier / toolCheckModifier", () => {
  const system = {
    abilities: { dex: { total: 16 } },
    skills: { stealth: { ability: "dex", proficient: true } }
  };
  test("compétence maîtrisée : mod + bonus de maîtrise", () => {
    assert.equal(skillModifier(system, "stealth", 3), 3 + 3);
  });
  test("compétence non maîtrisée : mod seul", () => {
    const notProficient = { ...system, skills: { stealth: { ability: "dex", proficient: false } } };
    assert.equal(skillModifier(notProficient, "stealth", 3), 3);
  });
  test("compétence inconnue -> 0", () => assert.equal(skillModifier(system, "inconnue", 3), 0));
  test("outil : bonus de maîtrise TOUJOURS appliqué + bonus fixe de l'objet", () => {
    const notProficient = { ...system, skills: { stealth: { ability: "dex", proficient: false } } };
    assert.equal(toolCheckModifier(notProficient, "stealth", 2, 1), 3 + 2 + 1);
  });

  describe("Aptitudes multiples (Barde) : moitié du bonus de maîtrise si non maîtrisé", () => {
    const notProficient = { ...system, skills: { stealth: { ability: "dex", proficient: false } } };
    test("non maîtrisé, sans la Capacité -> mod seul (comportement inchangé)", () => {
      assert.equal(skillModifier(notProficient, "stealth", 3, false), 3);
    });
    test("non maîtrisé, avec la Capacité -> mod + moitié du bonus de maîtrise (arrondi à l'inférieur)", () => {
      assert.equal(skillModifier(notProficient, "stealth", 3, true), 3 + 1); // floor(3/2) = 1
    });
    test("maîtrisé, avec la Capacité -> bonus plein, jamais cumulé avec la moitié", () => {
      assert.equal(skillModifier(system, "stealth", 3, true), 3 + 3);
    });
  });
});

describe("currencyTotalInCopper (1 PP=5000pc, 1 PO=100pc, 1 PA=10pc, 1 PC=1pc)", () => {
  test("mix des 4 dénominations", () => {
    assert.equal(currencyTotalInCopper({ pc: 5, pa: 2, po: 1, pp: 1 }), 5 + 20 + 100 + 5000);
  });
});

describe("formatModifier", () => {
  test("positif préfixé +", () => assert.equal(formatModifier(3), "+3"));
  test("zéro préfixé +", () => assert.equal(formatModifier(0), "+0"));
  test("négatif tel quel", () => assert.equal(formatModifier(-2), "-2"));
});

describe("passivePerception (10 + mod Sag + maîtrise si maîtrisé)", () => {
  test("non maîtrisé", () => assert.equal(passivePerception(2, false, 3), 12));
  test("maîtrisé", () => assert.equal(passivePerception(2, true, 3), 15));
});

describe("spellSaveDC / spellAttackBonus", () => {
  test("DD = 8 + maîtrise + mod", () => assert.equal(spellSaveDC(3, 4), 15));
  test("bonus d'attaque = maîtrise + mod", () => assert.equal(spellAttackBonus(3, 4), 7));
});

function emptySlots() {
  return Object.fromEntries(SPELL_LEVELS.map((level) => [level, 0]));
}

function rowToSlots(row) {
  const slots = emptySlots();
  row.forEach((count, index) => { slots[index + 1] = count; });
  return slots;
}

describe("spellSlotsForClass (emplacements par niveau 1-9, dérivés de spell-slots.json)", () => {
  test("classe non lanceuse -> tous paliers à 0", () => {
    assert.deepEqual(spellSlotsForClass("fighter", 5, SPELL_SLOT_TABLES), {
      slots: emptySlots(),
      maxSpellLevel: 0,
      isPactMagic: false
    });
  });
  test("pas de table (tables undefined) -> tous paliers à 0", () => {
    assert.deepEqual(spellSlotsForClass("wizard", 5, undefined), {
      slots: emptySlots(),
      maxSpellLevel: 0,
      isPactMagic: false
    });
  });
  test("magicien niveau 1 : slots = fullCaster[1] élément par élément, plus haut niveau = 1", () => {
    const row = SPELL_SLOT_TABLES.fullCaster["1"];
    const result = spellSlotsForClass("wizard", 1, SPELL_SLOT_TABLES);
    assert.deepEqual(result.slots, rowToSlots(row));
    assert.equal(result.maxSpellLevel, 1);
    assert.equal(result.isPactMagic, false);
  });
  test("magicien niveau 20 : slots = fullCaster[20], plus haut niveau = dernier index non nul", () => {
    const row = SPELL_SLOT_TABLES.fullCaster["20"];
    let expectedLevel = 0;
    row.forEach((count, index) => { if (count > 0) expectedLevel = index + 1; });
    const result = spellSlotsForClass("wizard", 20, SPELL_SLOT_TABLES);
    assert.deepEqual(result.slots, rowToSlots(row));
    assert.equal(result.maxSpellLevel, expectedLevel);
  });
  test("paladin (demi-lanceur) niveau 1 : table halfCaster tout à zéro -> tous paliers à 0", () => {
    assert.deepEqual(spellSlotsForClass("paladin", 1, SPELL_SLOT_TABLES), {
      slots: emptySlots(),
      maxSpellLevel: 0,
      isPactMagic: false
    });
  });
  test("paladin niveau 5 : slots = halfCaster[5]", () => {
    const row = SPELL_SLOT_TABLES.halfCaster["5"];
    assert.deepEqual(spellSlotsForClass("paladin", 5, SPELL_SLOT_TABLES).slots, rowToSlots(row));
  });
  test("occultiste (Magie de Pacte) : un seul palier peuplé (pact.level -> pact.slots), isPactMagic true", () => {
    for (const level of [1, 3, 11, 20]) {
      const pact = SPELL_SLOT_TABLES.warlockPact[String(level)];
      const expectedSlots = emptySlots();
      expectedSlots[pact.level] = pact.slots;
      assert.deepEqual(spellSlotsForClass("warlock", level, SPELL_SLOT_TABLES), {
        slots: expectedSlots,
        maxSpellLevel: pact.level,
        isPactMagic: true
      });
    }
  });
});

describe("spellSlotFillUpdates (topper tous les paliers au max, création/montée de niveau/repos)", () => {
  test("un objet d'update par palier (1-9), value réglé sur le max courant de ce palier", () => {
    const actor = {
      system: {
        spells: {
          slots: Object.fromEntries(SPELL_LEVELS.map((level) => [level, { value: 0, max: level === 3 ? 2 : 0 }]))
        }
      }
    };
    const updates = spellSlotFillUpdates(actor);
    for (const level of SPELL_LEVELS) {
      assert.equal(updates[`system.spells.slots.${level}.value`], level === 3 ? 2 : 0);
    }
  });

  test("classe non lanceuse (tous les max à 0) -> tous les paliers remis à 0, sans erreur", () => {
    const actor = {
      system: { spells: { slots: Object.fromEntries(SPELL_LEVELS.map((level) => [level, { value: 0, max: 0 }])) } }
    };
    const updates = spellSlotFillUpdates(actor);
    assert.ok(SPELL_LEVELS.every((level) => updates[`system.spells.slots.${level}.value`] === 0));
  });
});

describe("maxHitPoints (méthode 'moyenne' SRD 5e)", () => {
  test("niveau 1 : dé max + mod CON", () => assert.equal(maxHitPoints(10, 1, 2), 12));
  test("niveau 1, mod négatif, mini 1 au total", () => assert.equal(maxHitPoints(6, 1, -5), 1));
  test("plusieurs niveaux : floor(dé/2)+1+mod par niveau suivant", () => {
    // d10, niveau 3, mod CON +2 : 10+2 (niv1) + (5+1+2) (niv2) + (5+1+2) (niv3) = 12+8+8 = 28
    assert.equal(maxHitPoints(10, 3, 2), 28);
  });
  test("par niveau, minimum 1 même avec un gros mod négatif", () => {
    // d6, mod -5 : niveau 1 -> max(1, 6-5)=1 ; niveaux suivants -> max(1, floor(6/2)+1-5) = max(1,-1) = 1
    assert.equal(maxHitPoints(6, 4, -5), 1 + 1 + 1 + 1);
  });
});

describe("armorClass / armorContribution", () => {
  test("sans armure : 10 + mod Dex", () => assert.equal(armorClass(3, null, null, []), 13));
  test("armure légère : CA de base + dex illimité", () => {
    const light = { system: { armorType: "light", baseAC: 11 } };
    assert.equal(armorClass(4, light, null, []), 15);
  });
  test("armure intermédiaire : dex plafonné à +2", () => {
    const medium = { system: { armorType: "medium", baseAC: 13 } };
    assert.equal(armorClass(5, medium, null, []), 15); // 13 + min(5,2)
  });
  test("armure lourde : aucun bonus de dex, même négatif", () => {
    const heavy = { system: { armorType: "heavy", baseAC: 16 } };
    assert.equal(armorClass(-2, heavy, null, []), 16);
  });
  test("bouclier : bonus plat additionnel", () => {
    const shield = { system: { baseAC: 2 } };
    assert.equal(armorClass(3, null, shield, []), 10 + 3 + 2);
  });
  test("accessoires : bonus plat cumulé", () => {
    const accessories = [{ system: { baseAC: 1 } }, { system: { baseAC: 1 } }];
    assert.equal(armorClass(0, null, null, accessories), 10 + 0 + 2);
  });
  test("armorContribution armure du corps = CA de base + dex plafonné", () => {
    assert.equal(armorContribution({ slot: "armor", armorType: "medium", baseAC: 13 }, 5), 15);
  });
  test("armorContribution bouclier/accessoire = bonus plat", () => {
    assert.equal(armorContribution({ slot: "offHand", baseAC: 2 }, 5), 2);
  });

  describe("Défense sans armure du Barbare (unarmoredBonus)", () => {
    test("sans armure, avec unarmoredBonus -> 10 + Dex + bonus", () => {
      assert.equal(armorClass(3, null, null, [], 2), 15); // 10 + 3 + 2 (mod Con)
    });
    test("unarmoredBonus ignoré si une armure est équipée (SRD : Défense sans armure ne s'applique que sans armure)", () => {
      const light = { system: { armorType: "light", baseAC: 11 } };
      assert.equal(armorClass(4, light, null, [], 2), 15); // identique au cas "armure légère" sans bonus
    });
    test("unarmoredBonus omis -> comportement inchangé (0 par défaut)", () => {
      assert.equal(armorClass(3, null, null, []), armorClass(3, null, null, [], 0));
    });
  });
});

describe("hasFeature", () => {
  const items = [
    { type: "feature", name: "Rage" },
    { type: "weapon", name: "Rage" }, // même nom, mauvais type : ne doit pas matcher
    { type: "feature", name: "Ki" }
  ];
  test("Capacité possédée -> true", () => assert.equal(hasFeature(items, "Rage"), true));
  test("Capacité absente -> false", () => assert.equal(hasFeature(items, "Métamagie"), false));
  test("ne matche que le type 'feature', pas un autre Item du même nom", () => {
    assert.equal(hasFeature([{ type: "weapon", name: "Rage" }], "Rage"), false);
  });
});

describe("speedPenalty / classSpeedBonus / exhaustionSpeed / exhaustionMaxHp", () => {
  test("Force insuffisante pour le port de l'armure -> -10", () => assert.equal(speedPenalty(15, 10), 10));
  test("Force suffisante -> aucun malus", () => assert.equal(speedPenalty(15, 15), 0));
  test("pas de Force requise -> aucun malus", () => assert.equal(speedPenalty(0, 1), 0));
  test("barbare niveau 5+ sans armure lourde -> +10", () => assert.equal(classSpeedBonus("barbarian", 5, false, true), 10));
  test("barbare niveau 5+ EN armure lourde -> aucun bonus", () => assert.equal(classSpeedBonus("barbarian", 5, true, true), 0));
  test("barbare niveau 4 -> aucun bonus (pas encore niveau 5)", () => assert.equal(classSpeedBonus("barbarian", 4, false, true), 0));
  test("moine niveau 2-5 sans armure/bouclier -> +10", () => assert.equal(classSpeedBonus("monk", 3, false, false), 10));
  test("moine niveau 18 sans armure/bouclier -> +30", () => assert.equal(classSpeedBonus("monk", 18, false, false), 30));
  test("moine avec armure/bouclier équipé -> aucun bonus", () => assert.equal(classSpeedBonus("monk", 18, false, true), 0));
  test("autre classe -> aucun bonus", () => assert.equal(classSpeedBonus("wizard", 20, false, false), 0));
  test("exhaustion 0-1 : vitesse inchangée", () => assert.equal(exhaustionSpeed(30, 1), 30));
  test("exhaustion 2-4 : vitesse divisée par deux", () => assert.equal(exhaustionSpeed(30, 3), 15));
  test("exhaustion 5+ : vitesse nulle", () => assert.equal(exhaustionSpeed(30, 5), 0));
  test("exhaustion < 4 : PV max inchangés", () => assert.equal(exhaustionMaxHp(40, 3), 40));
  test("exhaustion 4+ : PV max divisés par deux (mini 1)", () => assert.equal(exhaustionMaxHp(40, 4), 20));
  test("exhaustion 4+ mini 1 même pour un petit total", () => assert.equal(exhaustionMaxHp(1, 4), 1));
});

describe("equipmentSlots / isOffHandEligible", () => {
  test("arme à deux mains -> occupe les deux mains, ignore system.slot", () => {
    assert.deepEqual(
      equipmentSlots("weapon", { slot: "mainHand", properties: { handedness: "twoHanded" } }),
      ["mainHand", "offHand"]
    );
  });
  test("arme à une main -> son propre emplacement", () => {
    assert.deepEqual(equipmentSlots("weapon", { slot: "offHand", properties: { handedness: "oneHanded" } }), ["offHand"]);
  });
  test("armure -> son propre emplacement", () => {
    assert.deepEqual(equipmentSlots("armor", { slot: "accessory" }), ["accessory"]);
  });
  test("autre type -> aucun emplacement", () => assert.deepEqual(equipmentSlots("gear", {}), []));
  test("arme légère à une main -> éligible main secondaire", () => {
    assert.equal(isOffHandEligible({ properties: { handedness: "oneHanded", light: true } }), true);
  });
  test("arme non légère -> pas éligible", () => {
    assert.equal(isOffHandEligible({ properties: { handedness: "oneHanded", light: false } }), false);
  });
  test("arme à deux mains -> jamais éligible même si 'light' est vrai", () => {
    assert.equal(isOffHandEligible({ properties: { handedness: "twoHanded", light: true } }), false);
  });
});

describe("isProficientWithWeapon / weaponAttackDamage", () => {
  test("classe sans catégorie couverte -> non maîtrisé", () => {
    assert.equal(isProficientWithWeapon("wizard", "meleeMartial"), false);
  });
  test("classe couvrant la catégorie -> maîtrisé", () => {
    assert.equal(isProficientWithWeapon("fighter", "meleeMartial"), true);
  });
  test("classe vide/inconnue -> maîtrisé par défaut", () => {
    assert.equal(isProficientWithWeapon("", "meleeMartial"), true);
    assert.equal(isProficientWithWeapon("classe-inexistante", "meleeMartial"), true);
  });

  const abilities = { str: { total: 16 }, dex: { total: 14 } }; // str +3, dex +2
  test("arme de corps à corps non-Finesse -> Force", () => {
    const weapon = { weaponType: "meleeMartial", properties: {} };
    assert.deepEqual(weaponAttackDamage(weapon, abilities, 2, true), { abilityMod: 3, attackBonus: 5 });
  });
  test("arme à distance -> toujours Dextérité", () => {
    const weapon = { weaponType: "rangedMartial", properties: {} };
    assert.deepEqual(weaponAttackDamage(weapon, abilities, 2, true), { abilityMod: 2, attackBonus: 4 });
  });
  test("arme Finesse -> le meilleur de Force/Dextérité", () => {
    const weapon = { weaponType: "meleeMartial", properties: { finesse: true } };
    assert.deepEqual(weaponAttackDamage(weapon, abilities, 2, true), { abilityMod: 3, attackBonus: 5 });
    const dexHigher = { str: { total: 10 }, dex: { total: 18 } };
    assert.deepEqual(weaponAttackDamage(weapon, dexHigher, 2, true), { abilityMod: 4, attackBonus: 6 });
  });
  test("non maîtrisé -> bonus de maîtrise non appliqué", () => {
    const weapon = { weaponType: "meleeMartial", properties: {} };
    assert.deepEqual(weaponAttackDamage(weapon, abilities, 2, false), { abilityMod: 3, attackBonus: 3 });
  });
  test("isProficient par défaut = true si omis", () => {
    const weapon = { weaponType: "meleeMartial", properties: {} };
    assert.equal(weaponAttackDamage(weapon, abilities, 2).attackBonus, 5);
  });
});
