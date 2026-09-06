/** Décrémente `system.uses.value` d'une Capacité à charges limitées et renvoie le nombre de
 *  charges restantes après l'opération. Renvoie `undefined` si la Capacité n'a pas de suivi de
 *  charges (`uses.max === 0`, action toujours permise), ou `null` si plus aucune charge n'est
 *  disponible (avertissement `NoChargesLeft` affiché — l'appelant doit alors annuler l'action).
 *
 *  Fonction de module (et non méthode privée de fiche) pour rester appelable depuis les mixins
 *  de `DndCustomActorSheet`. */
export async function consumeFeatureCharge(item) {
  if (!item.system.uses.max) return undefined;
  if (item.system.uses.value <= 0) {
    ui.notifications.warn(game.i18n.format("DND_CUSTOM.Chat.NoChargesLeft", { feature: item.name }));
    return null;
  }
  const remaining = item.system.uses.value - 1;
  await item.update({ "system.uses.value": remaining });
  return remaining;
}
