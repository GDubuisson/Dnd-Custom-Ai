import { DND_CUSTOM } from "./config.js";
import { rollWildSurge } from "./wild-magic-tables.js";
import { isImmuneToCondition, suspendExistingImmunizedConditions } from "./condition-immunity.js";

// Durée de la Rage en rounds, décomptée seulement si un combat est démarré.
const RAGE_DURATION_ROUNDS = 10;

/** Mises à jour rendant réaction, Action, Action bonus et vidant les attaquants du round. */
function actionRefreshUpdates(actor) {
  const combat = actor.system.combat;
  const updates = {};
  if (!combat.reactionAvailable) updates["system.combat.reactionAvailable"] = true;
  if (!combat.actionAvailable) updates["system.combat.actionAvailable"] = true;
  if (!combat.bonusActionAvailable) updates["system.combat.bonusActionAvailable"] = true;
  // Vide la liste des attaquants du round (Défense contre les attaques multiples).
  if (combat.attackedByThisRound.size) updates["system.combat.attackedByThisRound"] = [];
  return updates;
}

/** Décompte la Rage d'un Actor des rounds écoulés depuis `rageLastRound` ; la termine à zéro. */
async function tickRage(combat, actor) {
  if (actor?.type !== "character" || !actor.statuses.has("raging")) return;
  const remaining = actor.system.combat.rageRoundsRemaining;
  if (!remaining) return;
  const elapsedRounds = combat.round - actor.system.combat.rageLastRound;
  if (elapsedRounds <= 0) return;

  if (remaining > elapsedRounds) {
    await actor.update({
      "system.combat.rageRoundsRemaining": remaining - elapsedRounds,
      "system.combat.rageLastRound": combat.round
    });
    return;
  }
  await actor.toggleStatusEffect("raging", { active: false });
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: game.i18n.format("DND_CUSTOM.Chat.RageEnded", { name: actor.name })
  });
}

/** Enregistre les hooks de combat (économie d'action, durée de Rage) et d'ActiveEffect (immunités). */
export function registerCombatEffectHooks() {
  // Au début du tour d'un personnage : rend réaction, Action, Action bonus et vide les attaquants du round.
  Hooks.on("updateCombat", async (combat, changes) => {
    if (!("turn" in changes) && !("round" in changes)) return;
    if (game.users.activeGM?.id !== game.user.id) return;

    const actor = combat.combatant?.actor;
    if (actor?.type === "character") {
      const updates = actionRefreshUpdates(actor);
      if (Object.keys(updates).length) await actor.update(updates);
    }

    // Décrémente la Rage une seule fois par round, `rageLastRound` évitant les déclenchements répétés.
    if (!("round" in changes)) return;
    for (const combatant of combat.combatants) {
      await tickRage(combat, combatant.actor); // NOSONAR : séquentiel voulu
    }
  });

  // Amorce le décompte de Rage quand « En Rage » est activé pendant un combat démarré.
  Hooks.on("createActiveEffect", async (effect) => {
    const actor = effect.parent;
    if (actor?.type !== "character" || !effect.statuses?.has("raging")) return;
    if (game.users.activeGM?.id !== game.user.id) return;
  
    // Voie de la Magie sauvage : Surtenance sauvage à chaque activation de Rage.
    if (actor.system.subclass === "wildMagic") await rollWildSurge(actor, "barbarian");
  
    // Rage sans esprit : retire Charmé et Effrayé déjà actifs.
    await suspendExistingImmunizedConditions(actor);
  
    if (!game.combat?.round) return;
  
    await actor.update({
      "system.combat.rageRoundsRemaining": RAGE_DURATION_ROUNDS,
      "system.combat.rageLastRound": game.combat.round
    });
  });
  
  // Bloque la création d'un état auquel l'Actor est immunisé.
  Hooks.on("preCreateActiveEffect", (effect) => {
    const actor = effect.parent;
    if (!(actor instanceof Actor)) return;
    const conditionId = [...(effect.statuses ?? [])][0];
    if (!conditionId || !isImmuneToCondition(actor, conditionId)) return;
  
    ui.notifications.info(
      game.i18n.format("DND_CUSTOM.Chat.ConditionBlockedByImmunity", {
        name: actor.name,
        condition: game.i18n.localize(DND_CUSTOM.conditions.find((c) => c.id === conditionId)?.name ?? conditionId)
      })
    );
    return false;
  });
  
  // Remet à zéro le suivi de Rage quand l'état est retiré.
  Hooks.on("deleteActiveEffect", async (effect) => {
    const actor = effect.parent;
    if (actor?.type !== "character" || !effect.statuses?.has("raging")) return;
    if (game.users.activeGM?.id !== game.user.id) return;
    if (!actor.system.combat.rageRoundsRemaining) return;
  
    await actor.update({ "system.combat.rageRoundsRemaining": 0, "system.combat.rageLastRound": 0 });
  });
  
  // En fin de combat, rend à tous les participants réaction, Action et Action bonus.
  Hooks.on("deleteCombat", async (combat) => {
    if (game.users.activeGM?.id !== game.user.id) return;
  
    const updates = combat.combatants
      .map((combatant) => combatant.actor)
      .filter((actor) => actor?.type === "character")
      .map((actor) => ({ _id: actor.id, ...actionRefreshUpdates(actor) }))
      .filter((update) => Object.keys(update).length > 1);
    if (updates.length) await Actor.updateDocuments(updates);
  });
}
