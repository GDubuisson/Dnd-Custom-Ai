import { hostileAttackContext, remindAdjacentReactors } from "./reaction-reminders.js";

const SENTINEL_FEAT_NAME = "Sentinelle";

/** Rappel Sentinelle quand un PNJ hostile à 1,50 m attaque une autre cible que le personnage. */
export async function checkSentinelReminder(attackerActor) {
  const context = hostileAttackContext(attackerActor);
  if (!context) return;

  await remindAdjacentReactors(context, attackerActor, {
    featureName: SENTINEL_FEAT_NAME,
    messageKey: "DND_CUSTOM.Chat.SentinelAvailable",
    // Pas de rappel si ce Combattant est lui-même la cible.
    isConcerned: (combatant) => !context.targetedTokenIds.has(combatant.tokenId)
  });
}
