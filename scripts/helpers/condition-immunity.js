import { hasFeature } from "./rules.js";
import { tokenCenter, distanceBetweenPoints } from "./tactical-distance.js";

// Chantier "8 sous-classes déjà à ≥1 mécanique" (2026-08-23) : deux Capacités SRD 5e accordent
// une immunité à Charmé/Effrayé — première modélisation d'immunité à une condition dans ce
// système (jusqu'ici seulement des applications de condition, jamais des blocages). Bloquées
// avant même leur création via le hook `preCreateActiveEffect` (dnd-custom-ai.js), pas après
// coup : simplification assumée par rapport au texte SRD exact de Rage sans esprit ("suspendu
// pendant la Rage, reprend effet ensuite") — ici, l'effet est simplement jamais créé tant que
// l'immunité est active, jamais restauré après coup s'il existait déjà avant (cf.
// suspendExistingImmunizedConditions ci-dessous pour ce cas précis, seul rattrapage a posteriori
// modélisé).
const MINDLESS_RAGE_FEAT_NAME = "Rage sans esprit";
const DEVOTION_AURA_FEAT_NAME = "Aura de dévotion";
const DEVOTION_AURA_METERS = 3;
const IMMUNIZABLE_CONDITIONS = new Set(["charmed", "frightened"]);

/** Vrai si `actor` est actuellement immunisé à `conditionId` par une des deux Capacités
 *  ci-dessus. Consulté par le hook `preCreateActiveEffect` (dnd-custom-ai.js) pour annuler la
 *  création de l'ActiveEffect correspondante avant même qu'elle existe. */
export function isImmuneToCondition(actor, conditionId) {
  if (actor?.type !== "character" || !IMMUNIZABLE_CONDITIONS.has(conditionId)) return false;

  if (actor.statuses.has("raging") && hasFeature(actor.items.contents, MINDLESS_RAGE_FEAT_NAME)) return true;
  if (conditionId === "charmed" && isProtectedByDevotionAura(actor)) return true;
  return false;
}

/** Aura de dévotion (Devotion, Paladin, SRD 5e) : `actor` (le Paladin lui-même inclus) est
 *  protégé s'il existe un personnage conscient possédant cette Capacité à 3 m ou moins — la
 *  distance de `actor` à LUI-MÊME valant toujours 0, aucun cas particulier séparé n'est
 *  nécessaire pour le Paladin protégeant sa propre personne. */
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

/** Rage sans esprit (Berserker, Barbare, SRD 5e) : "si vous êtes déjà charmé ou effrayé quand
 *  vous entrez en Rage, l'effet est suspendu pour la durée de la Rage" — seul rattrapage a
 *  posteriori modélisé (cf. commentaire d'en-tête) : retire directement Charmé/Effrayé déjà
 *  actifs au moment où la Rage démarre (simplifié : jamais restauré à la fin de la Rage, un vrai
 *  effet à durée déjà expiré pendant ce temps de toute façon dans l'immense majorité des cas).
 *  Appelé depuis le hook `createActiveEffect` existant qui amorce déjà le décompte de Rage
 *  (dnd-custom-ai.js). */
export async function suspendExistingImmunizedConditions(actor) {
  if (!hasFeature(actor.items.contents, MINDLESS_RAGE_FEAT_NAME)) return;
  for (const conditionId of IMMUNIZABLE_CONDITIONS) {
    if (actor.statuses.has(conditionId)) await actor.toggleStatusEffect(conditionId, { active: false });
  }
}
