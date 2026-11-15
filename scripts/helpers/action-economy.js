import { DND_CUSTOM } from "./config.js";
import { canUseReaction } from "./rules.js";

const EXTRA_ATTACK_PREFIX = "Attaque supplémentaire";

const FIELD_BY_ACTIVATION = {
  action: "actionAvailable",
  bonusAction: "bonusActionAvailable"
};

/** Indique si `actor` est Combattant d'un combat démarré. */
function isActorInActiveCombat(actor) {
  return Boolean(game.combat?.combatants.some((combatant) => combatant.actor?.id === actor.id));
}

/**
 * Suivi non bloquant de l'Action / Action bonus du tour : rappel en chat si déjà consommée.
 * `isWeaponAttack` évite le rappel aux personnages dotés d'Attaque supplémentaire.
 */
export async function noteActionEconomyUsage(actor, activation, { isWeaponAttack = false } = {}) {
  const field = FIELD_BY_ACTIVATION[activation];
  if (!field || actor.type !== "character" || !isActorInActiveCombat(actor)) return;

  const available = actor.system.combat[field];
  if (available) {
    await actor.update({ [`system.combat.${field}`]: false });
    return;
  }

  const exemptFromReminder =
    isWeaponAttack &&
    actor.items.contents.some((item) => item.type === "feature" && item.name.startsWith(EXTRA_ATTACK_PREFIX));
  if (exemptFromReminder) return;

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: game.i18n.format("DND_CUSTOM.Chat.ActionEconomyReminder", {
      name: actor.name,
      action: game.i18n.localize(DND_CUSTOM.activationTypes[activation])
    })
  });
}

/**
 * Applique l'économie d'action avant l'usage d'`item` ; seule la réaction est bloquante.
 * @returns {Promise<boolean>} `false` si la réaction est déjà consommée
 */
export async function consumeActionEconomy(actor, item) {
  if (item.system.activation === "reaction") {
    if (!canUseReaction(actor.system)) {
      ui.notifications.warn(game.i18n.format("DND_CUSTOM.Chat.ReactionUnavailable", { name: item.name }));
      return false;
    }
    await actor.update({ "system.combat.reactionAvailable": false });
    return true;
  }
  await noteActionEconomyUsage(actor, item.system.activation);
  return true;
}
