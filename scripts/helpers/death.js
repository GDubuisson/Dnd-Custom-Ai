/** Déclare un Actor mort : statut « mort » et annonce dans le chat. */
export async function declareDeath(actor) {
  if (!actor.statuses.has("dead")) await actor.toggleStatusEffect("dead", { active: true });
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: game.i18n.format("DND_CUSTOM.Chat.Death", { name: actor.name })
  });
}
