import Handlebars from "handlebars";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { LOCALES, formatString } from "./i18n.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..");

// `registerHandlebarsHelpers()` (scripts/helpers/handlebars-helpers.js) référence l'identifiant
// global `Handlebars`, tel que Foundry l'expose côté client — on le pose ici avant de l'appeler
// pour réutiliser mot pour mot le même code que le système en production, pas une réécriture.
globalThis.Handlebars = Handlebars;

// `localize`/`selectOptions` : deux helpers fournis nativement par le cœur Foundry (pas par ce
// système), utilisés partout dans les templates (cf. grep sur templates/**/*.hbs). Réimplémentés
// ici a minima pour les tests de rendu — résolus contre les VRAIS fichiers lang/*.json (pas un
// simple echo de la clé) pour que le rendu produise du texte réaliste et que toute clé i18n
// manquante saute aux yeux dans le HTML généré (elle apparaît alors telle quelle, non résolue).
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

// En-tête d'onglet Capacités/Sorts spécialisé par classe (cf. scripts/dnd-custom-ai.js >
// loadTemplates au hook "init") : même clé de partial (chemin système complet) que
// context.classTabPartial (actor-sheet.js), pour que {{> (lookup this "classTabPartial")}}
// se résolve à l'identique en test et en jeu.
Handlebars.registerPartial(
  "systems/dnd-custom-ai/templates/actor/abilities/class-flavor.hbs",
  readFileSync(path.join(ROOT, "templates", "actor", "abilities", "class-flavor.hbs"), "utf8")
);

/** Compile et rend un template .hbs du système (chemin relatif à `templates/`) avec `context`. */
export function renderTemplate(relativePath, context) {
  const source = readFileSync(path.join(ROOT, "templates", relativePath), "utf8");
  const template = Handlebars.compile(source);
  return template(context);
}

export { Handlebars };
