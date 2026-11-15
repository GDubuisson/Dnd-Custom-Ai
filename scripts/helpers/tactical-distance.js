
// Allonge de mêlée par défaut (1,50 m), sans allonge propre à l'arme.
export const MELEE_REACH_METERS = 1.5;

/**
 * Centre `{x, y}` d'un TokenDocument calculé depuis ses données.
 * `x`/`y` permettent de passer la nouvelle position reçue dans un hook `updateToken`.
 */
export function tokenCenter(tokenDoc, { x = tokenDoc.x, y = tokenDoc.y } = {}) {
  const gridSize = canvas.grid.size;
  return {
    x: x + (tokenDoc.width * gridSize) / 2,
    y: y + (tokenDoc.height * gridSize) / 2
  };
}

/** Distance réelle (unité de la scène) entre deux points du canvas, via `canvas.grid.measurePath`. */
export function distanceBetweenPoints(pointA, pointB) {
  return canvas.grid.measurePath([pointA, pointB]).distance;
}
