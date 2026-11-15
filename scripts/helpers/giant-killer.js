import { hostileAttackContext, remindAdjacentReactors } from "./reaction-reminders.js";

const GIANT_KILLER_FEAT_NAME = "Tueur de géants";
// Tailles « Grande ou plus » (cf. DND_CUSTOM.sizes).
const LARGE_OR_BIGGER_SIZES = new Set(["g", "tg", "gig"]);

/** Rappel « Tueur de géants » quand un PNJ Grand ou plus attaque le Rôdeur à 1,50 m. */
export async function checkGiantKillerReminder(attackerActor) {
  if (!LARGE_OR_BIGGER_SIZES.has(attackerActor.system.size)) return;
  const context = hostileAttackContext(attackerActor);
  if (!context) return;

  await remindAdjacentReactors(context, attackerActor, {
    featureName: GIANT_KILLER_FEAT_NAME,
    messageKey: "DND_CUSTOM.Chat.GiantKillerAvailable",
    // Ne concerne que le Rôdeur lui-même, jamais un allié.
    isConcerned: (combatant) => context.targetedTokenIds.has(combatant.tokenId)
  });
}
