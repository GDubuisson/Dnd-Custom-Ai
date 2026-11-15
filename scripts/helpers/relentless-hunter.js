// Traque implacable (Serment de Vengeance) : désavantage aux attaques contre la cible « Traquée »
// pour toute créature autre que le Paladin qui l'a désignée.

const SYSTEM_ID = "dnd-custom-ai";

/** Nom exact de la Capacité dans features.json. */
export const RELENTLESS_HUNTER_FEATURE_NAME = "Traque implacable";

/** Flag de la cible « Traquée » : id de l'Actor qui l'a désignée. */
export const HUNTED_BY_ACTOR_ID_FLAG = "huntedByActorId";

/** Indique si `attackerActor` attaque avec désavantage une cible traquée par un autre Actor. */
export function isDisadvantagedByHuntedTarget(attackerActor) {
  return [...game.user.targets].some((token) => {
    const targetActor = token.actor;
    if (!targetActor?.statuses?.has("hunted")) return false;
    const hunterId = targetActor.getFlag(SYSTEM_ID, HUNTED_BY_ACTOR_ID_FLAG);
    return Boolean(hunterId) && hunterId !== attackerActor.id;
  });
}
