// Extrait de helpers/opportunity-attack.js (chantier "Combat automatisé avancé", cadrage du
// 2026-08-23 avec l'utilisateur) au moment d'ajouter un 2e consommateur (Sentinelle) : centre de
// token et distance réelle, réutilisables par toute automatisation basée sur la position.

// Allonge de mêlée par défaut SRD 5e (1,50 m) : ce système ne suit pas de propriété "allonge"
// par arme (ex. Hallebarde 3 m) — simplification assumée, comme d'autres nuances SRD déjà
// documentées comme non modélisées ailleurs (cf. ANOMALIES_ACTIVES.md).
export const MELEE_REACH_METERS = 1.5;

/** Centre `{x, y}` d'un TokenDocument à partir de ses seules données (x/y/width/height +
 *  `canvas.grid.size`), jamais du placeable canvas (`tokenDoc.object`) — reste correct même si
 *  le placeable n'a pas encore fini de se (re)positionner au moment du hook. `x`/`y` explicites
 *  optionnels (retour de test : dans `Hooks.on("updateToken", ...)`, `tokenDoc.x`/`y` ne
 *  reflètent PAS encore la nouvelle position au moment où le hook se déclenche — seul le payload
 *  `changes` du hook la contient déjà ; sans ce paramètre, un calcul "avant"/"après" retombe
 *  silencieusement sur le MÊME centre, jamais aucun déclenchement possible). */
export function tokenCenter(tokenDoc, { x = tokenDoc.x, y = tokenDoc.y } = {}) {
  const gridSize = canvas.grid.size;
  return {
    x: x + (tokenDoc.width * gridSize) / 2,
    y: y + (tokenDoc.height * gridSize) / 2
  };
}

/** Distance réelle (mètres, unité de la scène) entre deux points `{x, y}` du canvas — utilise
 *  l'API de mesure de grille native de Foundry (`canvas.grid.measurePath`, v13+), qui gère
 *  correctement une grille carrée ou hexagonale sans qu'il soit nécessaire de reconstruire une
 *  grille tactique complète (cf. chantier "Combat automatisé avancé", cadrage du 2026-08-23 :
 *  positionnement via l'API Foundry existante, pas de pathfinding). */
export function distanceBetweenPoints(pointA, pointB) {
  return canvas.grid.measurePath([pointA, pointB]).distance;
}
