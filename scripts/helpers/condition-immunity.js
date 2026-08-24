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
const IMMUNIZABLE_CONDITIONS = new Set(["charmed", "frightened", "restrained"]);
// Sous-ensemble concerné par Rage sans esprit spécifiquement (cf. suspendExistingImmunizedConditions
// ci-dessous) : Entravé n'en fait PAS partie, cette Capacité n'accorde jamais d'immunité à Entravé
// (contrairement à Liberté de mouvement, cf. isImmuneToCondition plus bas).
const CHARM_FEAR_CONDITIONS = new Set(["charmed", "frightened"]);

/** Vrai si `actor` est actuellement immunisé à `conditionId`. Consulté par le hook
 *  `preCreateActiveEffect` (dnd-custom-ai.js) pour annuler la création de l'ActiveEffect
 *  correspondante avant même qu'elle existe.
 *
 *  Chantier "généraliser condition-immunity.js" (Niveau B, cf.
 *  ClaudeFiles/MECANIQUES_A_AUTOMATISER.md, 2026-08-24) : deux cas de plus au-delà de Rage sans
 *  esprit/Aura de dévotion (Capacités permanentes du personnage lui-même), tous deux des SORTS
 *  ciblant un tiers — pas de Capacité permanente à vérifier, juste une condition homebrew
 *  ("freedomOfMovement"/"protectedFromEvilGood", cf. config.js) posée manuellement par le
 *  lanceur sur SA CIBLE au moment du lancer (même convention que "blessed"/"guided", aucune des
 *  conditions homebrew de ce système n'a de décompte de durée automatique) :
 *  - `freedomOfMovement` (Liberté de mouvement) → immunité à Entravé, sans restriction (fidèle
 *    au SRD, cette immunité ne dépend jamais de la source).
 *  - `protectedFromEvilGood` (Protection contre le mal et le bien) → immunité à Charmé/Effrayé.
 *    Simplification assumée : le SRD ne protège QUE contre les Aberrations/Célestes/
 *    Élémentaires/Fées/Fiélons/Morts-vivants, mais ce système ne trace l'origine (l'"attaquant")
 *    d'aucune ActiveEffect nulle part ailleurs (`toggleStatusEffect` ne prend pas ce paramètre,
 *    cf. tous les appelants de ce fichier/actor-sheet.js) — immunité posée ici plus large que le
 *    SRD (bloque Charmé/Effrayé quelle que soit la source) plutôt que non modélisée du tout. */
export function isImmuneToCondition(actor, conditionId) {
  if (actor?.type !== "character" || !IMMUNIZABLE_CONDITIONS.has(conditionId)) return false;

  if (CHARM_FEAR_CONDITIONS.has(conditionId) && actor.statuses.has("raging") && hasFeature(actor.items.contents, MINDLESS_RAGE_FEAT_NAME))
    return true;
  if (conditionId === "charmed" && isProtectedByDevotionAura(actor)) return true;
  if (conditionId === "restrained" && actor.statuses.has("freedomOfMovement")) return true;
  if (CHARM_FEAR_CONDITIONS.has(conditionId) && actor.statuses.has("protectedFromEvilGood")) return true;
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
  for (const conditionId of CHARM_FEAR_CONDITIONS) {
    if (actor.statuses.has(conditionId)) await actor.toggleStatusEffect(conditionId, { active: false });
  }
}
