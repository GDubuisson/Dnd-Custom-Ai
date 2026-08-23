// Chantier "Tactiques défensives" (Hunter, Rôdeur, SRD 5e) — suite du chantier "8 sous-classes
// déjà à ≥1 mécanique" (2026-08-23), sur demande explicite de l'utilisateur d'aller plus loin
// que le simple enregistrement du choix. Deux des 3 options ("Volonté de fer" traitée
// directement dans actor-sheet.js, ces deux-ci ici) reposent sur un état neuf :
// `system.combat.attackedByThisRound` (CharacterData) — ensemble des id d'Actor ayant fait un
// jet d'ATTAQUE (arme/sort, jamais un simple sort à sauvegarde) contre ce personnage depuis le
// début de SON round. Remis à zéro au début de son propre tour (hook updateCombat,
// dnd-custom-ai.js), même schéma que actionAvailable/reactionAvailable.

/** Enregistre que `attackerActor` vient de faire un jet d'attaque contre CHAQUE cible
 *  actuellement ciblée qui est un personnage joueur — suivi générique SRD (pas conditionné à la
 *  possession de Tactiques défensives : coût négligeable, cohérent avec le reste des jets
 *  d'attaque déjà comparés à la CA, cf. `compareToTargetAc` dans rolls.js). Appelé après chaque
 *  jet d'attaque à l'arme/de sort (PJ ou PNJ). */
export async function recordAttackOnTargets(attackerActor) {
  for (const token of game.user.targets) {
    const targetActor = token.actor;
    if (targetActor?.type !== "character") continue;
    if (targetActor.system.combat.attackedByThisRound.has(attackerActor.id)) continue;
    await targetActor.update({
      "system.combat.attackedByThisRound": [...targetActor.system.combat.attackedByThisRound, attackerActor.id]
    });
  }
}

/** "Défense contre les attaques multiples" (option de Tactiques défensives) : avantage à la
 *  sauvegarde de `targetActor` si `attackerActor` l'a déjà attaqué ce round (cf.
 *  recordAttackOnTargets ci-dessus). */
export function hasMultiattackDefenseAdvantage(targetActor, attackerActor) {
  if (targetActor?.type !== "character" || targetActor.system.combat?.huntersDefense !== "multiattackDefense") return false;
  return Boolean(attackerActor && targetActor.system.combat.attackedByThisRound.has(attackerActor.id));
}

/** "Volonté de fer" (option de Tactiques défensives) : avantage à la sauvegarde de
 *  `targetActor` quand la Capacité qui la force applique Effrayé en cas d'échec
 *  (`conditionOnFail`, cf. FeatureData#appliesCondition — les Sorts n'ont pas ce champ, cette
 *  option ne s'applique donc jamais à un jet de sauvegarde de sort). */
export function hasSteadfastAdvantage(targetActor, conditionOnFail) {
  return targetActor?.type === "character" && targetActor.system.combat?.huntersDefense === "steadfast" && conditionOnFail === "frightened";
}
