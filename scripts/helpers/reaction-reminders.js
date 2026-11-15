import { hasFeature } from "./rules.js";
import { MELEE_REACH_METERS, tokenCenter, distanceBetweenPoints } from "./tactical-distance.js";

/** Vrai si ce Combattant est un PJ placé sur la scène, avec sa réaction et la capacité `featureName`. */
export function isReadyReactor(combatant, featureName) {
  const actor = combatant.actor;
  if (actor?.type !== "character") return false;
  if (!actor.system.combat.reactionAvailable) return false;
  return Boolean(combatant.token) && hasFeature(actor.items.contents, featureName);
}

/**
 * Contexte d'une attaque de PNJ hostile en combat, côté MJ actif, avec au moins une cible.
 * @returns {{combat: Combat, targetedTokenIds: Set<string>, attackerCenter: object}|null}
 */
export function hostileAttackContext(attackerActor) {
  if (game.users.activeGM?.id !== game.user.id) return null;

  const attackerToken = attackerActor.getActiveTokens()[0]?.document;
  if (!attackerToken || attackerToken.disposition !== CONST.TOKEN_DISPOSITIONS.HOSTILE) return null;

  const combat = game.combat;
  if (!combat) return null;

  const targetedTokenIds = new Set([...game.user.targets].map((token) => token.id));
  if (!targetedTokenIds.size) return null;

  return { combat, targetedTokenIds, attackerCenter: tokenCenter(attackerToken) };
}

/**
 * Poste le rappel `messageKey` pour chaque PJ au contact de l'attaquant qui peut réagir avec `featureName`.
 * @param {(combatant: Combatant) => boolean} isConcerned filtre propre à la capacité (cible ou non)
 */
export async function remindAdjacentReactors(context, attackerActor, { featureName, messageKey, isConcerned }) {
  for (const combatant of context.combat.combatants) {
    if (!isReadyReactor(combatant, featureName) || !isConcerned(combatant)) continue;
    if (distanceBetweenPoints(tokenCenter(combatant.token), context.attackerCenter) > MELEE_REACH_METERS) continue;
    await ChatMessage.create({ // NOSONAR : séquentiel voulu
      content: game.i18n.format(messageKey, { reactor: combatant.actor.name, attacker: attackerActor.name })
    });
  }
}
