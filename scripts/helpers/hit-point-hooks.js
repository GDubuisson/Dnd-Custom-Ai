import { DND_CUSTOM } from "./config.js";
import { SPELL_LEVELS } from "./rules.js";
import { declareDeath } from "./death.js";
import { openAwardXpDialog } from "./xp.js";

/** Mise à jour neuve à chaque appel : `Document#update` modifie l'objet reçu. */
const resetDeathSaves = () => ({ "system.attributes.death.successes": 0, "system.attributes.death.failures": 0 });

/** Personnage tombé à 0 PV : jets contre la mort remis à zéro, état Inconscient, message. */
async function fallUnconscious(actor) {
  await actor.update(resetDeathSaves());
  if (!actor.statuses.has("unconscious")) await actor.toggleStatusEffect("unconscious", { active: true });
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: game.i18n.format("DND_CUSTOM.Chat.FallsUnconscious", { name: actor.name })
  });
}

/** Personnage blessé à 0 PV : un échec automatique au jet contre la mort, mort au troisième. */
async function failDeathSaveFromDamage(actor) {
  const death = actor.system.attributes.death;
  if (death.failures >= 3 || death.successes >= 3) return; // déjà stabilisé ou mort, rien à faire
  const failures = Math.min(3, death.failures + 1);
  await actor.update({ "system.attributes.death.failures": failures });
  if (failures >= 3) await declareDeath(actor);
}

/** Personnage remonté au-dessus de 0 PV : jets contre la mort remis à zéro, Inconscient et Mort retirés. */
async function reviveFromZeroHp(actor) {
  await actor.update(resetDeathSaves());
  if (actor.statuses.has("unconscious")) await actor.toggleStatusEffect("unconscious", { active: false });
  if (actor.statuses.has("dead")) await actor.toggleStatusEffect("dead", { active: false });
}

/**
 * Enregistre les hooks PV, mort et XP des Actors.
 * Le `preUpdateActor` mémorisant `dndCustomOldHp` doit précéder les `updateActor` qui le lisent.
 */
export function registerHitPointHooks() {
  // Pré-remplit l'XP rapporté selon le FI, sauf si l'XP est modifié dans le même envoi.
  Hooks.on("preUpdateActor", (actor, changes) => {
    if (!["npc", "mount", "wildShapeForm"].includes(actor.type)) return;
    const newChallengeRating = changes.system?.challengeRating;
    if (newChallengeRating === undefined || changes.system?.xpReward !== undefined) return;
  
    const xp = DND_CUSTOM.challengeRatingXp[newChallengeRating];
    if (xp !== undefined) changes.system.xpReward = xp;
  });
  
  // Mémorise les PV avant modification pour les hooks `updateActor`.
  Hooks.on("preUpdateActor", (actor, changes, options) => {
    if (changes.system?.attributes?.hp?.value === undefined) return;
    options.dndCustomOldHp = actor.system.attributes.hp.value;
  });
  
  // Agonie d'un personnage : Inconscient à 0 PV, échec automatique si blessé à 0 PV, réveil au-dessus.
  Hooks.on("updateActor", async (actor, changes, options, userId) => {
    if (actor.type !== "character") return;
    if (game.user.id !== userId) return;
    const oldHp = options.dndCustomOldHp;
    if (oldHp === undefined) return;
    const newHp = actor.system.attributes.hp.value;
  
    if (newHp === 0 && oldHp > 0) await fallUnconscious(actor);
    else if (newHp === 0 && oldHp === 0) await failDeathSaveFromDamage(actor);
    else if (newHp > 0 && oldHp === 0) await reviveFromZeroHp(actor);
  });
  
  // Ramène PV et emplacements de sorts à leur maximum s'ils le dépassent.
  Hooks.on("updateActor", async (actor, changes, options, userId) => {
    if (game.user.id !== userId) return;
    if (!["character", "npc", "mount", "wildShapeForm"].includes(actor.type)) return;
  
    const updates = {};
    const hp = actor.system.attributes?.hp;
    if (hp && hp.value > hp.max) updates["system.attributes.hp.value"] = hp.max;
  
    if (actor.type === "character") {
      const slots = actor.system.spells?.slots;
      for (const level of SPELL_LEVELS) {
        const slot = slots?.[level];
        if (slot && slot.value > slot.max) updates[`system.spells.slots.${level}.value`] = slot.max;
      }
    }
  
    // Marque la correction pour la distinguer d'un dégât bloqué par `preUpdateActor`.
    if (Object.keys(updates).length) await actor.update(updates, { dndCustomHpClamp: true });
  });
  
  // Mort d'un PNJ à 0 PV : statut « Mort », Combattant vaincu, dialogue d'XP (MJ actif seulement).
  Hooks.on("updateActor", async (actor, changes, options) => {
    if (actor.type !== "npc") return;
    if (game.users.activeGM?.id !== game.user.id) return;
    const oldHp = options.dndCustomOldHp;
    if (oldHp === undefined || oldHp === 0) return;
    if (actor.system.attributes.hp.value !== 0) return;
  
    await declareDeath(actor);
  
    const combatant = game.combat?.combatants.find((c) => c.actor?.uuid === actor.uuid);
    if (combatant && !combatant.defeated) await combatant.update({ defeated: true });
  
    if (actor.system.xpReward) await openAwardXpDialog({ defaultAmount: actor.system.xpReward });
  });

  // Forme sauvage à 0 PV : le Druide reprend sa forme normale, sans report de dégâts.
  Hooks.on("updateActor", async (actor, changes, options) => {
    if (actor.type !== "wildShapeForm") return;
    if (game.users.activeGM?.id !== game.user.id) return;
    const oldHp = options.dndCustomOldHp;
    if (oldHp === undefined || oldHp === 0) return;
    if (actor.system.attributes.hp.value !== 0) return;
  
    const character = game.actors.find(
      (candidate) => candidate.type === "character" && candidate.system.combat.wildShapeActorId === actor.id
    );
    if (!character) return;
  
    await character.update({ "system.combat.wildShapeActorId": "" });
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: character }),
      content: game.i18n.format("DND_CUSTOM.Chat.WildShapeEnded", { name: character.name, form: actor.name })
    });
  });
}
