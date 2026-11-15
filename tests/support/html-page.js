import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..");

/** Feuille de style réelle du système (les textures ne se chargent pas, sans effet sur le layout). */
const CSS = readFileSync(path.join(ROOT, "styles", "dnd-custom-ai.css"), "utf8");

/** Reset de `<button>` du cœur Foundry (spécificité 0-0-1), que `.dnd-custom-ai .roll-btn` doit surclasser. */
const FOUNDRY_CORE_BUTTON_BASELINE = `
  button {
    display: flex;
    width: 100%;
    align-items: center;
    justify-content: center;
  }
`;

/** Page HTML autonome (CSS réel + `bodyHtml`) pour `page.setContent()` ; option : reset de bouton Foundry. */
export function buildPage(bodyHtml, { includeFoundryCoreBaseline = false } = {}) {
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<style>
  html, body { margin: 0; padding: 0; }
  ${includeFoundryCoreBaseline ? FOUNDRY_CORE_BUTTON_BASELINE : ""}
  ${CSS}
</style>
</head>
<body>
${bodyHtml}
</body>
</html>`;
}

/** Enrobe un onglet dans la structure de la fiche personnage, à sa largeur réelle. */
export function wrapActorTab(tabHtml, { width = 720 } = {}) {
  return `<div class="dnd-custom-ai sheet actor character" style="width:${width}px;">
    <div class="tab active" data-tab="test">${tabHtml}</div>
  </div>`;
}

/** Enrobe une fiche d'Item dans sa structure, à sa largeur réelle. */
export function wrapItemSheet(itemHtml, { width = 480 } = {}) {
  return `<div class="dnd-custom-ai sheet item" style="width:${width}px;">${itemHtml}</div>`;
}
