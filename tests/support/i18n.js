import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..");

/** Aplati un objet de traduction imbriqué (lang/*.json) en `{ "DND_CUSTOM.Actor.Level": "Niveau" }`,
 *  même format que celui attendu par `game.i18n.localize` côté Foundry. */
function flatten(obj, prefix = "", out = {}) {
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      flatten(value, fullKey, out);
    } else {
      out[fullKey] = value;
    }
  }
  return out;
}

function loadLangFile(locale) {
  const raw = readFileSync(path.join(ROOT, "lang", `${locale}.json`), "utf8");
  return flatten(JSON.parse(raw));
}

/** Les deux fichiers de langue du système, aplatis. Chargés une seule fois (module-level) :
 *  réutilisés à la fois par le test de couverture i18n et par le stub `localize` des tests de
 *  rendu de templates (cf. handlebars-env.js). */
export const LOCALES = {
  en: loadLangFile("en"),
  fr: loadLangFile("fr")
};

/** Remplace `{placeholder}` par les valeurs de `data`, même convention que game.i18n.format. */
export function formatString(template, data = {}) {
  return template.replace(/\{(\w+)\}/g, (match, token) => (token in data ? String(data[token]) : match));
}
