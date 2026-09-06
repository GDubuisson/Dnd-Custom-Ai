import { DND_CUSTOM } from "./config.js";
import { rollWildSurge } from "./wild-magic-tables.js";
import { isImmuneToCondition, suspendExistingImmunizedConditions } from "./condition-immunity.js";

// Durée de la Rage, SRD 5e (jusqu'à 1 minute = 10 rounds) : décomptée automatiquement round par
// round UNIQUEMENT si un combat Foundry est déjà démarré au moment où l'état "En Rage" (cf.
// DND_CUSTOM.conditions, config.js) est activé — cf. hooks createActiveEffect/updateCombat
// ci-dessous. Hors combat, la Rage reste manuelle (bascule/désactive l'état à la main). Ne
// modélise QUE cette limite de durée, pas la condition de fin anticipée SRD ("un tour sans
// attaque ni dégât subi") : ce système ne verrouille pas l'économie d'action du tour lui-même.
const RAGE_DURATION_ROUNDS = 10;

/** Hooks de combat et d'ActiveEffect : régénération réaction/action/action bonus au début du
 *  tour d'un personnage (updateCombat), amorce/décompte de la durée de Rage
 *  (createActiveEffect + updateCombat) + Surtenance sauvage du Barbare, blocage à la création
 *  d'un état auquel l'Actor est immunisé (preCreateActiveEffect), fin d'un état immunisant
 *  (deleteActiveEffect), remise à zéro du suivi d'économie d'action en fin de combat
 *  (deleteCombat). Extrait de dnd-custom-ai.js (découpe pré-1.0) — appelé au chargement du
 *  module, à la position historique de ces hooks. */
export function registerCombatEffectHooks() {
  // Régénère la réaction, l'Action, l'Action bonus et la liste "déjà attaqué ce round" du
  // personnage dont c'est désormais le tour, SRD 5e ("vous récupérez votre réaction/action/action
  // bonus au début de votre tour") — pas un reset global par round, pour rester fidèle à la règle.
  // Ne réagit qu'à un changement effectif de tour/round (`turn`/`round` dans `changes`, pas une
  // simple édition du Combat comme l'ajout d'un Combattant), même garde MJ actif que la mort de
  // PNJ ci-dessus pour n'agir qu'une fois même à plusieurs MJ connectés.
  Hooks.on("updateCombat", async (combat, changes) => {
    if (!("turn" in changes) && !("round" in changes)) return;
    if (game.users.activeGM?.id !== game.user.id) return;
  
    const actor = combat.combatant?.actor;
    if (actor?.type === "character") {
      const updates = {};
      if (!actor.system.combat.reactionAvailable) updates["system.combat.reactionAvailable"] = true;
      if (!actor.system.combat.actionAvailable) updates["system.combat.actionAvailable"] = true;
      if (!actor.system.combat.bonusActionAvailable) updates["system.combat.bonusActionAvailable"] = true;
      // Défense contre les attaques multiples (Tactiques défensives, Rôdeur Hunter — chantier "8
      // sous-classes déjà à ≥1 mécanique", 2026-08-23) : "déjà attaqué CE round" redevient vide au
      // début du round suivant, même schéma que les 3 champs ci-dessus.
      if (actor.system.combat.attackedByThisRound.size) updates["system.combat.attackedByThisRound"] = [];
      if (Object.keys(updates).length) await actor.update(updates);
    }
  
    // Décompte de la durée de Rage (cf. RAGE_DURATION_ROUNDS ci-dessus), round par round, pour
    // tout Combattant de CE combat en Rage avec un suivi actif (rageRoundsRemaining > 0, posé par
    // le hook createActiveEffect plus bas). `rageLastRound` (plutôt que `combat.previous?.round`,
    // abandonné : Foundry redéclenche "updateCombat" avec `round` dans les changements PLUSIEURS
    // FOIS lors du démarrage d'un combat, sans que sa valeur n'ait réellement progressé entre deux
    // de ces déclenchements — `combat.previous` s'est révélé peu fiable pour distinguer une
    // vraie avancée d'un redéclenchement sans effet, constaté en pratique lors des tests E2E)
    // rend le décompte idempotent : seul un `combat.round` strictement supérieur au dernier round
    // traité pour CET Actor fait avancer le compteur, quel que soit le nombre de déclenchements.
    if (!("round" in changes)) return;
    for (const combatant of combat.combatants) {
      const ragingActor = combatant.actor;
      if (ragingActor?.type !== "character" || !ragingActor.statuses.has("raging")) continue;
      const remaining = ragingActor.system.combat.rageRoundsRemaining;
      if (!remaining) continue;
      const elapsedRounds = combat.round - ragingActor.system.combat.rageLastRound;
      if (elapsedRounds <= 0) continue;
  
      if (remaining <= elapsedRounds) {
        await ragingActor.toggleStatusEffect("raging", { active: false });
        await ChatMessage.create({
          speaker: ChatMessage.getSpeaker({ actor: ragingActor }),
          content: game.i18n.format("DND_CUSTOM.Chat.RageEnded", { name: ragingActor.name })
        });
      } else {
        await ragingActor.update({
          "system.combat.rageRoundsRemaining": remaining - elapsedRounds,
          "system.combat.rageLastRound": combat.round
        });
      }
    }
  });
  
  // Amorce le décompte de durée de Rage (cf. RAGE_DURATION_ROUNDS) dès que l'état "raging" est
  // activé (Actor#toggleStatusEffect crée une ActiveEffect portant ce statut) ET qu'un combat est
  // déjà démarré (`game.combat.round` > 0, cf. `Combat#round` reste à 0 avant "Démarrer le combat").
  // Hors combat : rageRoundsRemaining reste à 0 (valeur par défaut du schéma), aucun suivi — la
  // Rage reste alors purement manuelle, comme avant cette fonctionnalité.
  Hooks.on("createActiveEffect", async (effect) => {
    const actor = effect.parent;
    if (actor?.type !== "character" || !effect.statuses?.has("raging")) return;
    if (game.users.activeGM?.id !== game.user.id) return;
  
    // Voie de la Magie sauvage (Barbare, cf. world-items/subclasses.json > "wildMagic") :
    // Surtenance sauvage tirée à CHAQUE activation de Rage, combat ou pas — contrairement au
    // décompte de durée ci-dessous, volontairement pas conditionné à game.combat.round.
    if (actor.system.subclass === "wildMagic") await rollWildSurge(actor, "barbarian");
  
    // Rage sans esprit (Berserker, SRD 5e — chantier "8 sous-classes déjà à ≥1 mécanique",
    // 2026-08-23) : suspend Charmé/Effrayé déjà actifs à l'instant où la Rage démarre, combat ou
    // pas — même logique que la Surtenance sauvage ci-dessus, pas conditionnée à game.combat.round.
    await suspendExistingImmunizedConditions(actor);
  
    if (!game.combat?.round) return;
  
    await actor.update({
      "system.combat.rageRoundsRemaining": RAGE_DURATION_ROUNDS,
      "system.combat.rageLastRound": game.combat.round
    });
  });
  
  // Rage sans esprit (Berserker)/Aura de dévotion (Devotion) — chantier "8 sous-classes déjà à
  // ≥1 mécanique", 2026-08-23 : bloque la création d'une ActiveEffect Charmé/Effrayé sur un
  // personnage actuellement immunisé (cf. isImmuneToCondition, helpers/condition-immunity.js).
  // Pas de garde MJ actif ici (contrairement aux hooks réactifs ci-dessus) : même principe que le
  // blocage de conflit d'emplacement d'équipement plus bas (preUpdateItem) — un hook "pre" qui
  // annule la création s'évalue localement chez le client à l'origine de la tentative, jamais
  // besoin de le restreindre à un seul MJ actif pour éviter un doublon.
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
  
  // Symétrique de la création ci-dessus : remet le compteur à zéro quand "raging" est retiré
  // (bascule manuelle du joueur, ou fin automatique par le hook updateCombat ci-dessus) — pur
  // nettoyage, `rageRoundsRemaining`/`rageLastRound` n'ont de sens que tant que l'état est actif.
  Hooks.on("deleteActiveEffect", async (effect) => {
    const actor = effect.parent;
    if (actor?.type !== "character" || !effect.statuses?.has("raging")) return;
    if (game.users.activeGM?.id !== game.user.id) return;
    if (!actor.system.combat.rageRoundsRemaining) return;
  
    await actor.update({ "system.combat.rageRoundsRemaining": 0, "system.combat.rageLastRound": 0 });
  });
  
  // Filet de sécurité : ne laisse pas un personnage "réaction/action/action bonus bloquée" une fois
  // le combat terminé (ex. combat clos sans que ce soit revenu à son tour). Régénère les quatre
  // champs pour tous les personnages ayant participé, même garde MJ actif que ci-dessus.
  Hooks.on("deleteCombat", async (combat) => {
    if (game.users.activeGM?.id !== game.user.id) return;
  
    const updates = combat.combatants
      .map((combatant) => combatant.actor)
      .filter((actor) => actor?.type === "character")
      .map((actor) => {
        const update = { _id: actor.id };
        if (!actor.system.combat.reactionAvailable) update["system.combat.reactionAvailable"] = true;
        if (!actor.system.combat.actionAvailable) update["system.combat.actionAvailable"] = true;
        if (!actor.system.combat.bonusActionAvailable) update["system.combat.bonusActionAvailable"] = true;
        if (actor.system.combat.attackedByThisRound.size) update["system.combat.attackedByThisRound"] = [];
        return update;
      })
      .filter((update) => Object.keys(update).length > 1);
    if (updates.length) await Actor.updateDocuments(updates);
  });
}
