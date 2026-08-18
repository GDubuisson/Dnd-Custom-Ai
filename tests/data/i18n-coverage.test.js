// Ce test rejoue exactement la classe de bug trouvée en revue de code sur ClassContentGranted
// (scripts/sheets/actor-sheet.js appelait "DND_CUSTOM.Chat.ClassContentGranted", clé qui
// n'existait que sous "Wizard" dans lang/*.json — jamais détecté avant l'exécution en jeu).
// Scanne tout le JS/.hbs du système à la recherche de littéraux "DND_CUSTOM.X.Y" utilisés comme
// clé de traduction, et vérifie que chacun résout bien dans lang/en.json ET lang/fr.json.
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

// Capture "DND_CUSTOM.Xxx.Yyy(.Zzz...)" uniquement lorsqu'il forme un littéral de chaîne
// COMPLET entre guillemets (doubles, simples ou template) — ex. `{{localize "DND_CUSTOM.Actor.Level"}}`,
// `game.i18n.format('DND_CUSTOM.Chat.LevelUp', ...)`. Exclut délibérément les accès de
// propriété JS bruts type `DND_CUSTOM.abilities[key]` ou `DND_CUSTOM.skills[skillKey]` : ce
// ne sont pas des clés de traduction mais des lectures directes de l'objet de config
// (scripts/helpers/config.js), résolues dynamiquement puis passées à `localize()` séparément —
// une regex statique ne peut de toute façon pas suivre la valeur d'une variable.
const KEY_PATTERN = /["'`](DND_CUSTOM(?:\.[A-Za-z0-9_]+)+)["'`]/g;

// Préfixes de clé (pas des clés complètes) : convention Foundry `TABS.primary.labelPrefix`,
// qui complète elle-même la clé avec `.${tabId}` (ex. "DND_CUSTOM.Tabs" + ".stats") avant de
// la résoudre — jamais utilisé tel quel comme clé de traduction directe.
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

// Ce bloc n'a plus rien à scanner dans le describe ci-dessus depuis que
// scripts/sheets/actor-sheet.js construit la clé DND_CUSTOM.Abilities.ClassFlavor.<classe>.Title/
// Tagline dynamiquement (template string interpolée, cf. context.classFlavorTitle) : KEY_PATTERN
// exige un littéral complet entre guillemets, donc ne peut plus la détecter — exactement le même
// cas que Classes.*/Skills.*/Abilities.* ci-dessous. Test dédié pour ne pas perdre la couverture
// que ce fichier avait avant la fusion des 12 partials templates/actor/abilities/*.hbs en un seul
// class-flavor.hbs (chacune posait littéralement sa propre clé, détectée par KEY_PATTERN).
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
    // Informatif uniquement : beaucoup de clés (Classes.*, Skills.*, Abilities.*) sont
    // référencées dynamiquement via `DND_CUSTOM.classes[key]` puis `localize()`, jamais comme
    // littéral "DND_CUSTOM.Classes.xxx" dans le source — un vrai faux-positif attendu ici.
    assert.ok(true);
  });
});
