/** Marque un Actor mort (statut + annonce dans le chat) : appelé à la fois par le hook
 *  updateActor (dégâts subis en étant déjà à 0 PV, cf. dnd-custom-ai.js) et par
 *  DndCustomActorSheet#onRollDeathSave (troisième échec de jet de sauvegarde de la mort,
 *  cf. actor-sheet.js) — logique centralisée ici pour que les deux façons de mourir se
 *  comportent exactement de la même manière. */
export async function declareDeath(actor) {
  if (!actor.statuses.has("dead")) await actor.toggleStatusEffect("dead", { active: true });
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: game.i18n.format("DND_CUSTOM.Chat.Death", { name: actor.name })
  });
}
