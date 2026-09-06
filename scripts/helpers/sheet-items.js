/** L'Item de `actor` porté par l'élément `[data-item-id]` le plus proche de `el` (l'élément
 *  lui-même s'il porte l'attribut), ou `undefined`. Résolution commune à tous les gestionnaires
 *  d'action d'une fiche agissant sur une ligne d'objet / de capacité / de sort (chacun revalide
 *  ensuite `item.type` et ses préconditions). Fonction de module (et non méthode privée) pour
 *  rester appelable depuis la classe de fiche comme depuis ses mixins. */
export function itemFromTarget(actor, el) {
  return actor.items.get(el.closest("[data-item-id]")?.dataset.itemId);
}
