import { DND_CUSTOM } from "./config.js";

/** Destruction des morts-vivants (Clerc 5, SRD 5e — Niveau C, 2026-08-24) : seuil de FI (indice
 *  de dangerosité) sous lequel un Mort-vivant est DÉTRUIT au lieu de seulement repoussé par
 *  Canalisation divine "Repousser les morts-vivants", selon le niveau du Clerc — table SRD 5e
 *  officielle. `null` sous le niveau 5 (Capacité pas encore acquise). */
function destroyUndeadThreshold(clericLevel) {
  if (clericLevel >= 17) return "4";
  if (clericLevel >= 14) return "3";
  if (clericLevel >= 11) return "2";
  if (clericLevel >= 8) return "1";
  if (clericLevel >= 5) return "1/2";
  return null;
}

/** Vrai si `targetChallengeRating` (FI du PNJ ciblé, DND_CUSTOM.challengeRatings — tableau
 *  ORDONNÉ croissant, cf. config.js) est inférieur ou égal au seuil de `destroyUndeadThreshold`
 *  ci-dessus pour `casterLevel` — comparaison par INDEX dans le tableau plutôt que par valeur
 *  numérique, pour ne pas avoir à parser les fractions ("1/8", "1/4", "1/2"). FI absent/invalide
 *  (indexOf -1) : jamais détruit, seulement repoussé (comportement par défaut inchangé). */
export function isUndeadDestroyed(casterLevel, targetChallengeRating) {
  const threshold = destroyUndeadThreshold(casterLevel);
  if (!threshold) return false;
  const ratings = DND_CUSTOM.challengeRatings;
  const targetIndex = ratings.indexOf(targetChallengeRating);
  return targetIndex >= 0 && targetIndex <= ratings.indexOf(threshold);
}
