/**
 * Consomme une charge d'une Capacité.
 * @returns {Promise<number|undefined|null>} charges restantes, `undefined` si illimitée, `null` si épuisée
 */
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
