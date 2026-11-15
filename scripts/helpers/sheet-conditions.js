/**
 * Prépare la liste des états d'un Actor pour sa fiche.
 * @returns {{conditions: object[], activeConditions: object[]}}
 */
export function conditionsContext(actor) {
  const conditions = CONFIG.statusEffects.map((status) => ({
    id: status.id,
    label: game.i18n.localize(status.name),
    img: status.img,
    active: actor.statuses.has(status.id)
  }));
  return { conditions, activeConditions: conditions.filter((condition) => condition.active) };
}
