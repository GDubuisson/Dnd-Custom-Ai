/** `{ conditions, activeConditions }` pour une fiche d'Actor : la liste complète des états
 *  (`CONFIG.statusEffects` — remplacé par la liste du système au `init`, cf. helpers/config.js)
 *  avec leur état actif sur `actor`, plus le sous-ensemble actif seul (résumé compact de
 *  l'en-tête / du libellé replié). Identique entre la fiche personnage et la fiche PNJ. */
export function conditionsContext(actor) {
  const conditions = CONFIG.statusEffects.map((status) => ({
    id: status.id,
    label: game.i18n.localize(status.name),
    img: status.img,
    active: actor.statuses.has(status.id)
  }));
  return { conditions, activeConditions: conditions.filter((condition) => condition.active) };
}
