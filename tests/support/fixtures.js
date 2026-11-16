import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { SPELL_LEVELS } from "../../scripts/helpers/rules.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, "..", "..");

function loadJson(relativePath) {
  return JSON.parse(readFileSync(path.join(ROOT, relativePath), "utf8"));
}

/** Vraies données de jeu (origins.json, spell-slots.json), lues sur le disque. */
export const ORIGINS = loadJson("scripts/data/origins.json");
export const SPELL_SLOT_TABLES = loadJson("scripts/data/spell-slots.json");
export const WORLD_SPELLS = loadJson("world-items/spells.json");
export const WORLD_FEATURES = loadJson("world-items/features.json");
export const WORLD_WEAPONS = loadJson("world-items/weapons.json");
export const WORLD_ARMORS = loadJson("world-items/armors.json");
export const WORLD_GEAR = loadJson("world-items/gear.json");
export const WORLD_TOOLS = loadJson("world-items/tools.json");
export const WORLD_REGIONAL = loadJson("world-items/regional.json");
export const WORLD_HISTORICAL = loadJson("world-items/historical.json");
export const ITEM_LORE = loadJson("scripts/data/item-lore.json");
export const WORLD_CLASSES = loadJson("world-items/classes.json");
export const WORLD_SUBCLASSES = loadJson("world-items/subclasses.json");
export const WORLD_ORIGIN_ITEMS = loadJson("world-items/origins.json");
export const WORLD_LANGUAGES = loadJson("world-items/languages.json");
export const WORLD_NPCS = loadJson("world-items/npcs.json");
export const WORLD_MOUNTS = loadJson("world-items/mounts.json");
export const GLOSSARY = loadJson("scripts/data/glossary.json");

/** Objet brut au format CharacterData pour appeler `prepareDerivedData` directement ; `overrides` fusionné en profondeur. */
export function buildCharacterFixture(overrides = {}) {
  const abilities = Object.fromEntries(
    ["str", "dex", "con", "int", "wis", "cha"].map((key) => [key, { value: 10, total: 10 }])
  );
  const saves = Object.fromEntries(["str", "dex", "con", "int", "wis", "cha"].map((key) => [key, { proficient: false }]));
  const base = {
    origin: "",
    class: "",
    abilities,
    saves,
    attributes: {
      level: 1,
      exhaustion: 0,
      hp: { value: 10, max: 10, temp: 0 },
      ac: { value: 10 },
      speed: 30
    },
    spells: {
      slots: Object.fromEntries(SPELL_LEVELS.map((level) => [level, { value: 0, max: 0 }])),
      concentratingOn: ""
    },
    // Items de l'Actor propriétaire.
    parent: { items: overrides.items ?? [] }
  };

  const merged = {
    ...base,
    ...overrides,
    abilities: { ...base.abilities, ...overrides.abilities },
    saves: { ...base.saves, ...overrides.saves },
    attributes: { ...base.attributes, ...overrides.attributes },
    spells: { ...base.spells, ...overrides.spells }
  };
  // Fusion profonde de `hp`.
  if (overrides.attributes?.hp) merged.attributes.hp = { ...base.attributes.hp, ...overrides.attributes.hp };
  if (overrides.attributes?.ac) merged.attributes.ac = { ...base.attributes.ac, ...overrides.attributes.ac };
  // Fusion par palier de `spells.slots`.
  if (overrides.spells?.slots) {
    merged.spells.slots = { ...base.spells.slots };
    for (const [level, slot] of Object.entries(overrides.spells.slots)) {
      merged.spells.slots[level] = { ...base.spells.slots[level], ...slot };
    }
  }
  return merged;
}

/** Item équipé minimal (arme/armure) au format attendu par prepareDerivedData/equipmentSlots. */
export function buildEquippedItem(type, system) {
  return { type, system: { equipped: true, ...system } };
}
