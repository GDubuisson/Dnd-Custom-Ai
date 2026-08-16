import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, "..", "..");

function loadJson(relativePath) {
  return JSON.parse(readFileSync(path.join(ROOT, relativePath), "utf8"));
}

/** Les VRAIES données de jeu du système (pas des doublures) : ties directement les tests à
 *  scripts/data/origins.json et scripts/data/spell-slots.json, chargées ici via `fs` plutôt que
 *  `fetch` (cf. dnd-custom-ai.js > loadOrigins/loadSpellSlotTables, mécanisme équivalent côté
 *  navigateur) — toute modification de ces fichiers est donc immédiatement couverte par les
 *  tests qui s'en servent, sans données de test dupliquées à maintenir en parallèle. */
export const ORIGINS = loadJson("scripts/data/origins.json");
export const SPELL_SLOT_TABLES = loadJson("scripts/data/spell-slots.json");
export const WORLD_SPELLS = loadJson("world-items/spells.json");
export const WORLD_FEATURES = loadJson("world-items/features.json");
export const WORLD_WEAPONS = loadJson("world-items/weapons.json");
export const WORLD_ARMORS = loadJson("world-items/armors.json");
export const WORLD_GEAR = loadJson("world-items/gear.json");
export const WORLD_TOOLS = loadJson("world-items/tools.json");
export const WORLD_CLASSES = loadJson("world-items/classes.json");
export const WORLD_SUBCLASSES = loadJson("world-items/subclasses.json");
export const WORLD_ORIGIN_ITEMS = loadJson("world-items/origins.json");
export const WORLD_LANGUAGES = loadJson("world-items/languages.json");
export const GLOSSARY = loadJson("scripts/data/glossary.json");

/** Construit un objet "brut" au format du schéma CharacterData (cf. scripts/data/character-
 *  data.js) suffisant pour appeler `CharacterData.prototype.prepareDerivedData.call(fixture)`
 *  directement, sans passer par le pipeline Document/DataModel complet de Foundry (cf. tests/
 *  support/foundry-stub.js). `overrides` est fusionné en profondeur sur les valeurs par défaut
 *  (personnage niveau 1 générique, aucun équipement). */
export function buildCharacterFixture(overrides = {}) {
  const abilities = Object.fromEntries(
    ["str", "dex", "con", "int", "wis", "cha"].map((key) => [key, { value: 10, total: 10 }])
  );
  const base = {
    origin: "",
    class: "",
    abilities,
    attributes: {
      level: 1,
      exhaustion: 0,
      hp: { value: 10, max: 10, temp: 0 },
      ac: { value: 10 },
      speed: 30
    },
    spells: {
      uses: { value: 0, max: 0 },
      concentratingOn: ""
    },
    // `parent.items` simule `this.parent?.items` (l'Actor propriétaire) : liste d'objets
    // `{ type, system: { slot, equipped, ... } }, suffisante pour prepareDerivedData (armure/
    // bouclier/accessoires équipés).
    parent: { items: overrides.items ?? [] }
  };

  const merged = {
    ...base,
    ...overrides,
    abilities: { ...base.abilities, ...(overrides.abilities ?? {}) },
    attributes: { ...base.attributes, ...(overrides.attributes ?? {}) },
    spells: { ...base.spells, ...(overrides.spells ?? {}) }
  };
  // `hp`/`ac` sont des sous-objets de `attributes` : les fusionner un niveau plus profond pour
  // qu'un `overrides.attributes.hp` partiel n'écrase pas les autres champs de `hp`.
  if (overrides.attributes?.hp) merged.attributes.hp = { ...base.attributes.hp, ...overrides.attributes.hp };
  if (overrides.attributes?.ac) merged.attributes.ac = { ...base.attributes.ac, ...overrides.attributes.ac };
  return merged;
}

/** Item équipé minimal (arme/armure) au format attendu par prepareDerivedData/equipmentSlots. */
export function buildEquippedItem(type, system) {
  return { type, system: { equipped: true, ...system } };
}
