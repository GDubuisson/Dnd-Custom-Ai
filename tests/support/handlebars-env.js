import Handlebars from "handlebars";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { LOCALES, formatString } from "./i18n.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..");

// Global `Handlebars`, comme côté client Foundry.
globalThis.Handlebars = Handlebars;

// Helpers natifs Foundry `localize` et `selectOptions`, résolus contre les vrais lang/*.json.
const locale = LOCALES.fr;

Handlebars.registerHelper("localize", function (value, options) {
  const hash = options?.hash ?? {};
  const template = locale[value] ?? value;
  return Object.keys(hash).length ? formatString(template, hash) : template;
});

Handlebars.registerHelper("selectOptions", function (choices, options) {
  const hash = options?.hash ?? {};
  const selected = hash.selected;
  const shouldLocalize = Boolean(hash.localize);
  const entries = choices instanceof Map ? [...choices.entries()] : Object.entries(choices ?? {});
  const html = entries
    .map(([value, label]) => {
      const text = shouldLocalize ? (locale[label] ?? label) : label;
      const isSelected = String(value) === String(selected) ? " selected" : "";
      return `<option value="${value}"${isSelected}>${text}</option>`;
    })
    .join("");
  return new Handlebars.SafeString(html);
});

const { registerHandlebarsHelpers } = await import("../../scripts/helpers/handlebars-helpers.js");
registerHandlebarsHelpers();

// `glossaryTip` résolu contre le vrai glossary.json.
const GLOSSARY = new Map(
  JSON.parse(readFileSync(path.join(ROOT, "scripts", "data", "glossary.json"), "utf8")).map((e) => [
    e.key,
    e.definition
  ])
);
Handlebars.registerHelper("glossaryTip", (key) => GLOSSARY.get(key) ?? "");

// Partial d'en-tête de classe, sous son chemin système complet.
Handlebars.registerPartial(
  "systems/dnd-custom-ai/templates/actor/abilities/class-flavor.hbs",
  readFileSync(path.join(ROOT, "templates", "actor", "abilities", "class-flavor.hbs"), "utf8")
);

// Partials communs des fiches d'Item, sous leur chemin système complet.
const ITEM_PARTS_DIR = path.join(ROOT, "templates", "item", "parts");
for (const entry of readdirSync(ITEM_PARTS_DIR)) {
  if (!entry.endsWith(".hbs")) continue;
  Handlebars.registerPartial(
    `systems/dnd-custom-ai/templates/item/parts/${entry}`,
    readFileSync(path.join(ITEM_PARTS_DIR, entry), "utf8")
  );
}

/** Compile et rend un template .hbs du système (chemin relatif à `templates/`) avec `context`. */
export function renderTemplate(relativePath, context) {
  const source = readFileSync(path.join(ROOT, "templates", relativePath), "utf8");
  const template = Handlebars.compile(source);
  return template(context);
}

export { Handlebars };
