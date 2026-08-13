import { test, describe } from "node:test";
import assert from "node:assert/strict";
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
  WORLD_ORIGIN_ITEMS,
  WORLD_LANGUAGES,
  GLOSSARY
} from "../support/fixtures.js";
import { LOCALES } from "../support/i18n.js";

const CLASS_KEYS = Object.keys(DND_CUSTOM.classes);
const CLASS_LABELS_FR = new Set(CLASS_KEYS.map((key) => LOCALES.fr[DND_CUSTOM.classes[key]]));
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
    // Comparaison en ensemble, pas en ordre de tableau : Object.keys() réordonne les clés
    // "numériques" (ex. "1".."30") avant les autres ("1/8" etc.) quel que soit l'ordre
    // d'écriture dans le fichier source — un artefact du moteur JS, pas une incohérence de
    // données (l'ordre n'a de toute façon aucune importance pour une table de correspondance).
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
  const OBSOLETE_FIELDS = ["school", "components", "castingTime", "range", "duration"];
  for (const spell of WORLD_SPELLS) {
    test(`${spell.name} : pas de champ obsolète (école/composantes/temps/portée/durée séparés)`, () => {
      for (const field of OBSOLETE_FIELDS) {
        assert.ok(!(field in spell.system), `champ obsolète "${field}" présent sur "${spell.name}"`);
      }
    });
    test(`${spell.name} : niveau 0-9, classes non vide, ne référence que des classes réelles`, () => {
      assert.ok(spell.system.level >= 0 && spell.system.level <= 9);
      const classes = String(spell.system.classes ?? "").split(",").map((c) => c.trim()).filter(Boolean);
      assert.ok(classes.length > 0, `"${spell.name}" ne liste aucune classe`);
      for (const label of classes) {
        assert.ok(CLASS_LABELS_FR.has(label), `"${spell.name}" référence une classe inconnue : "${label}"`);
      }
    });
  }
});

describe("world-items/features.json — cohérence (FeatureData)", () => {
  for (const feature of WORLD_FEATURES) {
    test(`${feature.name} : classe réelle, niveau >= 1`, () => {
      assert.ok(CLASS_LABELS_FR.has(feature.system.class), `"${feature.name}" référence une classe inconnue : "${feature.system.class}"`);
      assert.ok((feature.system.level ?? 1) >= 1);
    });
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

describe("classStartingEquipment — les noms référencés existent dans world-items/weapons|armors.json", () => {
  const weaponNames = new Set(WORLD_WEAPONS.map((entry) => entry.name));
  const armorNames = new Set(WORLD_ARMORS.map((entry) => entry.name));
  for (const [classKey, kit] of Object.entries(DND_CUSTOM.classStartingEquipment)) {
    test(`${classKey} : arme "${kit.weapon}" existe`, () => {
      assert.ok(weaponNames.has(kit.weapon), `arme "${kit.weapon}" introuvable dans world-items/weapons.json`);
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
  const classKeyByLabel = new Map(CLASS_KEYS.map((key) => [LOCALES.fr[DND_CUSTOM.classes[key]], key]));
  for (const entry of WORLD_CLASSES) {
    const classKey = classKeyByLabel.get(entry.name);
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

  test("'Commune' existe et a la catégorie 'common'", () => {
    const commune = WORLD_LANGUAGES.find((entry) => entry.name === "Commune");
    assert.ok(commune, "'Commune' introuvable dans world-items/languages.json");
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

  test("aucun nom de langue en double", () => {
    const names = WORLD_LANGUAGES.map((entry) => entry.name);
    assert.equal(new Set(names).size, names.length);
  });
});
