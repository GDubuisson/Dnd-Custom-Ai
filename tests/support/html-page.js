import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..");

/** La VRAIE feuille de style du système, chargée une seule fois (module-level) : les tests
 *  visuels s'exécutent contre le CSS réellement livré, jamais une copie/un extrait. Les images
 *  de texture (styles/textures/*.jpg, chemins relatifs) ne se chargeront pas dans cette page
 *  autonome (pas de serveur derrière) — sans incidence sur les tests de layout (position/
 *  chevauchement des éléments), qui ne dépendent pas du rendu de ces images de fond. */
const CSS = readFileSync(path.join(ROOT, "styles", "dnd-custom-ai.css"), "utf8");

/** Approximation volontairement minimale du reset de `<button>` appliqué par le cœur Foundry
 *  (pas extrait de son code source, absent de ce repo — reconstruit à partir du comportement
 *  observé lors du bug réel, cf. commentaire sur `.dnd-custom-ai .roll-btn` dans le CSS système)
 *  : un `<button>` par défaut de navigateur est déjà `display: inline-block`, donc un test visuel
 *  qui ne charge QUE notre propre CSS ne peut pas reproduire ce bug — il passerait même sans le
 *  correctif système, silencieusement inutile. Spécificité volontairement basse (simple sélecteur
 *  `button`, 0-0-1) : c'est le VRAI mécanisme du bug (notre `.dnd-custom-ai .roll-btn`, 0-2-0, doit
 *  gagner par spécificité), pas un artefact d'ordre de chargement. */
const FOUNDRY_CORE_BUTTON_BASELINE = `
  button {
    display: flex;
    width: 100%;
    align-items: center;
    justify-content: center;
  }
`;

/** Construit une page HTML autonome (CSS réel inliné + fragment fourni) prête pour
 *  `page.setContent()` côté Playwright. `bodyHtml` doit déjà porter la structure de classes
 *  dont dépendent les sélecteurs CSS `.dnd-custom-ai ...` (cf. gabarits d'enrobage ci-dessous).
 *  `includeFoundryCoreBaseline` : à activer pour tout test dont le bug historique venait d'une
 *  interaction avec le reset de bouton du cœur Foundry (cf. FOUNDRY_CORE_BUTTON_BASELINE). */
export function buildPage(bodyHtml, { includeFoundryCoreBaseline = false } = {}) {
  return `<!doctype html>
<html>
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

/** Enrobe un fragment d'onglet (contenu d'un tab-*.hbs) dans la structure minimale dont
 *  dépendent les sélecteurs `.dnd-custom-ai .tab { ... }` (cf. styles/dnd-custom-ai.css) — même
 *  largeur que la vraie fiche personnage (position.width, cf. actor-sheet.js DEFAULT_OPTIONS). */
export function wrapActorTab(tabHtml, { width = 720 } = {}) {
  return `<div class="dnd-custom-ai sheet actor character" style="width:${width}px;">
    <div class="tab active" data-tab="test">${tabHtml}</div>
  </div>`;
}

/** Enrobe un fragment de fiche d'Item (weapon-sheet.hbs, etc.) dans la structure minimale dont
 *  dépend `.dnd-custom-ai.sheet.item` (cf. item-sheets.js DEFAULT_OPTIONS > position.width). */
export function wrapItemSheet(itemHtml, { width = 480 } = {}) {
  return `<div class="dnd-custom-ai sheet item" style="width:${width}px;">${itemHtml}</div>`;
}
