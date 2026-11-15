import { hasFeature } from "./rules.js";
import { tokenCenter, distanceBetweenPoints } from "./tactical-distance.js";

// Immunités aux états accordées par des Capacités ou des sorts, appliquées via `preCreateActiveEffect`.
const MINDLESS_RAGE_FEAT_NAME = "Rage sans esprit";
const DEVOTION_AURA_FEAT_NAME = "Aura de dévotion";
const DEVOTION_AURA_METERS = 3;
const IMMUNIZABLE_CONDITIONS = new Set(["charmed", "frightened", "restrained"]);
// États neutralisés par Rage sans esprit.
const CHARM_FEAR_CONDITIONS = new Set(["charmed", "frightened"]);

/**
 * Indique si `actor` est immunisé à `conditionId` (Rage sans esprit, Aura de dévotion,
 * Liberté de mouvement, Protection contre le mal et le bien).
 */
export function isImmuneToCondition(actor, conditionId) {
  if (actor?.type !== "character" || !IMMUNIZABLE_CONDITIONS.has(conditionId)) return false;

  if (CHARM_FEAR_CONDITIONS.has(conditionId) && actor.statuses.has("raging") && hasFeature(actor.items.contents, MINDLESS_RAGE_FEAT_NAME))
    return true;
  if (conditionId === "charmed" && isProtectedByDevotionAura(actor)) return true;
  if (conditionId === "restrained" && actor.statuses.has("freedomOfMovement")) return true;
  return CHARM_FEAR_CONDITIONS.has(conditionId) && actor.statuses.has("protectedFromEvilGood");
}

/** Indique si un porteur conscient d'Aura de dévotion se trouve à 3 m ou moins de `actor`. */
function isProtectedByDevotionAura(actor) {
  const actorToken = actor.getActiveTokens()[0]?.document;
  if (!actorToken) return false;
  const actorCenter = tokenCenter(actorToken);

  return game.actors.some((paladin) => {
    if (paladin.type !== "character" || paladin.statuses.has("unconscious")) return false;
    if (!hasFeature(paladin.items.contents, DEVOTION_AURA_FEAT_NAME)) return false;
    const paladinToken = paladin.getActiveTokens()[0]?.document;
    if (!paladinToken) return false;
    return distanceBetweenPoints(actorCenter, tokenCenter(paladinToken)) <= DEVOTION_AURA_METERS;
  });
}

/** Retire Charmé et Effrayé à l'entrée en Rage d'un porteur de Rage sans esprit. */
export async function suspendExistingImmunizedConditions(actor) {
  if (!hasFeature(actor.items.contents, MINDLESS_RAGE_FEAT_NAME)) return;
  for (const conditionId of CHARM_FEAR_CONDITIONS) {
    if (actor.statuses.has(conditionId)) await actor.toggleStatusEffect(conditionId, { active: false }); // NOSONAR : séquentiel voulu
  }
}
