/** Applique `light` (déjà au format `TokenDocument#light`, rayons totaux) à tous les tokens
 *  actifs de `actor` sur la scène courante. Renvoie `false` (et prévient) sans rien modifier si
 *  l'Actor n'a aucun token sur la scène active. */
export async function applyTokensLight(actor, light) {
  const tokens = actor.getActiveTokens();
  if (!tokens.length) {
    ui.notifications.warn(game.i18n.localize("DND_CUSTOM.Inventory.NoTokenOnScene"));
    return false;
  }
  for (const token of tokens) await token.document.update({ light });
  return true;
}

/** Allume la source de lumière du/des token(s) de `actor` sur la scène active (objet `gear`
 *  "light" allumé, ou sort émettant de la lumière) et l'annonce dans le chat. `light` :
 *  `{ bright, dim }`, `dim` stocké comme rayon SUPPLÉMENTAIRE au-delà de `bright` (formulation
 *  SRD) — converti ici en rayon total depuis le token, attendu par `TokenDocument#light.dim`.
 *  Partagé par la fiche (objet lumineux) et le mixin d'incantation (sort de lumière). */
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
