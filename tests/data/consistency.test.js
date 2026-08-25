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
  WORLD_SUBCLASSES,
  WORLD_ORIGIN_ITEMS,
  WORLD_LANGUAGES,
  WORLD_NPCS,
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
    // Retour de test (lot 3) : "Art de la Parole"/"Sagesse Ancienne" décrivaient un bonus de
    // compétence dans leur texte mais rien ne l'appliquait — conditionalBonus (facultatif,
    // cf. #onRollSkill, actor-sheet.js) référence une compétence + caractéristique réelles
    // quand un trait accorde ce genre de bonus optionnel (proposé au joueur au moment du jet,
    // jamais automatique).
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
      // system.classes : ensemble de CLÉS stables (ex. "wizard"), pas des libellés localisés/
      // traduits — cf. SpellData#classes, item-data.js, et le bug historique documenté dans
      // tests/README.md > "Bug connu". En JSON brut (pas encore passé par le pipeline DataModel
      // de Foundry), c'est un simple tableau.
      assert.ok(spell.system.classes.length > 0, `"${spell.name}" ne liste aucune classe`);
      for (const key of spell.system.classes) {
        assert.ok(CLASS_KEYS.includes(key), `"${spell.name}" référence une clé de classe inconnue : "${key}"`);
      }
    });
  }
});

// Retour de test (lot 3) : "Mot de guérison" et "Soin des blessures" décrivaient un soin en dés
// dans leur texte mais ne lançaient réellement aucun dé (system.heal.dice absent du schéma à
// l'époque) — la consigne du testeur ("vérifier plus largement TOUS les sorts censés lancer des
// dés") va au-delà de ces deux sorts nommés : la deuxième vérification ci-dessous détecte tout
// sort dont la description mentionne un soin en PV sans dé de soin réellement configuré, pas
// seulement les deux noms cités.
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
      // system.class : CLÉ stable (ex. "fighter"), pas un libellé localisé/traduit — cf.
      // FeatureData#class, item-data.js, et le bug historique documenté dans
      // tests/README.md > "Bug connu". Une Capacité universelle (system.universal, ex. Attaque
      // d'opportunité) n'a volontairement pas de classe propre — octroyée à toutes (cf.
      // grantClassContent).
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

// Retour de test (lot 3, point 5 "Capacités à ressource") : les Capacités qui ne fonctionnent
// que dans un état particulier (ex. Frénésie, qui nécessite d'être En Rage) doivent référencer
// un état réel (cf. DND_CUSTOM.conditions, config.js) pour que le grisage automatique
// (featureDisabled, handlebars-helpers.js) fonctionne — une faute de frappe silencieuse
// laisserait le bouton en permanence grisé (id introuvable dans activeStatuses) sans jamais
// lever d'erreur ailleurs.
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

// Chantier "Adversaires" (2026-08-25, demande explicite de l'utilisateur) : bestiaire prêt à
// l'emploi (humanoïdes + bêtes sauvages réelles), importé directement dans le compendium Actor
// "adversaires" (cf. content-import.js). Valide le schéma NpcData/WeaponData/ArmorData/
// GearData/ToolData sur chaque entrée + butin embarqué, même esprit que les blocs
// features.json/spells.json ci-dessus.
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

  // Demande explicite de l'utilisateur : bestiaire volontairement limité aux humanoïdes et aux
  // bêtes sauvages RÉELLES, aucune créature légendaire/mythique/fantastique (pas de dragon,
  // mort-vivant, céleste, fiélon...).
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
    // Retour de test (lot 3) : l'arme de départ de 3 classes (Barde/Rapière, Druide/Cimeterre,
    // Roublard/Rapière) était de type martial alors que ces 3 classes ne maîtrisent QUE les
    // armes simples (cf. DND_CUSTOM.classWeaponProficiencies) — un Joueur démarrait avec une
    // arme qu'il ne savait pas manier. Corrigé (Dague/Faucille, toutes deux `meleeSimple`), et
    // gardé ici pour ne pas régresser sur une future arme de départ mal choisie.
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
  // classKeyByLabel (nom d'Item français -> clé) sert uniquement à VÉRIFIER que system.classKey
  // correspond bien au nom porté par l'Item — pas à le déduire (cf. test dédié ci-dessous) :
  // system.classKey est la source de vérité utilisée par #onOpenClassSheet (actor-sheet.js),
  // indépendante du nom localisé/traduit de l'Item (cf. tests/README.md > "Bug connu").
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
