/**
 * Applique `light` aux tokens de `actor` sur la scène active.
 * @returns {Promise<boolean>} `false` si l'Actor n'a aucun token sur la scène
 */
export async function applyTokensLight(actor, light) {
  const tokens = actor.getActiveTokens();
  if (!tokens.length) {
    ui.notifications.warn(game.i18n.localize("DND_CUSTOM.Inventory.NoTokenOnScene"));
    return false;
  }
  for (const token of tokens) await token.document.update({ light }); // NOSONAR : séquentiel voulu
  return true;
}

/**
 * Allume la lumière des tokens de `actor` et l'annonce dans le chat.
 * @param {Actor} actor
 * @param {string} itemName - source de lumière, nommée dans le chat
 * @param {{bright: number, dim: number}} light - `dim` est un rayon additionnel à `bright`
 */
export async function setTokensLight(actor, itemName, light) {
  const applied = await applyTokensLight(actor, {
    bright: light.bright,
    dim: light.bright + light.dim
  });
  if (!applied) return;

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: game.i18n.format("DND_CUSTOM.Chat.UseLightOn", { name: actor.name, item: itemName })
  });
}
