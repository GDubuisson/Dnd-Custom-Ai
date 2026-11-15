// Tactiques défensives (Chasseur, Rôdeur) : suivi des attaquants du round dans
// `system.combat.attackedByThisRound`, remis à zéro au début du tour du personnage.

/** Enregistre `attackerActor` comme attaquant de chaque personnage joueur ciblé. */
export async function recordAttackOnTargets(attackerActor) {
  for (const token of game.user.targets) {
    const targetActor = token.actor;
    if (targetActor?.type !== "character") continue;
    if (targetActor.system.combat.attackedByThisRound.has(attackerActor.id)) continue;
    await targetActor.update({ // NOSONAR : séquentiel voulu
      "system.combat.attackedByThisRound": [...targetActor.system.combat.attackedByThisRound, attackerActor.id]
    });
  }
}

/** Défense contre les attaques multiples : avantage si `attackerActor` a déjà attaqué ce round. */
export function hasMultiattackDefenseAdvantage(targetActor, attackerActor) {
  if (targetActor?.type !== "character" || targetActor.system.combat?.huntersDefense !== "multiattackDefense") return false;
  return Boolean(attackerActor && targetActor.system.combat.attackedByThisRound.has(attackerActor.id));
}

/** Volonté de fer : avantage à la sauvegarde contre un effet qui inflige Effrayé. */
export function hasSteadfastAdvantage(targetActor, conditionOnFail) {
  return targetActor?.type === "character" && targetActor.system.combat?.huntersDefense === "steadfast" && conditionOnFail === "frightened";
}
