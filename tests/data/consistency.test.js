import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DND_CUSTOM } from "../../scripts/helpers/config.js";
import {
  ORIGINS,
  SPELL_SLOT_TABLES,
  WORLD_SPELLS,
  WORLD_FEATURES,
  WORLD_WEAPONS,
  WORLD_ARMORS,
  WORLD_GEAR,
  WORLD_TOOLS,
  WORLD_CLASSES,
  WORLD_SUBCLASSES,
  WORLD_ORIGIN_ITEMS,
  WORLD_LANGUAGES,
  WORLD_NPCS,
  WORLD_MOUNTS,
  WORLD_REGIONAL,
  WORLD_HISTORICAL,
  ITEM_LORE,
  GLOSSARY
} from "../support/fixtures.js";
import { LOCALES } from "../support/i18n.js";

const CLASS_KEYS = Object.keys(DND_CUSTOM.classes);
const ABILITY_KEYS = ["str", "dex", "con", "int", "wis", "cha"];
const SKILL_KEYS = Object.keys(DND_CUSTOM.skills);

describe("config.js — chaque classe a une entrée dans toutes les tables par classe", () => {
  for (const key of CLASS_KEYS) {
    test(`${key} : classHitDice / classSkillChoices / classSavingThrows / classWeaponProficiencies / classStartingEquipment`, () => {
      assert.ok(DND_CUSTOM.classHitDice[key] > 0, "classHitDice manquant");
      assert.ok(DND_CUSTOM.classSkillChoices[key] > 0, "classSkillChoices manquant");
      assert.ok(Array.isArray(DND_CUSTOM.classSavingThrows[key]) && DND_CUSTOM.classSavingThrows[key].length === 2, "classSavingThrows doit avoir exactement 2 caractéristiques (SRD 5e)");
      assert.ok(Array.isArray(DND_CUSTOM.classWeaponProficiencies[key]), "classWeaponProficiencies manquant");
      assert.ok(key in DND_CUSTOM.classStartingEquipment, "classStartingEquipment manquant");
    });
  }

  test("classSavingThrows ne référence que des clés de caractéristique valides", () => {
    for (const saves of Object.values(DND_CUSTOM.classSavingThrows)) {
      for (const key of saves) assert.ok(ABILITY_KEYS.includes(key), `caractéristique invalide : ${key}`);
    }
  });
});

describe("config.js — classes lanceuses de sorts", () => {
  test("spellcastingClasses est un sous-ensemble de DND_CUSTOM.classes", () => {
    for (const key of DND_CUSTOM.spellcastingClasses) assert.ok(CLASS_KEYS.includes(key));
  });
  test("chaque classe lanceuse a une caractéristique d'incantation", () => {
    for (const key of DND_CUSTOM.spellcastingClasses) {
      assert.ok(ABILITY_KEYS.includes(DND_CUSTOM.spellcastingAbility[key]), `manquante pour ${key}`);
    }
  });
});

describe("config.js — XP et niveaux", () => {
  test("xpThresholds a 20 entrées (niveaux 1 à 20), strictement croissantes", () => {
    assert.equal(DND_CUSTOM.xpThresholds.length, 20);
    for (let i = 1; i < DND_CUSTOM.xpThresholds.length; i++) {
      assert.ok(DND_CUSTOM.xpThresholds[i] > DND_CUSTOM.xpThresholds[i - 1], `seuil non croissant à l'index ${i}`);
    }
  });
  test("abilityScoreImprovementLevels : niveaux valides (1-20), triés", () => {
    for (const level of DND_CUSTOM.abilityScoreImprovementLevels) assert.ok(level >= 1 && level <= 20);
    const sorted = [...DND_CUSTOM.abilityScoreImprovementLevels].sort((a, b) => a - b);
    assert.deepEqual(DND_CUSTOM.abilityScoreImprovementLevels, sorted);
  });
  test("challengeRatingXp a exactement les mêmes clés que challengeRatings", () => {
    // Comparaison d'ensembles : Object.keys() réordonne les clés numériques.
    assert.deepEqual(new Set(Object.keys(DND_CUSTOM.challengeRatingXp)), new Set(DND_CUSTOM.challengeRatings));
  });
});

describe("scripts/data/origins.json", () => {
  const entries = Object.entries(ORIGINS);
  test("au moins une Origine chargée", () => assert.ok(entries.length > 0));

  for (const [key, origin] of entries) {
    test(`${key} : bonus de caractéristiques totalisent +3 (convention du système)`, () => {
      const total = ABILITY_KEYS.reduce((sum, ability) => sum + (origin.abilityBonuses[ability] ?? 0), 0);
      assert.equal(total, 3, `Origine ${key} totalise ${total}, attendu 3`);
    });
    test(`${key} : compétences avantagées valides`, () => {
      for (const skill of origin.skillAdvantages) assert.ok(SKILL_KEYS.includes(skill), `compétence invalide : ${skill}`);
    });
    test(`${key} : trait spécial nommé et décrit`, () => {
      assert.ok(origin.specialTrait?.name?.length > 0);
      assert.ok(origin.specialTrait?.description?.length > 0);
    });
    // conditionalBonus référence une compétence et une caractéristique réelles.
    if (origin.specialTrait?.conditionalBonus) {
      test(`${key} : conditionalBonus référence une compétence/caractéristique valides`, () => {
        const { skill, ability } = origin.specialTrait.conditionalBonus;
        assert.ok(SKILL_KEYS.includes(skill), `compétence invalide : ${skill}`);
        assert.ok(ABILITY_KEYS.includes(ability), `caractéristique invalide : ${ability}`);
      });
    }
  }
});

describe("scripts/data/spell-slots.json", () => {
  test("fullCaster couvre les niveaux 1 à 20 avec 9 paliers (sorts niveau 1 à 9)", () => {
    for (let level = 1; level <= 20; level++) {
      const row = SPELL_SLOT_TABLES.fullCaster[String(level)];
      assert.ok(Array.isArray(row) && row.length === 9, `niveau ${level} : ligne invalide`);
    }
  });
  test("halfCaster (Paladin) couvre les niveaux 1 à 20 avec 5 paliers (plafonné aux sorts de niveau 5, SRD 5e)", () => {
    for (let level = 1; level <= 20; level++) {
      const row = SPELL_SLOT_TABLES.halfCaster[String(level)];
      assert.ok(Array.isArray(row) && row.length === 5, `niveau ${level} : ligne invalide`);
    }
  });
  test("warlockPact couvre les niveaux 1 à 20 avec {slots, level}", () => {
    for (let level = 1; level <= 20; level++) {
      const entry = SPELL_SLOT_TABLES.warlockPact[String(level)];
      assert.ok(entry.slots > 0 && entry.level >= 1 && entry.level <= 5, `niveau ${level} invalide`);
    }
  });
  test("fullCaster progresse au moins aussi vite que halfCaster à chaque niveau (même palier)", () => {
    for (let level = 1; level <= 20; level++) {
      const full = SPELL_SLOT_TABLES.fullCaster[String(level)];
      const half = SPELL_SLOT_TABLES.halfCaster[String(level)];
      const fullTotal = full.reduce((a, b) => a + b, 0);
      const halfTotal = half.reduce((a, b) => a + b, 0);
      assert.ok(fullTotal >= halfTotal, `niveau ${level} : lanceur complet (${fullTotal}) < demi-lanceur (${halfTotal})`);
    }
  });
});

describe("world-items/spells.json — cohérence avec le schéma simplifié (SpellData)", () => {
  const OBSOLETE_FIELDS = ["school", "components", "castingTime", "range", "duration", "prepared"];
  for (const spell of WORLD_SPELLS) {
    test(`${spell.name} : pas de champ obsolète (école/composantes/temps/portée/durée séparés)`, () => {
      for (const field of OBSOLETE_FIELDS) {
        assert.ok(!(field in spell.system), `champ obsolète "${field}" présent sur "${spell.name}"`);
      }
    });
    test(`${spell.name} : niveau 0-9, classes non vide, ne référence que des clés de classe réelles`, () => {
      assert.ok(spell.system.level >= 0 && spell.system.level <= 9);
      // system.classes : clés de classe stables (tableau brut en JSON).
      assert.ok(spell.system.classes.length > 0, `"${spell.name}" ne liste aucune classe`);
      for (const key of spell.system.classes) {
        assert.ok(CLASS_KEYS.includes(key), `"${spell.name}" référence une clé de classe inconnue : "${key}"`);
      }
    });
  }
});

// Tout sort dont la description mentionne un soin en PV doit avoir un dé de soin.
describe("world-items/spells.json — sorts de soin (system.heal)", () => {
  const HEAL_DESCRIPTION_PATTERN = /récupère.*points? de vie/i;

  test("les 3 sorts de soin connus ont bien un dé de soin configuré", () => {
    const healers = { "Soin des blessures": "1d8", "Mot de guérison": "1d4", "Soins de groupe": "3d8" };
    for (const [name, expectedDice] of Object.entries(healers)) {
      const spell = WORLD_SPELLS.find((entry) => entry.name === name);
      assert.ok(spell, `sort "${name}" introuvable`);
      assert.equal(spell.system.heal?.dice, expectedDice, `"${name}" : dé de soin attendu "${expectedDice}"`);
    }
  });

  test("aucun sort dont la description décrit un soin en PV ne reste sans dé de soin configuré", () => {
    for (const spell of WORLD_SPELLS) {
      if (!HEAL_DESCRIPTION_PATTERN.test(spell.system.description)) continue;
      assert.ok(
        spell.system.heal?.dice,
        `"${spell.name}" décrit un soin en PV dans sa description mais n'a pas de system.heal.dice configuré`
      );
    }
  });
});

describe("world-items/features.json — cohérence (FeatureData)", () => {
  const ALL_SUBCLASS_KEYS = new Set(Object.values(DND_CUSTOM.subclasses).flatMap((byKey) => Object.keys(byKey)));
  for (const feature of WORLD_FEATURES) {
    test(`${feature.name} : clé de classe réelle (ou universelle), niveau >= 1`, () => {
      // system.class : clé stable ; une Capacité universelle n'a pas de classe.
      if (feature.system.universal) {
        assert.equal(feature.system.class, "", `"${feature.name}" est universelle : le champ classe devrait rester vide`);
      } else {
        assert.ok(CLASS_KEYS.includes(feature.system.class), `"${feature.name}" référence une clé de classe inconnue : "${feature.system.class}"`);
      }
      assert.ok((feature.system.level ?? 1) >= 1);
    });
    if (feature.system.subclass) {
      test(`${feature.name} : clé de sous-classe réelle`, () => {
        assert.ok(
          ALL_SUBCLASS_KEYS.has(feature.system.subclass),
          `"${feature.name}" référence une clé de sous-classe inconnue : "${feature.system.subclass}"`
        );
      });
    }
  }
});

describe("world-items/features.json et spells.json — activation valide si renseignée (FeatureData/SpellData#activation)", () => {
  const ACTIVATION_KEYS = new Set(Object.keys(DND_CUSTOM.activationTypes));
  for (const item of [...WORLD_FEATURES, ...WORLD_SPELLS]) {
    if (!("activation" in item.system)) continue;
    test(`${item.name} : activation "${item.system.activation}" valide`, () => {
      assert.ok(ACTIVATION_KEYS.has(item.system.activation), `activation invalide sur "${item.name}"`);
    });
  }
});

// requiresState doit référencer un état existant (sinon bouton désactivé en permanence).
describe("world-items/features.json — requiresState référence un état réel (FeatureData)", () => {
  const CONDITION_IDS = new Set(DND_CUSTOM.conditions.map((condition) => condition.id));
  for (const feature of WORLD_FEATURES) {
    if (!feature.system.requiresState) continue;
    test(`${feature.name} : requiresState "${feature.system.requiresState}" référence un état réel`, () => {
      assert.ok(CONDITION_IDS.has(feature.system.requiresState), `état invalide sur "${feature.name}"`);
    });
  }

  test("Frénésie référence bien l'état \"raging\" (régression)", () => {
    const frenzy = WORLD_FEATURES.find((feature) => feature.name === "Frénésie");
    assert.equal(frenzy?.system.requiresState, "raging");
  });
});

describe("world-items/*.json — objets physiques (armes/armures/objets/outils)", () => {
  const collections = { weapons: WORLD_WEAPONS, armors: WORLD_ARMORS, gear: WORLD_GEAR, tools: WORLD_TOOLS };
  for (const [label, entries] of Object.entries(collections)) {
    test(`${label} : au moins une entrée, chacune avec name/type/system`, () => {
      assert.ok(entries.length > 0);
      for (const entry of entries) {
        assert.ok(entry.name?.length > 0);
        assert.ok(entry.type?.length > 0);
        assert.ok(typeof entry.system === "object");
      }
    });
  }
  test("armes/armures dans world-items ne portent pas de nom en double au sein d'un même fichier", () => {
    for (const [label, entries] of Object.entries(collections)) {
      const names = entries.map((entry) => entry.name);
      assert.equal(new Set(names).size, names.length, `doublon de nom détecté dans ${label}`);
    }
  });
});

// Champs mécaniques des objets physiques : valeurs cohérentes avec leur schéma.
describe("world-items — champs mécaniques des armes, armures et objets", () => {
  const damageTypes = Object.keys(DND_CUSTOM.damageTypes);
  const affinityFields = ["damageResistances", "damageImmunities", "damageVulnerabilities"];
  const checkAffinities = (entry) => {
    for (const field of affinityFields) {
      for (const type of entry.system[field] ?? []) assert.ok(damageTypes.includes(type), `${entry.name} : ${field} "${type}"`);
    }
  };

  const extra = [...WORLD_REGIONAL, ...WORLD_HISTORICAL];
  for (const weapon of [...WORLD_WEAPONS, ...extra.filter((entry) => entry.type === "weapon")]) {
    test(`${weapon.name} : bonus magique 0-3, magique si bonus, dégâts secondaires et affinités valides`, () => {
      const enhancement = weapon.system.enhancement ?? 0;
      assert.ok(Number.isInteger(enhancement) && enhancement >= 0 && enhancement <= 3);
      if (enhancement > 0) assert.equal(weapon.system.magic, true);
      if (weapon.system.secondaryDamage?.dice) assert.ok(damageTypes.includes(weapon.system.secondaryDamage.type));
      checkAffinities(weapon);
    });
  }
  for (const armor of [...WORLD_ARMORS, ...extra.filter((entry) => entry.type === "armor")]) {
    test(`${armor.name} : emplacement, bonus de sauvegarde et affinités valides`, () => {
      assert.ok(["armor", "offHand", "accessory"].includes(armor.system.slot));
      const saveBonus = armor.system.saveBonus ?? 0;
      assert.ok(Number.isInteger(saveBonus) && saveBonus >= 0);
      if (armor.system.unarmoredOnly) assert.equal(armor.system.slot, "accessory");
      checkAffinities(armor);
    });
  }
  for (const gear of [...WORLD_GEAR, ...extra].filter((entry) => entry.type === "gear" && entry.system.use?.type === "heal")) {
    test(`${gear.name} : soin bien formé (dés NdM, compétence valide ou vide)`, () => {
      const use = gear.system.use;
      if (use.healDice) assert.match(use.healDice, /^\d+d\d+$/);
      if (use.healSkill) assert.ok(Object.hasOwn(DND_CUSTOM.skills, use.healSkill));
    });
  }
});

// Armures lourdes SRD 5.1 : CA, Force requise et prix de référence (Broigne = ring mail, Cotte de mailles = chain mail).
describe("world-items/armors.json — armures lourdes conformes au SRD", () => {
  const expected = {
    Broigne: { baseAC: 14, strengthRequired: 0, po: 30 },
    "Cotte de mailles": { baseAC: 16, strengthRequired: 13, po: 75 },
    Plates: { baseAC: 17, strengthRequired: 15, po: 200 },
    Harnois: { baseAC: 18, strengthRequired: 15, po: 1500 }
  };
  for (const [name, ref] of Object.entries(expected)) {
    test(`${name} : CA ${ref.baseAC}, Force ${ref.strengthRequired}, ${ref.po} po`, () => {
      const armor = WORLD_ARMORS.find((entry) => entry.name === name);
      assert.ok(armor, `${name} introuvable`);
      assert.equal(armor.system.baseAC, ref.baseAC);
      assert.equal(armor.system.strengthRequired, ref.strengthRequired);
      assert.equal(armor.system.price.po, ref.po);
    });
  }
});

// Objets régionaux et pièces historiques : région, absence d'effet pour l'historique, histoire au journal.
describe("world-items/regional.json et historical.json — régions, pièces historiques, histoires", () => {
  const physicalTypes = ["weapon", "armor", "gear", "tool"];
  const all = [...WORLD_REGIONAL, ...WORLD_HISTORICAL];
  const loreNames = new Set(ITEM_LORE.map((entry) => entry.name));

  test("aucun nom en double, tous fichiers d'objets du monde confondus", () => {
    const names = [...WORLD_WEAPONS, ...WORLD_ARMORS, ...WORLD_GEAR, ...WORLD_TOOLS, ...all].map((entry) => entry.name);
    const duplicates = names.filter((name, index) => names.indexOf(name) !== index);
    assert.deepEqual(duplicates, []);
  });
  for (const entry of all) {
    test(`${entry.name} : type physique, région valide, histoire au journal`, () => {
      assert.ok(physicalTypes.includes(entry.type));
      assert.ok(Object.hasOwn(DND_CUSTOM.regions, entry.flags?.["dnd-custom-ai"]?.region));
      assert.ok(loreNames.has(entry.name), `aucune histoire pour ${entry.name}`);
    });
  }
  for (const entry of WORLD_HISTORICAL) {
    test(`${entry.name} : pièce historique sans bonus ni effet`, () => {
      const system = entry.system;
      assert.ok(!system.magic && !system.enhancement && !system.secondaryDamage?.dice);
      assert.ok(!system.saveBonus && !system.useEffect?.bonus);
      assert.ok(!system.use || system.use.type === "none");
      for (const field of ["damageResistances", "damageImmunities", "damageVulnerabilities"]) {
        assert.equal((system[field] ?? []).length, 0);
      }
    });
  }
  test("chaque histoire correspond à un objet et n'est pas vide", () => {
    const itemNames = new Set(all.map((entry) => entry.name));
    for (const entry of ITEM_LORE) {
      assert.ok(itemNames.has(entry.name), `histoire orpheline : ${entry.name}`);
      assert.ok(entry.lore.trim().length > 0);
    }
  });
});

// Chaque outil est lié à une compétence réelle, sans quoi son bouton « Utiliser » ne fait rien.
describe("world-items/tools.json — compétence liée (ToolData#useEffect)", () => {
  const allTools = [...WORLD_TOOLS, ...WORLD_REGIONAL, ...WORLD_HISTORICAL].filter((entry) => entry.type === "tool");
  for (const tool of allTools) {
    test(`${tool.name} : compétence "${tool.system.useEffect.skill}" valide`, () => {
      assert.ok(Object.hasOwn(DND_CUSTOM.skills, tool.system.useEffect.skill));
    });
  }
});

// Montures et véhicules (compendium « montures-vehicules ») : blocs SRD et véhicules cohérents.
describe("world-items/mounts.json — montures (Actor mount) et véhicules (Actor vehicle)", () => {
  const SIZE_KEYS = new Set(Object.keys(DND_CUSTOM.sizes));
  const CR_KEYS = new Set(DND_CUSTOM.challengeRatings);
  const systemJson = JSON.parse(readFileSync(new URL("../../system.json", import.meta.url), "utf8"));

  test("compendium déclaré dans system.json (Actor, visible des joueurs)", () => {
    const pack = systemJson.packs.find((entry) => entry.name === "montures-vehicules");
    assert.ok(pack, "compendium 'montures-vehicules' absent de system.json");
    assert.equal(pack.type, "Actor");
    assert.equal(pack.ownership.PLAYER, "OBSERVER");
  });

  test("uniquement des montures et des véhicules, sans doublon de nom", () => {
    assert.ok(WORLD_MOUNTS.length > 0);
    for (const entry of WORLD_MOUNTS) assert.ok(["mount", "vehicle"].includes(entry.type), `type inattendu : ${entry.name}`);
    const names = WORLD_MOUNTS.map((entry) => entry.name);
    assert.equal(new Set(names).size, names.length);
  });

  for (const mount of WORLD_MOUNTS.filter((entry) => entry.type === "mount")) {
    test(`${mount.name} : bête réelle, FI/XP SRD, taille valide, attaque à la Force`, () => {
      const system = mount.system;
      assert.equal(system.creatureType, "beast");
      assert.ok(SIZE_KEYS.has(system.size));
      assert.ok(CR_KEYS.has(system.challengeRating));
      assert.equal(system.xpReward, DND_CUSTOM.challengeRatingXp[system.challengeRating]);
      assert.ok(system.attributes.hp.max > 0 && system.attributes.ac.value > 0 && system.attributes.speed > 0);
      assert.ok(system.attacks.length > 0 && system.attacks.every((attack) => attack.ability === "str"));
      assert.match(system.particularity, /^Prix : /, "prix indiqué en tête de la particularité");
    });
  }

  for (const vehicle of WORLD_MOUNTS.filter((entry) => entry.type === "vehicle")) {
    test(`${vehicle.name} : PV, vitesse et capacité positifs, prix en description`, () => {
      const system = vehicle.system;
      assert.ok(system.attributes.hp.max > 0 && system.attributes.hp.value === system.attributes.hp.max);
      assert.ok(system.attributes.speed > 0 && Number.isInteger(system.attributes.speed));
      assert.ok(system.carryCapacity > 0);
      assert.match(system.description, /^Prix : /);
    });
  }
});

// Bestiaire (compendium « adversaires ») : schéma NpcData et butin embarqué valides.
describe("world-items/npcs.json — cohérence (NpcData) + butin embarqué", () => {
  const CREATURE_TYPE_KEYS = new Set(Object.keys(DND_CUSTOM.creatureTypes));
  const SIZE_KEYS = new Set(Object.keys(DND_CUSTOM.sizes));
  const DAMAGE_TYPE_KEYS = new Set(Object.keys(DND_CUSTOM.damageTypes));
  const CR_KEYS = new Set(DND_CUSTOM.challengeRatings);

  test("au moins une entrée, aucun nom en double", () => {
    assert.ok(WORLD_NPCS.length > 0);
    const names = WORLD_NPCS.map((npc) => npc.name);
    assert.equal(new Set(names).size, names.length, "doublon de nom détecté dans npcs.json");
  });

  // Bestiaire limité aux humanoïdes et aux bêtes réelles.
  test("seuls les types de créature \"humanoid\" et \"beast\" sont présents (aucune créature fantastique)", () => {
    for (const npc of WORLD_NPCS) {
      assert.ok(
        ["humanoid", "beast"].includes(npc.system.creatureType),
        `"${npc.name}" a un type de créature hors scope : "${npc.system.creatureType}"`
      );
    }
  });

  for (const npc of WORLD_NPCS) {
    test(`${npc.name} : type de créature/taille/FI valides, PV/CA positifs`, () => {
      assert.ok(CREATURE_TYPE_KEYS.has(npc.system.creatureType), `creatureType invalide sur "${npc.name}"`);
      assert.ok(SIZE_KEYS.has(npc.system.size), `size invalide sur "${npc.name}"`);
      assert.ok(CR_KEYS.has(npc.system.challengeRating), `challengeRating invalide sur "${npc.name}"`);
      assert.equal(
        npc.system.xpReward,
        DND_CUSTOM.challengeRatingXp[npc.system.challengeRating],
        `xpReward de "${npc.name}" ne correspond pas à la table SRD pour le FI ${npc.system.challengeRating}`
      );
      assert.ok(npc.system.attributes.hp.max > 0, `PV max de "${npc.name}" doit être positif`);
      assert.ok(npc.system.attributes.ac.value > 0, `CA de "${npc.name}" doit être positive`);
    });

    test(`${npc.name} : les 6 caractéristiques sont renseignées`, () => {
      for (const key of ABILITY_KEYS) {
        assert.ok(typeof npc.system.abilities[key]?.mod === "number", `caractéristique "${key}" manquante sur "${npc.name}"`);
      }
    });

    test(`${npc.name} : au moins une attaque, types de dégâts valides`, () => {
      assert.ok(npc.system.attacks.length > 0, `"${npc.name}" n'a aucune attaque configurée`);
      for (const attack of npc.system.attacks) {
        assert.ok(["str", "dex"].includes(attack.ability), `ability d'attaque invalide sur "${npc.name}"`);
        if (attack.damage.type) assert.ok(DAMAGE_TYPE_KEYS.has(attack.damage.type), `type de dégâts invalide sur "${npc.name}"`);
        if (attack.secondaryDamage.type) {
          assert.ok(DAMAGE_TYPE_KEYS.has(attack.secondaryDamage.type), `type de dégâts secondaire invalide sur "${npc.name}"`);
        }
      }
    });

    if (npc.items.length) {
      test(`${npc.name} : butin embarqué bien formé (name/type/system)`, () => {
        for (const item of npc.items) {
          assert.ok(item.name?.length > 0, `un objet de butin de "${npc.name}" n'a pas de nom`);
          assert.ok(["weapon", "armor", "gear", "tool"].includes(item.type), `type de butin invalide sur "${npc.name}" > "${item.name}"`);
          assert.ok(typeof item.system === "object", `system manquant sur "${npc.name}" > "${item.name}"`);
        }
      });
    }
  }
});

describe("classStartingEquipment — les noms référencés existent dans world-items/weapons|armors.json", () => {
  const weaponsByName = new Map(WORLD_WEAPONS.map((entry) => [entry.name, entry]));
  const armorNames = new Set(WORLD_ARMORS.map((entry) => entry.name));
  for (const [classKey, kit] of Object.entries(DND_CUSTOM.classStartingEquipment)) {
    test(`${classKey} : arme "${kit.weapon}" existe`, () => {
      assert.ok(weaponsByName.has(kit.weapon), `arme "${kit.weapon}" introuvable dans world-items/weapons.json`);
    });
    // L'arme de départ doit être d'une catégorie maîtrisée par la classe.
    test(`${classKey} : l'arme de départ "${kit.weapon}" est d'un type maîtrisé par la classe`, () => {
      const weapon = weaponsByName.get(kit.weapon);
      if (!weapon) return; // déjà signalé par le test précédent, évite un échec en cascade illisible
      assert.ok(
        DND_CUSTOM.classWeaponProficiencies[classKey].includes(weapon.system.weaponType),
        `"${kit.weapon}" est de type "${weapon.system.weaponType}", absent des maîtrises de ${classKey} (${DND_CUSTOM.classWeaponProficiencies[classKey].join(", ")})`
      );
    });
    if (kit.armor) {
      test(`${classKey} : armure "${kit.armor}" existe`, () => {
        assert.ok(armorNames.has(kit.armor), `armure "${kit.armor}" introuvable dans world-items/armors.json`);
      });
    }
  }
});

describe("scripts/data/glossary.json — utilisé par le Guide du Joueur (player-guide-journal.js)", () => {
  test("au moins un terme, chaque entrée a un terme et une définition non vides", () => {
    assert.ok(GLOSSARY.length > 0);
    for (const entry of GLOSSARY) {
      assert.ok(entry.term?.length > 0);
      assert.ok(entry.definition?.length > 0);
    }
  });
  test("aucun terme en double (la première correspondance ferait ombre aux suivantes dans les tooltips)", () => {
    const terms = GLOSSARY.map((entry) => entry.term);
    assert.equal(new Set(terms).size, terms.length);
  });
});

describe("world-items/classes.json — une entrée par classe de config.js, contenu HTML bien formé", () => {
  const classLabelsFr = CLASS_KEYS.map((key) => LOCALES.fr[DND_CUSTOM.classes[key]]);
  test("exactement une entrée par classe (pas plus, pas moins)", () => {
    const names = WORLD_CLASSES.map((entry) => entry.name);
    assert.deepEqual(new Set(names), new Set(classLabelsFr));
  });
  for (const entry of WORLD_CLASSES) {
    test(`${entry.name} : description HTML avec balises ouvrantes/fermantes équilibrées`, () => {
      const opening = (entry.system.description.match(/<[a-z][^>]*>/gi) ?? []).length;
      const closing = (entry.system.description.match(/<\/[a-z][^>]*>/gi) ?? []).length;
      const selfClosing = (entry.system.description.match(/<[a-z][^>]*\/>/gi) ?? []).length;
      assert.equal(opening - selfClosing, closing, `balises HTML déséquilibrées pour "${entry.name}"`);
    });
  }
});

describe("world-items/classes.json — champs structurés cohérents avec config.js (duplication assumée, cf. ClassData)", () => {
  // Vérifie que system.classKey correspond au nom français de l'Item.
  const classKeyByLabel = new Map(CLASS_KEYS.map((key) => [LOCALES.fr[DND_CUSTOM.classes[key]], key]));
  for (const entry of WORLD_CLASSES) {
    const classKey = entry.system.classKey;
    test(`${entry.name} : system.classKey correspond au nom de l'Item`, () => {
      assert.equal(classKey, classKeyByLabel.get(entry.name), `"${entry.name}" : classKey "${classKey}" ne correspond pas à son nom`);
    });
    test(`${entry.name} : savingThrows identiques à DND_CUSTOM.classSavingThrows`, () => {
      assert.deepEqual(new Set(entry.system.savingThrows), new Set(DND_CUSTOM.classSavingThrows[classKey]));
    });
    test(`${entry.name} : skillChoiceCount identique à DND_CUSTOM.classSkillChoices`, () => {
      assert.equal(entry.system.skillChoiceCount, DND_CUSTOM.classSkillChoices[classKey]);
    });
    test(`${entry.name} : weaponProficiencies identiques à DND_CUSTOM.classWeaponProficiencies`, () => {
      assert.deepEqual(new Set(entry.system.weaponProficiencies), new Set(DND_CUSTOM.classWeaponProficiencies[classKey]));
    });
  }
});

describe("world-items/subclasses.json — une entrée par sous-classe de config.js, classKey/subclassKey cohérents", () => {
  const ALL_SUBCLASSES = Object.entries(DND_CUSTOM.subclasses).flatMap(([classKey, byKey]) =>
    Object.entries(byKey).map(([subclassKey, labelKey]) => ({
      classKey,
      subclassKey,
      label: LOCALES.fr[labelKey]
    }))
  );

  test("exactement une entrée par sous-classe (pas plus, pas moins)", () => {
    const names = WORLD_SUBCLASSES.map((entry) => entry.name);
    assert.deepEqual(new Set(names), new Set(ALL_SUBCLASSES.map((s) => s.label)));
  });

  for (const entry of WORLD_SUBCLASSES) {
    const expected = ALL_SUBCLASSES.find((s) => s.label === entry.name);
    test(`${entry.name} : system.classKey/subclassKey correspondent au nom de l'Item`, () => {
      assert.ok(expected, `"${entry.name}" ne correspond à aucune sous-classe de config.js`);
      assert.equal(entry.system.classKey, expected.classKey, `"${entry.name}" : classKey attendu "${expected.classKey}"`);
      assert.equal(entry.system.subclassKey, expected.subclassKey, `"${entry.name}" : subclassKey attendu "${expected.subclassKey}"`);
    });
  }
});

describe("world-items/origins.json — une entrée par Origine de scripts/data/origins.json", () => {
  test("mêmes noms des deux côtés", () => {
    const itemNames = new Set(WORLD_ORIGIN_ITEMS.map((entry) => entry.name));
    const dataLabels = new Set(Object.values(ORIGINS).map((origin) => origin.label));
    assert.deepEqual(itemNames, dataLabels);
  });
});

describe("world-items/languages.json — cohérence avec scripts/data/origins.json > language (grantLanguages, cf. class-content.js)", () => {
  const languageNames = new Set(WORLD_LANGUAGES.map((entry) => entry.name));
  const originLanguageNames = new Set(Object.values(ORIGINS).map((origin) => origin.language));

  test("chaque Origine référence un champ 'language' non vide", () => {
    for (const [key, origin] of Object.entries(ORIGINS)) {
      assert.ok(origin.language?.length > 0, `Origine "${key}" n'a pas de champ language (grantLanguages ne pourra jamais l'octroyer)`);
    }
  });

  test("chaque langue référencée par une Origine existe dans world-items/languages.json", () => {
    for (const [key, origin] of Object.entries(ORIGINS)) {
      assert.ok(languageNames.has(origin.language), `Origine "${key}" référence la langue "${origin.language}", introuvable dans world-items/languages.json`);
    }
  });

  test("chaque langue de catégorie 'origin' correspond à exactement une Origine (pas d'orpheline)", () => {
    const originCategoryLanguages = WORLD_LANGUAGES.filter((entry) => entry.system.category === "origin").map((entry) => entry.name);
    assert.deepEqual(new Set(originCategoryLanguages), originLanguageNames);
  });

  test("'Commun' existe et a la catégorie 'common'", () => {
    const commune = WORLD_LANGUAGES.find((entry) => entry.name === "Commun");
    assert.ok(commune, "'Commun' introuvable dans world-items/languages.json");
    assert.equal(commune.system.category, "common");
  });

  test("chaque langue de catégorie 'origin' porte le blason de l'Origine correspondante (assets/icons/origins/)", () => {
    for (const entry of WORLD_LANGUAGES.filter((lang) => lang.system.category === "origin")) {
      assert.ok(entry.img?.length > 0, `"${entry.name}" (langue d'Origine) n'a pas d'icône`);
      assert.match(entry.img, /^systems\/dnd-custom-ai\/assets\/icons\/origins\/.+\.webp$/, `"${entry.name}" : icône hors du dossier assets/icons/origins/`);
    }
  });

  test("chaque langue non liée à une Origine (common/special) porte l'icône partagée assets/icons/languages/others.webp", () => {
    for (const entry of WORLD_LANGUAGES.filter((lang) => lang.system.category !== "origin")) {
      assert.equal(entry.img, "systems/dnd-custom-ai/assets/icons/languages/others.webp", `"${entry.name}" n'a pas l'icône partagée attendue`);
    }
  });

  test("les descriptions de langues sont en texte brut (pas de balises HTML), comme les autres world-items", () => {
    for (const entry of WORLD_LANGUAGES) {
      assert.doesNotMatch(entry.system.description, /<[a-z][^>]*>/i, `"${entry.name}" : balise HTML détectée dans la description`);
    }
  });

  test("toute langue requise (requiredLanguage) existe, et seule une langue spéciale en exige une", () => {
    const names = new Set(WORLD_LANGUAGES.map((entry) => entry.name));
    for (const entry of WORLD_LANGUAGES.filter((lang) => lang.system.requiredLanguage)) {
      assert.ok(names.has(entry.system.requiredLanguage), `"${entry.name}" exige "${entry.system.requiredLanguage}", introuvable`);
      assert.equal(entry.system.category, "special", `"${entry.name}" : seule une langue spéciale (ajout manuel) peut avoir un prérequis`);
    }
  });

  test("le sümpfer exige l'altenmarkois", () => {
    const sumpfer = WORLD_LANGUAGES.find((entry) => entry.name === "Sümpfer");
    assert.ok(sumpfer, "'Sümpfer' introuvable dans world-items/languages.json");
    assert.equal(sumpfer.system.requiredLanguage, "Altenmarkois");
  });

  test("aucun nom de langue en double", () => {
    const names = WORLD_LANGUAGES.map((entry) => entry.name);
    assert.equal(new Set(names).size, names.length);
  });
});
