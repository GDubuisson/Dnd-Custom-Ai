/**
 * Retrouve l'Item de `actor` désigné par le `[data-item-id]` le plus proche de `el`.
 * @returns {Item|undefined}
 */
export function itemFromTarget(actor, el) {
  return actor.items.get(el.closest("[data-item-id]")?.dataset.itemId);
}
