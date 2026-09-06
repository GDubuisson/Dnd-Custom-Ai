import { DND_CUSTOM } from "./config.js";
import { hasFeature } from "./rules.js";
import { isDisadvantagedByHuntedTarget } from "./relentless-hunter.js";

// Niveau d'Exhaustion à partir duquel chaque catégorie de jet est désavantagée, SRD 5e.
const EXHAUSTION_CHECK_DISADVANTAGE_LEVEL = 1;
const EXHAUSTION_ATTACK_SAVE_DISADVANTAGE_LEVEL = 3;

/** Critique automatique de la Capacité "Assassinat" (sous-classe Assassin, Roublard — cf.
 *  world-items/subclasses.json > "assassin") : vrai si `actor` possède cette sous-classe ET
 *  qu'au moins une des cibles actuellement ciblées (`game.user.targets`) porte l'état "Surpris"
 *  (posé manuellement par le MJ, DND_CUSTOM.conditions dans config.js). Lit une donnée de cible
 *  pour affecter le jet de l'attaquant, comme `compareToTargetAc` (rolls.js) le fait déjà pour
 *  chaque jet d'attaque — pas une automatisation tactique générale (flanking/couverture, hors
 *  scope), juste la lecture d'un état explicitement posé à la main pour CETTE Capacité précise. */
function hasAssassinAutoCritical(actor) {
  if (actor.system.subclass !== "assassin") return false;
  return [...game.user.targets].some((token) => token.actor?.statuses?.has("surprised"));
}

/** Seuil de critique (cf. rollCheck > criticalThreshold, rolls.js) : 19 si `actor` possède
 *  "Critique amélioré" (Champion, Guerrier, SRD 5e), 20 (comportement par défaut) sinon.
 *  Appliqué aux jets d'attaque d'arme ET de sort — RAW ne vise que les attaques d'arme, mais ce
 *  système applique déjà la même simplification pour le critique automatique d'Assassinat. */
function improvedCriticalThreshold(actor) {
  return hasFeature(actor.items.contents, "Critique amélioré") ? 19 : 20;
}

/** Avantage automatique aux jets d'attaque du don Combat monté (SRD 5e — chantier "Combat
 *  automatisé avancé", 2026-08-23) : vrai si `actor` possède le don, est actuellement monté
 *  (`system.combat.mountedActorId`), et qu'au moins une des cibles actuellement ciblées
 *  (`game.user.targets`) a une taille strictement inférieure à celle de la monture
 *  (config.js > DND_CUSTOM.sizes, ordre déjà croissant tp/p/m/g/tg/gig). Ne modélise pas la nuance "à pied"
 *  du texte SRD (une cible elle-même montée resterait à tort concernée) — simplification
 *  assumée, comme d'autres nuances déjà documentées ailleurs. */
function hasMountedSizeAdvantage(actor) {
  const mountId = actor.system.combat.mountedActorId;
  if (!mountId || !hasFeature(actor.items.contents, "Combat monté")) return false;

  const mount = game.actors.get(mountId);
  const sizeOrder = Object.keys(DND_CUSTOM.sizes);
  const mountSizeIndex = sizeOrder.indexOf(mount?.system.size);
  if (mountSizeIndex < 0) return false;

  return [...game.user.targets].some((token) => sizeOrder.indexOf(token.actor?.system?.size) >= 0 && sizeOrder.indexOf(token.actor.system.size) < mountSizeIndex);
}

/** Options d'avantage/désavantage/critique communes à TOUT jet d'attaque contre la CA d'une
 *  cible — arme (`#onRollWeaponAttack`, actor-sheet.js) ou sort d'attaque (`#castAttackSpell`,
 *  spellcasting-mixin.js), seule reste distincte l'action économique consommée par l'appelant.
 *  Extrait le 2026-09-05 (clean code) puis déplacé ici (découpe pré-1.0) — dupliqué verbatim
 *  entre les deux jusqu'au 2026-09-05, avec un risque réel d'oublier une source d'avantage à
 *  l'un des deux endroits et de désynchroniser silencieusement les règles. */
export function attackRollOptions(actor, event, cond) {
  return {
    advantage: event.shiftKey || cond.advantage || hasMountedSizeAdvantage(actor),
    disadvantage: event.ctrlKey || cond.disadvantage || isDisadvantagedByHuntedTarget(actor),
    compareToTargetAc: true,
    criticalRules: true,
    forceCriticalHit: hasAssassinAutoCritical(actor),
    criticalThreshold: improvedCriticalThreshold(actor)
  };
}

/** Avantage/désavantage/bonus automatique selon les états actifs (cf. CONFIG.statusEffects) et
 *  le niveau d'Exhaustion — seules les règles univoques et propres au personnage qui jette sont
 *  automatisées (pas d'effets dépendant d'une cible/de la position, hors du scope "combat
 *  automatisé avancé" explicitement exclu de ce système). `kind` : "check" (test de
 *  caractéristique/compétence), "save" (sauvegarde), "attack" (jet d'attaque).
 *
 *  `bonus` (chantier "9 sorts/capacités à rider différé", 2026-08-23) : dé supplémentaire à
 *  ajouter à la formule du jet, ex. "+1d4" — mécanisme des sorts Bénédiction/Avis divin (SRD
 *  5e). Comme les autres conditions homebrew (raging/hunted...), aucune durée/décompte n'est
 *  suivi : "blessed"/"guided" sont des bascules manuelles (onglet États). "blessed" (Bénédiction)
 *  s'applique aux jets d'attaque ET de sauvegarde (pas aux tests, SRD 5e) ; "guided" (Avis divin)
 *  aux tests de caractéristique/compétence uniquement. Jets de sauvegarde contre la mort
 *  (#onRollDeathSave) volontairement exclus : flux spécial à part (1d20 brut).
 *
 *  Rage (Barbare, SRD 5e — Niveau C, 2026-08-24) : avantage aux tests ET sauvegardes de FORCE
 *  tant que "raging" est actif. `abilityKey` pour "check" désigne soit l'aptitude brute testée
 *  (#onRollAbility, ex. "str"), soit celle de la compétence testée (#onRollSkill, cf.
 *  SKILL_ABILITIES dans character-data.js — Athlétisme = "str"). */
export function conditionRollEffects(actor, kind, abilityKey) {
  const statuses = actor.statuses;
  const exhaustion = actor.system.attributes?.exhaustion ?? 0;
  const strengthRageAdvantage = statuses.has("raging") && abilityKey === "str";
  let advantage = false;
  let disadvantage = false;
  let bonus = "";

  if (kind === "check") {
    disadvantage =
      statuses.has("poisoned") || statuses.has("frightened") || exhaustion >= EXHAUSTION_CHECK_DISADVANTAGE_LEVEL;
    advantage = strengthRageAdvantage;
    if (statuses.has("guided")) bonus = "+1d4";
  } else if (kind === "attack") {
    disadvantage =
      statuses.has("poisoned") ||
      statuses.has("frightened") ||
      statuses.has("restrained") ||
      statuses.has("prone") ||
      statuses.has("blinded") ||
      exhaustion >= EXHAUSTION_ATTACK_SAVE_DISADVANTAGE_LEVEL;
    advantage = statuses.has("invisible");
    if (statuses.has("blessed")) bonus = "+1d4";
  } else if (kind === "save") {
    disadvantage =
      exhaustion >= EXHAUSTION_ATTACK_SAVE_DISADVANTAGE_LEVEL || (abilityKey === "dex" && statuses.has("restrained"));
    advantage = strengthRageAdvantage;
    if (statuses.has("blessed")) bonus = "+1d4";
  }
  return { advantage, disadvantage, bonus };
}
