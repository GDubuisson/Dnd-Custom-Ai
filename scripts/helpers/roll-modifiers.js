import { DND_CUSTOM } from "./config.js";
import { hasFeature } from "./rules.js";
import { isDisadvantagedByHuntedTarget } from "./relentless-hunter.js";

// Niveau d'Épuisement à partir duquel les tests sont désavantagés.
const EXHAUSTION_CHECK_DISADVANTAGE_LEVEL = 1;
const EXHAUSTION_ATTACK_SAVE_DISADVANTAGE_LEVEL = 3;

/** Assassinat : critique automatique si une cible ciblée est Surprise. */
function hasAssassinAutoCritical(actor) {
  if (actor.system.subclass !== "assassin") return false;
  return [...game.user.targets].some((token) => token.actor?.statuses?.has("surprised"));
}

/** Seuil de critique : 19 avec Critique amélioré, 20 sinon. */
function improvedCriticalThreshold(actor) {
  return hasFeature(actor.items.contents, "Critique amélioré") ? 19 : 20;
}

/** Combat monté : avantage si une cible ciblée est plus petite que la monture. */
function hasMountedSizeAdvantage(actor) {
  const mountId = actor.system.combat.mountedActorId;
  if (!mountId || !hasFeature(actor.items.contents, "Combat monté")) return false;

  const mount = game.actors.get(mountId);
  const sizeOrder = Object.keys(DND_CUSTOM.sizes);
  const mountSizeIndex = sizeOrder.indexOf(mount?.system.size);
  if (mountSizeIndex < 0) return false;

  return [...game.user.targets].some((token) => {
    const targetSize = token.actor?.system?.size;
    return sizeOrder.includes(targetSize) && sizeOrder.indexOf(targetSize) < mountSizeIndex;
  });
}

/** Options d'avantage, désavantage et critique communes à tout jet d'attaque contre la CA. */
export function attackRollOptions(actor, event, cond) {
  return {
    advantage: event.shiftKey || cond.advantage || hasMountedSizeAdvantage(actor),
    disadvantage: event.ctrlKey || cond.disadvantage || isDisadvantagedByHuntedTarget(actor),
    compareToTargetAc: true,
    criticalRules: true,
    forceCriticalHit: hasAssassinAutoCritical(actor),
    criticalThreshold: improvedCriticalThreshold(actor)
  };
}

/**
 * Avantage, désavantage et bonus de dé issus des états actifs et de l'Épuisement.
 * @param {Actor} actor
 * @param {"check"|"save"|"attack"} kind
 * @param {string} [abilityKey] - caractéristique du test ou de la sauvegarde
 */
export function conditionRollEffects(actor, kind, abilityKey) {
  const statuses = actor.statuses;
  const exhaustion = actor.system.attributes?.exhaustion ?? 0;
  const strengthRageAdvantage = statuses.has("raging") && abilityKey === "str";
  let advantage = false;
  let disadvantage = false;
  let bonus = "";

  if (kind === "check") {
    disadvantage =
      statuses.has("poisoned") || statuses.has("frightened") || exhaustion >= EXHAUSTION_CHECK_DISADVANTAGE_LEVEL;
    advantage = strengthRageAdvantage;
    if (statuses.has("guided")) bonus = "+1d4";
  } else if (kind === "attack") {
    disadvantage =
      statuses.has("poisoned") ||
      statuses.has("frightened") ||
      statuses.has("restrained") ||
      statuses.has("prone") ||
      statuses.has("blinded") ||
      exhaustion >= EXHAUSTION_ATTACK_SAVE_DISADVANTAGE_LEVEL;
    advantage = statuses.has("invisible");
    if (statuses.has("blessed")) bonus = "+1d4";
  } else if (kind === "save") {
    disadvantage =
      exhaustion >= EXHAUSTION_ATTACK_SAVE_DISADVANTAGE_LEVEL || (abilityKey === "dex" && statuses.has("restrained"));
    advantage = strengthRageAdvantage;
    if (statuses.has("blessed")) bonus = "+1d4";
  }
  return { advantage, disadvantage, bonus };
}
