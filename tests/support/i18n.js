import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..");

/** Aplatit un fichier de traduction en `{ "DND_CUSTOM.Actor.Level": "Niveau" }`. */
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

/** Fichiers de langue aplatis. */
export const LOCALES = {
  en: loadLangFile("en"),
  fr: loadLangFile("fr")
};

/** Remplace `{placeholder}` par les valeurs de `data`, même convention que game.i18n.format. */
export function formatString(template, data = {}) {
  return template.replace(/\{(\w+)}/g, (match, token) => (token in data ? String(data[token]) : match));
}
