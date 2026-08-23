import { DND_CUSTOM } from "./config.js";

const EXTRA_ATTACK_PREFIX = "Attaque supplémentaire";

const FIELD_BY_ACTIVATION = {
  action: "actionAvailable",
  bonusAction: "bonusActionAvailable"
};

/** Même garde que criticalRules (cf. isActorInCombat, rolls.js) : ce suivi n'a de sens que
 *  pendant un VRAI tour (retour de l'utilisateur, 2026-08-23) — un personnage doit être
 *  Combattant d'un combat existant, pas juste "une scène a un combat quelque part". Hors combat,
 *  l'Action/l'Action bonus ne sont ni consommées ni rappelées : aucun tour n'existe pour les
 *  régénérer. */
function isActorInActiveCombat(actor) {
  return Boolean(game.combat?.combatants.some((combatant) => combatant.actor?.id === actor.id));
}

/** Suivi NON-bloquant de l'Action/Action bonus du tour, SRD 5e (cf. system.combat.actionAvailable/
 *  bonusActionAvailable, CharacterData ; régénérés au début du tour comme system.combat.
 *  reactionAvailable, hooks updateCombat/deleteCombat dans dnd-custom-ai.js). Contrairement à la
 *  réaction (#consumeActionEconomy, actor-sheet.js), ne bloque jamais le jet lui-même — décision
 *  de cadrage du 2026-08-23 (chantier "Suivi de l'action/action bonus") pour ne jamais gêner un
 *  cas légitime non prévu par cette automatisation : seul un rappel de chat avertit si l'Action/
 *  Action bonus est déjà consommée ce tour. Actif UNIQUEMENT en combat (cf. isActorInActiveCombat
 *  ci-dessus) — hors combat, ni consommation ni rappel.
 *
 *  `isWeaponAttack` : les personnages avec une Capacité "Attaque supplémentaire" (Barbare/
 *  Guerrier/Moine/Paladin/Rôdeur) enchaînent légitimement plusieurs jets d'attaque à l'arme pour
 *  une seule Action — le rappel est supprimé pour eux sur ces jets précis (l'Action reste tout de
 *  même marquée consommée dès le premier jet, pour continuer à avertir sur un Sort/Capacité qui
 *  suivrait ensuite). */
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
