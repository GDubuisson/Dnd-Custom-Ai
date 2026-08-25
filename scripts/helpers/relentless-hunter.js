// Traque implacable (Paladin, Serment de Vengeance 3, SRD 5e — Niveau C, 2026-08-25, cf.
// ClaudeFiles/MECANIQUES_A_AUTOMATISER.md) : "toute créature autre que vous a un désavantage aux
// jets d'attaque contre" la cible portant l'état "Traqué" (config.js > DND_CUSTOM.conditions).
// Point bloquant identifié lors de l'audit initial (2026-08-24) : ce système ne trace le
// "propriétaire" d'AUCUN état homebrew ailleurs (raging/blessed/guided/hunted... sont de simples
// bascules). Solution retenue avec l'utilisateur : un flag SCOPÉ à cette seule Capacité (pas une
// généralisation du système d'états) plutôt que de renoncer — même esprit que la spécialisation
// par NOM déjà faite pour Destruction des morts-vivants à l'intérieur de #onRollFeatureSave
// (actor-sheet.js).

const SYSTEM_ID = "dnd-custom-ai";

/** Nom EXACT de la Capacité (world-items/features.json) — comparaison par nom, comme
 *  "Combat monté"/"Critique amélioré"/"Destruction des morts-vivants" ailleurs dans ce système
 *  (le contenu de `features.json` n'est jamais traduit par locale, contrairement aux libellés
 *  UI). Exporté pour que #onGrantFeatureCondition (actor-sheet.js) sache quand poser le flag
 *  ci-dessous en plus de la simple bascule de condition générique. */
export const RELENTLESS_HUNTER_FEATURE_NAME = "Traque implacable";

/** Flag posé sur l'Actor CIBLE (pas sur le Paladin) identifiant qui l'a désignée comme proie —
 *  posé uniquement par #onGrantFeatureCondition (actor-sheet.js) quand le Paladin utilise le
 *  bouton dédié de Traque implacable, jamais par une bascule manuelle de l'état "Traqué" via
 *  l'onglet États. Persiste tant que l'état "Traqué" n'est pas levé (pas un flag transitoire
 *  comme PENDING_OPPORTUNITY_DISADVANTAGE_FLAG, helpers/opportunity-attack.js — consulté à
 *  CHAQUE jet d'attaque contre cette cible, pas seulement le prochain). */
export const HUNTED_BY_ACTOR_ID_FLAG = "huntedByActorId";

/** Désavantage aux jets d'attaque (arme/sort PJ, attaque PNJ) de `attackerActor` : vrai si au
 *  moins une des cibles actuellement ciblées (`game.user.targets`) porte l'état "Traqué" ET que
 *  le flag `HUNTED_BY_ACTOR_ID_FLAG` posé dessus désigne un AUTRE Actor que `attackerActor` —
 *  fidèle au texte SRD "toute créature autre que vous". Une cible "Traquée" SANS ce flag (état
 *  posé à la main via l'onglet États, sans passer par le bouton de la Capacité) ne déclenche
 *  JAMAIS ce désavantage : impossible de deviner qui l'a désignée dans ce cas, comportement
 *  dégradé assumé plutôt que faux. */
export function isDisadvantagedByHuntedTarget(attackerActor) {
  return [...game.user.targets].some((token) => {
    const targetActor = token.actor;
    if (!targetActor?.statuses?.has("hunted")) return false;
    const hunterId = targetActor.getFlag(SYSTEM_ID, HUNTED_BY_ACTOR_ID_FLAG);
    return Boolean(hunterId) && hunterId !== attackerActor.id;
  });
}
