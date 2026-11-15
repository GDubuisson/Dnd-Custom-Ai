import { DND_CUSTOM } from "./config.js";

/**
 * Seuil de FI sous lequel Repousser les morts-vivants détruit la cible (Clerc 5+, table SRD).
 * @returns {string|null} `null` sous le niveau 5
 */
function destroyUndeadThreshold(clericLevel) {
  if (clericLevel >= 17) return "4";
  if (clericLevel >= 14) return "3";
  if (clericLevel >= 11) return "2";
  if (clericLevel >= 8) return "1";
  if (clericLevel >= 5) return "1/2";
  return null;
}

/** Indique si un mort-vivant de FI `targetChallengeRating` est détruit plutôt que repoussé. */
export function isUndeadDestroyed(casterLevel, targetChallengeRating) {
  const threshold = destroyUndeadThreshold(casterLevel);
  if (!threshold) return false;
  const ratings = DND_CUSTOM.challengeRatings;
  const targetIndex = ratings.indexOf(targetChallengeRating);
  return targetIndex >= 0 && targetIndex <= ratings.indexOf(threshold);
}
