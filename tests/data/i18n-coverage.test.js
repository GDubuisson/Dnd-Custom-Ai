// Vérifie que chaque littéral "DND_CUSTOM.X.Y" du JS et des .hbs existe dans lang/en.json et lang/fr.json.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { LOCALES } from "../support/i18n.js";
import { DND_CUSTOM } from "../../scripts/helpers/config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..");

function collectFiles(dir, extensions) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) out.push(...collectFiles(full, extensions));
    else if (extensions.some((ext) => entry.endsWith(ext))) out.push(full);
  }
  return out;
}

// Capture les littéraux complets "DND_CUSTOM.X.Y" entre guillemets ; ignore les accès de propriété
// (ex. `DND_CUSTOM.skills[key]`) qui lisent la config.
const KEY_PATTERN = /["'`](DND_CUSTOM(?:\.[A-Za-z0-9_]+)+)["'`]/g;

// Préfixes complétés par Foundry (`TABS.primary.labelPrefix`), pas des clés.
const KEY_PREFIXES_NOT_KEYS = new Set(["DND_CUSTOM.Tabs"]);

function extractKeys(source) {
  const found = new Set();
  for (const match of source.matchAll(KEY_PATTERN)) {
    if (!KEY_PREFIXES_NOT_KEYS.has(match[1])) found.add(match[1]);
  }
  return [...found];
}

const sourceFiles = [
  ...collectFiles(path.join(ROOT, "scripts"), [".js"]),
  ...collectFiles(path.join(ROOT, "templates"), [".hbs"])
];

describe("Couverture i18n — toute clé DND_CUSTOM.* référencée dans le code existe dans les 2 langues", () => {
  for (const file of sourceFiles) {
    const relative = path.relative(ROOT, file);
    const source = readFileSync(file, "utf8");
    const keys = extractKeys(source);
    if (!keys.length) continue;

    test(`${relative} (${keys.length} clé(s) référencée(s))`, () => {
      const missing = [];
      for (const key of keys) {
        if (!(key in LOCALES.en)) missing.push(`${key} (absente de lang/en.json)`);
        if (!(key in LOCALES.fr)) missing.push(`${key} (absente de lang/fr.json)`);
      }
      assert.deepEqual(missing, [], `Clé(s) i18n manquante(s) dans ${relative} :\n  - ${missing.join("\n  - ")}`);
    });
  }
});

// Clés DND_CUSTOM.Abilities.ClassFlavor.<classe>.Title/Tagline, construites dynamiquement.
describe("Couverture i18n — DND_CUSTOM.Abilities.ClassFlavor.<classe> (clé construite dynamiquement)", () => {
  for (const classKey of Object.keys(DND_CUSTOM.classes)) {
    test(`${classKey} : Title/Tagline présents dans les 2 langues, icône déclarée`, () => {
      const missing = [];
      for (const suffix of ["Title", "Tagline"]) {
        const key = `DND_CUSTOM.Abilities.ClassFlavor.${classKey}.${suffix}`;
        if (!(key in LOCALES.en)) missing.push(`${key} (absente de lang/en.json)`);
        if (!(key in LOCALES.fr)) missing.push(`${key} (absente de lang/fr.json)`);
      }
      assert.deepEqual(missing, [], `Clé(s) i18n manquante(s) pour ${classKey} :\n  - ${missing.join("\n  - ")}`);
      assert.ok(DND_CUSTOM.classFlavorIcon[classKey], `Icône manquante pour ${classKey} (DND_CUSTOM.classFlavorIcon)`);
    });
  }
});

describe("Couverture i18n — aucune clé orpheline évidente (hygiène, non bloquant)", () => {
  test("liste les clés définies mais jamais référencées dans scripts/templates (log informatif)", () => {
    const allReferencedKeys = new Set();
    for (const file of sourceFiles) {
      for (const key of extractKeys(readFileSync(file, "utf8"))) allReferencedKeys.add(key);
    }
    const unused = Object.keys(LOCALES.fr).filter(
      (key) => key.startsWith("DND_CUSTOM.") && !allReferencedKeys.has(key)
    );
    if (unused.length) {
      console.log(`[info] ${unused.length} clé(s) lang/fr.json jamais référencée(s) littéralement (probablement construites dynamiquement, ex. DND_CUSTOM.Classes.*) :\n  - ${unused.slice(0, 20).join("\n  - ")}${unused.length > 20 ? "\n  - ..." : ""}`);
    }
    // Informatif : clés référencées dynamiquement (Classes.*, Skills.*…), faux positifs attendus.
    assert.ok(allReferencedKeys.size > 0, "aucune clé i18n détectée dans le code : scanner cassé ?");
  });
});
