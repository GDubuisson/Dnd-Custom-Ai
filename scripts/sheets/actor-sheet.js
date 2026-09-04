import { DND_CUSTOM } from "../helpers/config.js";
import {
  abilityModifier,
  proficiencyBonus,
  armorContribution,
  carryingCapacity,
  carryingCapacityBonus,
  carriedWeight,
  currencyTotalInCopper,
  equipmentSlots,
  formatModifier,
  isProficientWithWeapon,
  levelForXp,
  passivePerception,
  skillModifier,
  spellSaveDC,
  spellAttackBonus,
  toolCheckModifier,
  weaponAttackDamage,
  hasFeature,
  canUseReaction,
  opportunityAttackTrigger,
  SPELL_LEVELS,
  spellSlotFillUpdates,
  targetSaveModifier,
  opposedCheckModifier
} from "../helpers/rules.js";
import { SKILL_ABILITIES } from "../data/character-data.js";
import { InventoryDragDropMixin } from "./inventory-drag-drop.js";
import { rollCheck, rollDamage, rollHeal, sheetRollFlags } from "../helpers/rolls.js";
import { CharacterCreationWizard } from "./character-creation-wizard.js";
import { declareDeath } from "../helpers/death.js";
import { offerAbilityScoreOrFeatDialog } from "../helpers/level-up-choice.js";
import { offerSubclassChoiceDialog } from "../helpers/subclass-choice.js";
import { chooseSpellSlotLevel, chooseSpellSlotRecovery } from "../helpers/spell-slot-choice.js";
import { grantClassContent } from "../helpers/class-content.js";
import { requestBeastCompanion } from "../helpers/companion.js";
import { offerWildShapeFormDialog } from "../helpers/wild-shape-choice.js";
import { requestWildShapeTransformation } from "../helpers/wild-shape-form.js";
import { chooseInitiateMagicSpells } from "../helpers/initiate-magic-choice.js";
import { chooseMetamagicOption } from "../helpers/metamagic.js";
import { chooseSculptSpellsTarget } from "../helpers/sculpt-spells.js";
import { noteActionEconomyUsage } from "../helpers/action-economy.js";
import { recordAttackOnTargets, hasMultiattackDefenseAdvantage, hasSteadfastAdvantage } from "../helpers/hunters-defense.js";
import { rollWildSurge } from "../helpers/wild-magic-tables.js";
import {
  RELENTLESS_HUNTER_FEATURE_NAME,
  HUNTED_BY_ACTOR_ID_FLAG,
  isDisadvantagedByHuntedTarget
} from "../helpers/relentless-hunter.js";

const { HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

const SYSTEM_ID = "dnd-custom-ai";

// Niveau d'Exhaustion à partir duquel chaque catégorie de jet est désavantagée, SRD 5e.
const EXHAUSTION_CHECK_DISADVANTAGE_LEVEL = 1;
const EXHAUSTION_ATTACK_SAVE_DISADVANTAGE_LEVEL = 3;

// Capacités (world-items/features.json) conférant l'incantation rituelle gratuite (cf.
// #onCastSpell) : une par classe qui l'a en SRD 5e et pour laquelle elle est modélisée ici.
const RITUAL_CASTING_FEATURES = ["Incantation rituelle (Clerc)", "Incantation rituelle (Druide)"];

// Table d'options par valeur de FeatureData#grantsChoice (cf. #onChooseFeatureOption ci-dessous)
// — une entrée par choix ponctuel et définitif existant dans ce système.
const CHOICE_OPTIONS_TABLES = {
  totemSpirit: DND_CUSTOM.totemSpirits,
  draconicResistanceType: DND_CUSTOM.draconicResistanceTypes,
  huntersDefense: DND_CUSTOM.huntersDefenses,
  favoredEnemyType: DND_CUSTOM.creatureTypes
};

/** Critique automatique de la Capacité "Assassinat" (sous-classe Assassin, Roublard — cf.
 *  world-items/subclasses.json > "assassin") : vrai si `actor` possède cette sous-classe ET
 *  qu'au moins une des cibles actuellement ciblées (`game.user.targets`) porte l'état "Surpris"
 *  (posé manuellement par le MJ, DND_CUSTOM.conditions dans config.js). Lit une donnée de cible
 *  pour affecter le jet de l'attaquant, comme `compareToTargetAc` (rolls.js) le fait déjà pour
 *  chaque jet d'attaque — pas une automatisation tactique générale (flanking/couverture, hors
 *  scope, cf. le commentaire de conditionRollEffects ci-dessous), juste la lecture d'un état
 *  explicitement posé à la main pour CETTE Capacité précise. */
function hasAssassinAutoCritical(actor) {
  if (actor.system.subclass !== "assassin") return false;
  return [...game.user.targets].some((token) => token.actor?.statuses?.has("surprised"));
}

/** Ennemi juré (Rôdeur 1, SRD 5e — Niveau C, 2026-08-24) : vrai si `actor` a choisi un type de
 *  créature favori (`system.combat.favoredEnemyType`, cf. FeatureData#grantsChoice =
 *  "favoredEnemyType", DND_CUSTOM.creatureTypes) ET qu'au moins une des cibles actuellement
 *  ciblées (`game.user.targets`) est de ce type — même mécanisme de lecture de cible que
 *  `hasAssassinAutoCritical` ci-dessus. Pilote l'avantage aux tests de Sagesse (Survie, pister)
 *  ET d'Intelligence (se souvenir d'une info), cf. #onRollSkill/#onRollAbility. */
function hasFavoredEnemyAdvantage(actor) {
  const favoredType = actor.system.combat?.favoredEnemyType;
  if (!favoredType) return false;
  return [...game.user.targets].some((token) => token.actor?.system?.creatureType === favoredType);
}

/** Seuil de critique (cf. rollCheck > criticalThreshold, rolls.js) : 19 si `actor` possède
 *  "Critique amélioré" (Champion, Guerrier, SRD 5e), 20 (comportement par défaut) sinon.
 *  Appliqué aux jets d'attaque d'arme ET de sort — RAW ne vise que les attaques d'arme, mais ce
 *  système applique déjà la même simplification pour le critique automatique d'Assassinat
 *  ci-dessus (les deux jets d'attaque partagent le même pipeline rollCheck). */
function improvedCriticalThreshold(actor) {
  return hasFeature(actor.items.contents, "Critique amélioré") ? 19 : 20;
}

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
function isUndeadDestroyed(casterLevel, targetChallengeRating) {
  const threshold = destroyUndeadThreshold(casterLevel);
  if (!threshold) return false;
  const ratings = DND_CUSTOM.challengeRatings;
  const targetIndex = ratings.indexOf(targetChallengeRating);
  return targetIndex >= 0 && targetIndex <= ratings.indexOf(threshold);
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

/** Avantage/désavantage/bonus automatique selon les états actifs (cf. CONFIG.statusEffects) et
 *  le niveau d'Exhaustion — seules les règles univoques et propres au personnage qui jette sont
 *  automatisées (pas d'effets dépendant d'une cible/de la position, hors du scope "combat
 *  automatisé avancé" explicitement exclu de ce système, cf. PROJECT.md). `kind` : "check"
 *  (test de caractéristique/compétence), "save" (sauvegarde), "attack" (jet d'attaque).
 *
 *  `bonus` (chantier "9 sorts/capacités à rider différé", 2026-08-23) : dé supplémentaire à
 *  ajouter à la formule du jet, ex. "+1d4" — mécanisme des sorts Bénédiction/Avis divin (SRD
 *  5e), qui accordent normalement "ajoutez 1d4 à un jet avant la fin du sort" plutôt qu'un
 *  simple avantage/désavantage. Comme les autres conditions homebrew (raging/hunted...), aucune
 *  durée/décompte de sort n'est suivi automatiquement : "blessed"/"guided" sont des bascules
 *  manuelles (onglet États) posées/levées par le joueur/MJ, la seule automatisation étant
 *  d'éviter d'oublier le +1d4 en jouant. "blessed" (Bénédiction) s'applique aux jets d'attaque
 *  ET de sauvegarde (pas aux tests, SRD 5e) ; "guided" (Avis divin) aux tests de caractéristique/
 *  compétence uniquement (SRD 5e : Avis divin ne cible qu'UN test, simplifié ici comme
 *  "guided" reste actif tant que le joueur ne le lève pas lui-même, cohérent avec le reste des
 *  bascules homebrew). Jets de sauvegarde contre la mort (#onRollDeathSave) volontairement
 *  exclus : flux spécial à part (1d20 brut, sans passer par rollCheck/conditionRollEffects).
 *
 *  Rage (Barbare, SRD 5e — Niveau C, 2026-08-24) : avantage aux tests ET sauvegardes de FORCE
 *  tant que "raging" est actif. `abilityKey` pour "check" désigne soit l'aptitude brute testée
 *  (#onRollAbility, ex. "str"), soit celle de la compétence testée (#onRollSkill, cf.
 *  SKILL_ABILITIES dans character-data.js — Athlétisme = "str") : les deux comptent comme "tests
 *  de Force" au sens du SRD. */
function conditionRollEffects(actor, kind, abilityKey) {
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

/** Feuille de personnage joueur : un onglet Handlebars par PART, ApplicationV2/ActorSheetV2.
 *  Le glisser-déposer d'objets (InventoryDragDropMixin) permet de transférer un objet vers/
 *  depuis un autre Actor ouvert (ex. la fiche d'un véhicule). */
export class DndCustomActorSheet extends InventoryDragDropMixin(HandlebarsApplicationMixin(ActorSheetV2)) {
  static DEFAULT_OPTIONS = {
    classes: [SYSTEM_ID, "sheet", "actor", "character"],
    tag: "form",
    // Plafond de confort adopté le 2026-09-04 (maquette maquettes/fiche-708x768/) : la fiche
    // s'ouvre à 708 × 768 et chaque onglet reste consultable en entier à cette taille grâce à
    // l'en-tête compact (character-sheet.hbs). Reste librement redimensionnable au-delà.
    position: { width: 708, height: 768 },
    window: { resizable: true },
    form: { submitOnChange: true, closeOnSubmit: false },
    actions: {
      restShort: DndCustomActorSheet.#onRestShort,
      restLong: DndCustomActorSheet.#onRestLong,
      abilityIncrease: DndCustomActorSheet.#onAbilityIncrease,
      abilityDecrease: DndCustomActorSheet.#onAbilityDecrease,
      useItem: DndCustomActorSheet.#onUseItem,
      rollAbility: DndCustomActorSheet.#onRollAbility,
      rollSave: DndCustomActorSheet.#onRollSave,
      rollSkill: DndCustomActorSheet.#onRollSkill,
      rollWeaponAttack: DndCustomActorSheet.#onRollWeaponAttack,
      rollWeaponDamage: DndCustomActorSheet.#onRollWeaponDamage,
      toggleConditionSelection: DndCustomActorSheet.#onToggleConditionSelection,
      exhaustionIncrease: DndCustomActorSheet.#onExhaustionIncrease,
      exhaustionDecrease: DndCustomActorSheet.#onExhaustionDecrease,
      castSpell: DndCustomActorSheet.#onCastSpell,
      rollSpellDamage: DndCustomActorSheet.#onRollSpellDamage,
      dropConcentration: DndCustomActorSheet.#onDropConcentration,
      levelUp: DndCustomActorSheet.#onLevelUp,
      resolvePendingAsi: DndCustomActorSheet.#onResolvePendingAsi,
      openCreationWizard: DndCustomActorSheet.#onOpenCreationWizard,
      openClassSheet: DndCustomActorSheet.#onOpenClassSheet,
      openSubclassSheet: DndCustomActorSheet.#onOpenSubclassSheet,
      openOriginSheet: DndCustomActorSheet.#onOpenOriginSheet,
      rollDeathSave: DndCustomActorSheet.#onRollDeathSave,
      rollFeature: DndCustomActorSheet.#onRollFeature,
      rollFeatureSave: DndCustomActorSheet.#onRollFeatureSave,
      grantFeatureCondition: DndCustomActorSheet.#onGrantFeatureCondition,
      rollOpposedCheck: DndCustomActorSheet.#onRollOpposedCheck,
      useFeatureCharge: DndCustomActorSheet.#onUseFeatureCharge,
      useResourceTechnique: DndCustomActorSheet.#onUseResourceTechnique,
      useConditionalFeature: DndCustomActorSheet.#onUseConditionalFeature,
      chooseFeatureOption: DndCustomActorSheet.#onChooseFeatureOption,
      chooseInitiateMagic: DndCustomActorSheet.#onChooseInitiateMagic,
      summonCompanion: DndCustomActorSheet.#onSummonCompanion,
      useManeuver: DndCustomActorSheet.#onUseManeuver,
      useOpenHandTechnique: DndCustomActorSheet.#onUseOpenHandTechnique,
      toggleReaction: DndCustomActorSheet.#onToggleReaction,
      toggleAction: DndCustomActorSheet.#onToggleAction,
      toggleBonusAction: DndCustomActorSheet.#onToggleBonusAction,
      mount: DndCustomActorSheet.#onMount,
      dismount: DndCustomActorSheet.#onDismount,
      enterWildShape: DndCustomActorSheet.#onEnterWildShape,
      revertWildShape: DndCustomActorSheet.#onRevertWildShape,
      rollWildShapeAttack: DndCustomActorSheet.#onRollWildShapeAttack,
      rollWildShapeAttackDamage: DndCustomActorSheet.#onRollWildShapeAttackDamage,
      selectSpellLevel: DndCustomActorSheet.#onSelectSpellLevel
    }
  };

  static PARTS = {
    header: { template: `systems/${SYSTEM_ID}/templates/actor/character-sheet.hbs` },
    tabs: { template: "templates/generic/tab-navigation.hbs" },
    stats: { template: `systems/${SYSTEM_ID}/templates/actor/tab-stats.hbs` },
    equipment: { template: `systems/${SYSTEM_ID}/templates/actor/tab-equipment.hbs` },
    inventory: { template: `systems/${SYSTEM_ID}/templates/actor/tab-inventory.hbs` },
    abilities: { template: `systems/${SYSTEM_ID}/templates/actor/tab-abilities.hbs` },
    journal: { template: `systems/${SYSTEM_ID}/templates/actor/tab-journal.hbs` }
  };

  static TABS = {
    primary: {
      tabs: [
        { id: "stats", icon: "fa-solid fa-chart-simple" },
        { id: "equipment", icon: "fa-solid fa-shield-halved" },
        { id: "inventory", icon: "fa-solid fa-sack" },
        { id: "abilities", icon: "fa-solid fa-book-sparkles" },
        { id: "journal", icon: "fa-solid fa-feather" }
      ],
      initial: "stats",
      labelPrefix: "DND_CUSTOM.Tabs"
    }
  };

  /** Retour de test : liste des Sorts (onglet Capacités) triée par niveau nécessitait de
   *  scroller pour atteindre les paliers hauts — regroupée en onglets par niveau (cf.
   *  #onSelectSpellLevel, context.spellsByLevel). Palier actuellement affiché, mémorisé sur
   *  l'instance de la fiche (comme `this.tabGroups` le fait nativement pour l'onglet primaire)
   *  pour survivre à un re-render déclenché ailleurs (ex. lancer un sort met à jour les
   *  emplacements) — sans ça, chaque re-render retomberait sur le premier palier. */
  #activeSpellLevel = null;

  /** @override
   *  Ne rend JAMAIS cette fiche tant que l'assistant de création (CharacterCreationWizard) est
   *  actuellement ouvert pour ce même Actor — bloque directement à la source la course entre le
   *  rendu natif post-création de Foundry et l'ouverture de l'assistant (cf. Hooks.on(
   *  "createActor"), dnd-custom-ai.js), plutôt que de dépendre du timing interne des hooks
   *  Foundry pour supprimer ce rendu natif : 3 tentatives précédentes insuffisantes (retour de
   *  test répété — la fiche continuait de flasher par-dessus l'assistant), la dernière en date
   *  posant `options.renderSheet = false` dans `preCreateActor` (toujours en place ci-dessous,
   *  best-effort, mais visiblement pas fiable à elle seule selon la version de Foundry). Ici, la
   *  détection ne dépend d'aucune hypothèse de timing/plomberie interne : `this.actor` reste la
   *  même référence quel que soit l'appelant, et `foundry.applications.instances` est mis à jour
   *  de façon synchrone dès la construction/fermeture d'une Application (cf. doc Foundry v11+).
   *  Contrairement à bloquer sur `!(system.class && system.origin)` (root cause initialement
   *  envisagée), cette approche scope précisément la fenêtre de course : une fois l'assistant
   *  refermé — même sans avoir terminé — la fiche native redevient normalement accessible (cf.
   *  T-WIZ-018, wizard.cy.js : rouvrir la fiche après une fermeture sans soumission doit encore
   *  afficher le bouton "Créer un personnage"). */
  render(...args) {
    const wizardOpen = [...foundry.applications.instances.values()].some(
      (app) => app instanceof CharacterCreationWizard && app.actor?.id === this.actor.id
    );
    if (wizardOpen) return Promise.resolve(this);
    return super.render(...args);
  }

  /** @override
   *  Rebranche la persistance des états (cf. #onToggleConditionSelection/
   *  #applyPendingConditions) après chaque rendu — un nouveau `<details class="conditions-
   *  dropdown">` est recréé à chaque fois (partial Handlebars), donc pas de garde anti-doublon
   *  nécessaire ici : l'ancien nœud et son listener disparaissent avec lui. */
  _onRender(context, options) {
    super._onRender(context, options);
    this.#attachConditionsListeners();
  }

  /** @override
   * Construit le contexte partagé par tous les onglets (PARTS) : valeurs brutes du système
   * + valeurs dérivées (modificateurs, bonus de maîtrise, poids, richesse) calculées ici
   * pour garder les templates .hbs sans logique.
   */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const system = this.actor.system;

    context.actor = this.actor;
    context.system = system;
    context.config = DND_CUSTOM;
    context.isGM = game.user.isGM;
    // Chargées une fois au démarrage par le hook "init" (voir dnd-custom-ai.js).
    context.origins = game.dndCustomAi?.origins ?? {};
    // Classe/Origine : champs fixes sur la fiche (retour de test — ne sont plus des listes
    // déroulantes, la seule façon de les définir/changer est l'assistant de création, cf.
    // #onOpenClassSheet/#onOpenOriginSheet ci-dessous pour l'ouverture de leur description).
    context.classLabel = system.class ? game.i18n.localize(DND_CUSTOM.classes[system.class]) : "";
    context.originLabel = context.origins[system.origin]?.label ?? "";

    // Sous-classe : sélecteur direct sur la fiche (verrouillé MJ, cf. hook preUpdateActor,
    // dnd-custom-ai.js), pas un flux dédié comme l'assistant de création — elle se choisit en
    // cours de partie, à un niveau propre à chaque classe (DND_CUSTOM.subclassLevel), pas à la
    // création du personnage (sauf Clerc/Ensorceleur/Occultiste, obtenue dès le niveau 1).
    const subclassChoices = DND_CUSTOM.subclasses[system.class] ?? {};
    context.subclassLevel = DND_CUSTOM.subclassLevel[system.class] ?? null;
    context.subclassAvailable = context.subclassLevel !== null && system.attributes.level >= context.subclassLevel;
    context.subclassOptions = Object.entries(subclassChoices).map(([key, labelKey]) => ({
      key,
      label: game.i18n.localize(labelKey),
      selected: key === system.subclass
    }));
    context.subclassLabel = system.subclass ? game.i18n.localize(subclassChoices[system.subclass]) : "";
    // Indice affiché tant que le niveau requis n'est pas atteint (ex. "Disponible au niveau 3"),
    // uniquement si la classe a une sous-classe modélisée du tout.
    context.subclassLevelHint =
      context.subclassLevel && !context.subclassAvailable
        ? game.i18n.format("DND_CUSTOM.Actor.SubclassLevelHint", { level: context.subclassLevel })
        : "";
    // Bouton "Créer un personnage" masqué une fois Classe ET Origine renseignées (même
    // condition que l'ouverture automatique de l'assistant sur un Actor vierge, cf.
    // Hooks.on("createActor"), dnd-custom-ai.js) : retour de test — il n'y avait plus lieu de
    // le proposer une fois le personnage construit, et le relancer par erreur écraserait ses
    // choix (SRD 5e, points de vie, équipement de départ) sans confirmation.
    context.showCreationWizardButton = !(system.class && system.origin);

    context.isSpellcaster = DND_CUSTOM.spellcastingClasses.includes(system.class);
    // En-tête spécialisé de l'onglet Capacités/Sorts (habillage seulement — titre/icône/
    // accroche propres à la classe) : partial Handlebars unique
    // (templates/actor/abilities/class-flavor.hbs), résolue via
    // {{> (lookup this "classTabPartial")}} dans tab-abilities.hbs, préchargée/enregistrée au
    // hook "init" (cf. dnd-custom-ai.js > loadTemplates). Le partial n'affiche rien tant que
    // classFlavorTitle n'est pas posé (aucune classe valide choisie, ex. assistant de création
    // en cours).
    context.classTabPartial = `systems/${SYSTEM_ID}/templates/actor/abilities/class-flavor.hbs`;
    if (DND_CUSTOM.classes[system.class]) {
      context.classFlavorKey = system.class;
      context.classFlavorIcon = DND_CUSTOM.classFlavorIcon[system.class];
      context.classFlavorTitle = game.i18n.localize(`DND_CUSTOM.Abilities.ClassFlavor.${system.class}.Title`);
      context.classFlavorTagline = game.i18n.localize(`DND_CUSTOM.Abilities.ClassFlavor.${system.class}.Tagline`);
    }

    // Économie d'action de combat (SRD 5e) : disponibilité de la réaction, affichée en en-tête
    // commune (indicateur cliquable) et sur les Capacités/Sorts "Réaction" de l'onglet
    // Capacités/Sorts (cf. #consumeActionEconomy ci-dessous, hooks updateCombat/deleteCombat).
    // Action/Action bonus (chantier "Suivi de l'action/action bonus", 2026-08-23) : mêmes
    // indicateurs en en-tête, mais suivi non-bloquant (cf. helpers/action-economy.js) — jamais
    // utilisés pour griser un bouton de Capacité/Sort.
    context.reactionAvailable = canUseReaction(system);
    context.actionAvailable = system.combat.actionAvailable;
    context.bonusActionAvailable = system.combat.bonusActionAvailable;

    // Combat monté (don SRD 5e, cf. #onMount ci-dessous) : monture actuellement chevauchée,
    // résolue en Actor pour affichage (nom) — vide si non montée.
    context.mount = system.combat.mountedActorId ? (game.actors.get(system.combat.mountedActorId) ?? null) : null;

    // Forme sauvage (don SRD 5e, cf. #onEnterWildShape ci-dessous) : forme actuellement prise,
    // résolue en Actor pour affichage (CA/Vitesse/PV de la forme) — vide si forme normale.
    context.wildShapeForm = system.combat.wildShapeActorId ? (game.actors.get(system.combat.wildShapeActorId) ?? null) : null;

    // Attaques de la Forme sauvage actuellement prise (refonte 2026-09-04, cf.
    // #onRollWildShapeAttack ci-dessous) : mêmes libellés déjà formatés (attackBonusLabel/
    // damageLabel) que context.attacks côté fiche PNJ (npc-sheet.js), pour rester accessibles
    // directement depuis la fiche du personnage sans ouvrir celle de la forme.
    context.wildShapeAttacks = context.wildShapeForm
      ? context.wildShapeForm.system.attacks.map((attack, index) => {
          const abilityMod = context.wildShapeForm.system.abilities[attack.ability]?.mod ?? 0;
          return {
            index,
            name: attack.name,
            attackBonusLabel: formatModifier(abilityMod + attack.bonus),
            damageLabel: attack.damage.dice ? `${attack.damage.dice}${formatModifier(abilityMod + attack.damage.bonus)}` : ""
          };
        })
      : [];

    // Origine choisie : bonus de caractéristiques déjà appliqués dans system.abilities.*.total
    // (cf. CharacterData#prepareDerivedData) ; avantage de compétences et trait spécial sont
    // purement informatifs (pas de système de jet de dés automatisé sur cette fiche).
    const currentOrigin = context.origins[system.origin] ?? null;
    const originAbilityBonuses = currentOrigin?.abilityBonuses ?? {};
    const originSkillAdvantages = new Set(currentOrigin?.skillAdvantages ?? []);
    context.originTrait = currentOrigin?.specialTrait ?? null;

    const hp = system.attributes.hp;
    context.hpPercent = Math.max(0, Math.min(100, Math.round((hp.value / (hp.max || 1)) * 100)));

    context.proficiencyBonus = proficiencyBonus(system.attributes.level);
    context.levelUpAvailable = levelForXp(system.xp) > system.attributes.level;
    // Choix Amélioration de caractéristiques/Don dû mais pas encore résolu (cf.
    // #onResolvePendingAsi, character-data.js#pendingAsiChoices) : badge de rattrapage manuel
    // dans l'en-tête tant que > 0.
    context.pendingAsiChoices = system.attributes.pendingAsiChoices;
    // Affichage XP détaillé (total + seuil exact) réservé au MJ (cf. template : bloc entier
    // sous {{#if isGM}}) : seuil du prochain niveau (DND_CUSTOM.xpThresholds[niveau actuel],
    // la table étant indexée niveau-1), absent au niveau 20 (déjà au maximum).
    context.xpNextThreshold = system.attributes.level < 20 ? DND_CUSTOM.xpThresholds[system.attributes.level] : null;
    // Barre de progression XP visible au joueur (retour de test — PROJECT.md excluait
    // jusqu'ici tout affichage d'XP au joueur ; décision revue pour n'exposer que la
    // progression relative vers le niveau suivant, jamais le total ni les seuils chiffrés,
    // qui restent réservés au bloc MJ ci-dessus). 100% au niveau 20 (rien au-delà à afficher).
    const currentThreshold = DND_CUSTOM.xpThresholds[system.attributes.level - 1] ?? 0;
    context.xpPercent = context.xpNextThreshold
      ? Math.max(
          0,
          Math.min(
            100,
            Math.round(
              ((system.xp - currentThreshold) / (context.xpNextThreshold - currentThreshold)) * 100
            )
          )
        )
      : 100;

    // Panneau Agonie (SRD 5e) : visible tant que le personnage est à 0 PV et n'a pas encore
    // atteint 3 réussites (stabilisé) ou 3 échecs (mort) — cf. hook updateActor dans
    // dnd-custom-ai.js qui gère la transition et le décompte automatique.
    const death = system.attributes.death;
    context.dying = {
      active: hp.value === 0,
      stabilized: death.successes >= 3,
      dead: death.failures >= 3,
      resolved: death.successes >= 3 || death.failures >= 3,
      successPips: [1, 2, 3].map((n) => death.successes >= n),
      failurePips: [1, 2, 3].map((n) => death.failures >= n)
    };

    const dexMod = abilityModifier(system.abilities.dex.total);
    // Bug retour de test (exposé par l'automatisation du don Alerte, ANOMALIES_ACTIVES.md
    // 2026-08-19) : recalculait le mod. d'Initiative à partir du seul mod. de Dex, ignorant tout
    // bonus dérivé (Traqueur des ténèbres +2, Alerte +5, cf. CharacterData#prepareDerivedData >
    // attributes.initiativeMod, déjà la source de vérité utilisée par la formule d'Initiative du
    // Combat Tracker natif dans system.json) — la fiche affichait donc un mod. différent de celui
    // réellement utilisé au jet d'Initiative. Lit maintenant la même donnée dérivée.
    context.initiative = {
      mod: system.attributes.initiativeMod,
      modLabel: formatModifier(system.attributes.initiativeMod)
    };

    const wisMod = abilityModifier(system.abilities.wis.total);
    context.passivePerception = passivePerception(
      wisMod,
      system.skills.perception.proficient,
      context.proficiencyBonus
    );

    if (context.isSpellcaster) {
      const spellAbility = DND_CUSTOM.spellcastingAbility[system.class];
      const spellAbilityMod = abilityModifier(system.abilities[spellAbility].total);
      context.spellcasting = {
        ability: spellAbility,
        abilityLabel: DND_CUSTOM.abilities[spellAbility],
        dc: spellSaveDC(context.proficiencyBonus, spellAbilityMod),
        attackBonus: spellAttackBonus(context.proficiencyBonus, spellAbilityMod),
        attackBonusLabel: formatModifier(spellAttackBonus(context.proficiencyBonus, spellAbilityMod))
      };
    }

    const items = this.actor.items.contents;
    // Aptitudes multiples (Barde, SRD 5e) : moitié du bonus de maîtrise (arrondi à
    // l'inférieur) sur les compétences non maîtrisées, appliqué automatiquement ci-dessous
    // (affichage) et dans #onRollSkill (jet réel) dès que le personnage possède la Capacité.
    const jackOfAllTrades = hasFeature(items, "Aptitudes multiples");

    context.abilities = Object.entries(system.abilities).map(([key, ability]) => {
      const mod = abilityModifier(ability.total);
      const originBonus = originAbilityBonuses[key] ?? 0;
      return {
        key,
        label: DND_CUSTOM.abilities[key],
        value: ability.value,
        total: ability.total,
        originBonus,
        mod,
        modLabel: formatModifier(mod),
        save: {
          proficient: system.saves[key].proficient,
          mod: mod + (system.saves[key].proficient ? context.proficiencyBonus : 0)
        }
      };
    });

    context.skills = Object.entries(system.skills)
      .map(([key, skill]) => {
        const mod = skillModifier(system, key, context.proficiencyBonus, jackOfAllTrades);
        return {
          key,
          label: game.i18n.localize(DND_CUSTOM.skills[key]),
          originAdvantage: originSkillAdvantages.has(key),
          // Désavantage imposé par l'armure équipée (SRD 5e) : ne concerne que la Discrétion
          // (cf. CharacterData#prepareDerivedData > this.stealthDisadvantage).
          armorDisadvantage: key === "stealth" && system.stealthDisadvantage,
          // Retour de test (2 passes) : affichait d'abord la clé technique brute ("str", "dex"...),
          // remplacée par le nom complet localisé — puis un 2e retour de test a demandé une
          // abréviation (le nom complet prenait trop de place à côté de chaque compétence) :
          // vraie abréviation localisée (DND_CUSTOM.abilitiesShort, config.js), pas un retour à
          // la clé technique brute d'origine.
          ability: game.i18n.localize(DND_CUSTOM.abilitiesShort[skill.ability]),
          proficient: skill.proficient,
          jackOfAllTrades: jackOfAllTrades && !skill.proficient,
          mod,
          modLabel: formatModifier(mod)
        };
      })
      .sort((a, b) => a.label.localeCompare(b.label, game.i18n.lang));

    context.weapons = items.filter((item) => item.type === "weapon");
    context.armors = items.filter((item) => item.type === "armor");
    context.gear = items.filter((item) => item.type === "gear");
    context.features = items.filter((item) => item.type === "feature");
    // Set natif (Actor#statuses), pas une donnée sérialisée : utilisé par le helper Handlebars
    // featureDisabled (cf. handlebars-helpers.js) pour griser une Capacité tant que l'état
    // requis par system.requiresState (ex. "raging") n'est pas actif sur l'Actor.
    context.activeStatuses = this.actor.statuses;
    // Le don Sentinelle modifie le déclencheur affiché d'Attaque d'opportunité si le personnage
    // possède les deux (cf. opportunityAttackTrigger, rules.js) — dérivé ici, jamais écrit sur
    // l'Item lui-même : reste juste automatiquement si Sentinelle est ajoutée/retirée.
    const hasSentinel = context.features.some((feature) => feature.name === "Sentinelle");
    context.features = context.features.map((feature) => {
      if (feature.name !== "Attaque d'opportunité" || !hasSentinel) return feature;
      return {
        id: feature.id,
        name: feature.name,
        system: {
          ...feature.system,
          reactionTrigger: opportunityAttackTrigger(feature.system.reactionTrigger, hasSentinel)
        }
      };
    });
    // Techniques consommant la réserve d'une autre Capacité (`system.costsResource`, ex. les
    // techniques de Moine consommant du Ki) : état de la réserve au moment du render, par id
    // de la technique (même convention lookup-par-id que weaponStats/armorStats) — grisé/
    // non cliquable dès que la réserve est vide (retour de test).
    context.featureResourceState = {};
    for (const feature of context.features) {
      const resourceName = feature.system.costsResource;
      // Une technique à jet de sauvegarde (system.savingThrow, ex. les options de Canalisation
      // divine du Paladin) affiche déjà son propre bouton dédié (#onRollFeatureSave, qui gère
      // lui-même la consommation de costsResource) — pas ce bouton générique "useResourceTechnique"
      // en plus, qui doublonnerait la consommation de charge.
      if (!resourceName || feature.system.savingThrow) continue;
      const resource = context.features.find((candidate) => candidate.name === resourceName);
      if (!resource) continue;
      context.featureResourceState[feature.id] = {
        resourceName,
        // Nom de la technique dupliqué ici (déjà accessible via `this.name` dans la boucle
        // `{{#each features}}` du template) pour rester entièrement autonome une fois entré
        // dans le `{{#with (lookup ...)}}` qui suit — évite toute dépendance à la résolution
        // Handlebars `../` d'un contexte `#with` imbriqué dans un `#each`.
        techniqueName: feature.name,
        remaining: resource.system.uses.value,
        max: resource.system.uses.max
      };
    }
    // Choix ponctuel proposé par une Capacité (`system.grantsChoice`, ex. "Aspect de la bête") :
    // bouton "Choisir" affiché (tab-abilities.hbs) tant que le champ ciblé
    // (`system.combat.<grantsChoice>`) est encore vide, par id de Capacité (même convention
    // lookup-par-id que featureResourceState ci-dessus).
    context.featureChoiceMade = {};
    for (const feature of context.features) {
      const fieldKey = feature.system.grantsChoice;
      if (fieldKey) context.featureChoiceMade[feature.id] = !!this.actor.system.combat[fieldKey];
    }

    // Compagnon animal (Maître des bêtes, Rôdeur) : bouton "Invoquer" masqué une fois déjà
    // invoqué (cf. #onSummonCompanion ci-dessus/helpers/companion.js).
    context.companionAlreadySummoned = !!this.actor.getFlag(SYSTEM_ID, "beastCompanionCreated");

    // Langues connues (onglet Journal) : Commune et langue d'Origine octroyées automatiquement
    // à la création (cf. helpers/class-content.js > grantLanguages), langues spéciales toujours
    // ajoutées à la main (glisser depuis le compendium Langues). Retour de test : classées dans
    // l'ordre d'ajout (pas alphabétique), Commune forcée en tête quel que soit cet ordre — clé
    // stable `system.category === "common"` comparée, jamais le nom localisé (cf. convention
    // "clés stables" du projet). `items` reflète déjà l'ordre d'ajout (EmbeddedCollection en
    // ordre de création) ; `Array#sort` est stable depuis ES2019 (V8/Electron), donc cette seule
    // comparaison ne réordonne QUE Commune, laissant les autres langues dans leur ordre d'origine.
    context.languages = items
      .filter((item) => item.type === "language")
      .sort((a, b) => (a.system.category === "common" ? -1 : b.system.category === "common" ? 1 : 0));
    // Sorts groupés par niveau (0 = tour de magie) pour l'onglet "Sorts" ; emplacements par
    // niveau (1-9), cf. CharacterData#prepareDerivedData et rules.js > spellSlotsForClass.
    const spells = items.filter((item) => item.type === "spell");
    context.spellsByLevel = Array.from({ length: 10 }, (_, level) => ({
      level,
      label:
        level === 0
          ? game.i18n.localize("DND_CUSTOM.Abilities.Cantrips")
          : game.i18n.format("DND_CUSTOM.Abilities.SpellLevelLabel", { level }),
      // Libellé court pour l'onglet par niveau (retour de test, cf. #activeSpellLevel
      // ci-dessus) : "Tours"/"Niv. X" plutôt que le libellé complet "Sorts de niveau X",
      // trop long pour tenir dans une bande d'onglets.
      shortLabel:
        level === 0
          ? game.i18n.localize("DND_CUSTOM.Abilities.CantripsShort")
          : game.i18n.format("DND_CUSTOM.Abilities.SpellSlotLevelShort", { level }),
      spells: spells
        .filter((spell) => spell.system.level === level)
        .sort((a, b) => a.name.localeCompare(b.name, game.i18n.lang))
        // showDamageButton : un sort à jet d'attaque OU à sauvegarde (cf. SpellData#save,
        // item-data.js) OU qui touche automatiquement sans aucun jet (ex. Projectile magique,
        // seul `damage.dice` renseigné) peut avoir des dégâts — même logique que SpellItemSheet
        // (item-sheets.js), précalculée ici pour ne pas dupliquer un `{{#if}}` combiné dans le
        // template (aucun helper Handlebars "or" dans ce système).
        .map((spell) => ({
          item: spell,
          showDamageButton: spell.system.attack || Boolean(spell.system.save.ability) || Boolean(spell.system.damage.dice)
        }))
    })).filter((group) => group.spells.length);
    // Palier affiché par défaut : celui mémorisé sur l'instance s'il existe encore parmi les
    // paliers ayant des Sorts (ex. le dernier a été supprimé), sinon le premier palier
    // disponible — jamais `null` tant qu'au moins un palier a des Sorts.
    if (!context.spellsByLevel.some((group) => group.level === this.#activeSpellLevel)) {
      this.#activeSpellLevel = context.spellsByLevel[0]?.level ?? null;
    }
    context.activeSpellLevel = this.#activeSpellLevel;
    context.spellsByLevel = context.spellsByLevel.map((group) => ({
      ...group,
      active: group.level === this.#activeSpellLevel
    }));
    // Incantation mineure de sous-classe (ex. Chevalier occulte) : affiche la colonne Sorts même
    // pour une classe non lanceuse (context.isSpellcaster resterait faux) dès qu'elle possède au
    // moins un Sort octroyé — sinon ses 3 Sorts fixes n'apparaîtraient jamais sur sa fiche.
    context.hasAnySpells = context.isSpellcaster || spells.length > 0;
    // Emplacements de sorts par niveau (système réel, cf. CharacterData#prepareDerivedData et
    // rules.js > spellSlotsForClass) : un chip par palier réellement accessible (max > 0), trié
    // du plus bas au plus haut. isPactMagic (Occultiste, Magie de Pacte) pilote le badge dédié
    // sur l'onglet (tab-abilities.hbs) rappelant la récupération au repos court.
    context.spellSlots = SPELL_LEVELS.map((level) => ({
      level,
      value: system.spells.slots[level].value,
      max: system.spells.slots[level].max
    })).filter((slot) => slot.max > 0);
    context.isPactMagic = Boolean(system.spells.isPactMagic);
    context.concentratingOn = system.spells.concentratingOn;
    // Onglet Inventaire scindé en deux tableaux : Armes/Armures (emplacements d'équipement,
    // cf. context.equipment) d'un côté, Objets/Outils de l'autre.
    context.weaponsAndArmor = items.filter((item) => ["weapon", "armor"].includes(item.type));
    context.gearAndTools = items.filter((item) => ["gear", "tool"].includes(item.type));
    context.inventoryItems = items.filter((item) =>
      ["weapon", "armor", "gear", "tool"].includes(item.type)
    );

    // Répartit les armes/armures équipées dans leurs emplacements (main principale/secondaire,
    // armure, accessoires) pour l'onglet "Équipement" — une arme à deux mains occupe les deux
    // mains à la fois (cf. equipmentSlots dans rules.js).
    const equippedWeaponsAndArmor = [...context.weapons, ...context.armors].filter(
      (item) => item.system.equipped
    );
    const findBySlot = (slot) =>
      equippedWeaponsAndArmor.find((item) => equipmentSlots(item.type, item.system).includes(slot)) ?? null;
    const mainHand = findBySlot("mainHand");
    const offHand = findBySlot("offHand");
    context.equipment = {
      mainHand,
      offHand,
      // Une arme à deux mains occupe aussi la main secondaire : évite d'afficher deux fois le
      // même objet, affiche plutôt une mention dédiée (cf. tab-equipment.hbs).
      offHandOccupiedByMainHand: Boolean(mainHand && offHand && mainHand.id === offHand.id),
      armor: findBySlot("armor"),
      accessories: equippedWeaponsAndArmor.filter((item) =>
        equipmentSlots(item.type, item.system).includes("accessory")
      )
    };

    // Bonus d'attaque et dégâts (avec alternative Polyvalente à deux mains) de chaque arme
    // possédée, affichés dans le tableau Armes/Armures de l'onglet Inventaire — bonus de
    // maîtrise appliqué seulement si la classe couvre cette catégorie d'arme (cf.
    // isProficientWithWeapon/weaponAttackDamage dans rules.js).
    context.weaponStats = {};
    for (const weapon of context.weapons) {
      const proficient = isProficientWithWeapon(system.class, weapon.system.weaponType);
      const atk = weaponAttackDamage(weapon.system, system.abilities, context.proficiencyBonus, proficient);
      const damageType = weapon.system.damage.type
        ? game.i18n.localize(DND_CUSTOM.damageTypes[weapon.system.damage.type])
        : "";
      const oneHandedLabel = weapon.system.damage.dice
        ? `${weapon.system.damage.dice}${formatModifier(atk.abilityMod)} ${damageType}`.trim()
        : "";
      // Polyvalente : la main secondaire libre est considérée occupée par l'arme elle-même
      // (empoignée à deux mains), sinon elle reste tenue à une main (cf. retour de test —
      // l'affichage montrait toujours les deux valeurs sans jamais refléter l'équipement réel).
      const isTwoHandedActive =
        weapon.system.properties.versatile &&
        Boolean(weapon.system.damageVersatile.dice) &&
        mainHand?.id === weapon.id &&
        (!offHand || offHand.id === weapon.id);
      let versatileLabel = "";
      if (weapon.system.properties.versatile && weapon.system.damageVersatile.dice) {
        const twoHandedLabel = `${weapon.system.damageVersatile.dice}${formatModifier(atk.abilityMod)} ${damageType}`.trim();
        if (isTwoHandedActive) {
          versatileLabel = `${oneHandedLabel} (${game.i18n.localize("DND_CUSTOM.Equipment.OneHandedShort")})`;
        } else {
          versatileLabel = `${twoHandedLabel} (${game.i18n.localize("DND_CUSTOM.Equipment.TwoHandedShort")})`;
        }
      }
      context.weaponStats[weapon.id] = {
        attackLabel: formatModifier(atk.attackBonus),
        damageLabel: isTwoHandedActive
          ? `${weapon.system.damageVersatile.dice}${formatModifier(atk.abilityMod)} ${damageType}`.trim()
          : oneHandedLabel,
        versatileLabel,
        isTwoHandedActive,
        proficient
      };
    }

    // Bonus de CA apporté par chaque armure/bouclier/accessoire possédé pris isolément (même
    // affichage que les dégâts d'arme ci-dessus, cf. armorContribution dans rules.js).
    context.armorStats = {};
    for (const armor of context.armors) {
      const contribution = armorContribution(armor.system, dexMod);
      // Armure du corps : CA totale affichée telle quelle (ex. "15") ; bouclier/accessoire :
      // bonus additionnel affiché avec son signe (ex. "+2"), pas une CA absolue.
      context.armorStats[armor.id] = {
        acLabel: armor.system.slot === "armor" ? `${contribution}` : formatModifier(contribution),
        typeLabel: DND_CUSTOM.armorTypes[armor.system.armorType]
      };
    }

    // États SRD 5e (cf. CONFIG.statusEffects, scripts/dnd-custom-ai.js) : actifs via
    // ActiveEffect (this.actor.statuses), Exhaustion à part (niveau 0-6, cf. character-data.js).
    context.conditions = CONFIG.statusEffects.map((status) => ({
      id: status.id,
      label: game.i18n.localize(status.name),
      img: status.img,
      active: this.actor.statuses.has(status.id)
    }));
    // Retour de test : les états actifs n'étaient visibles que sur l'onglet Statistiques —
    // ce résumé compact dans l'en-tête (partagé par tous les onglets, cf. character-sheet.hbs)
    // les garde visibles "quelque part sur la fiche générale" quel que soit l'onglet ouvert.
    context.activeConditions = context.conditions.filter((condition) => condition.active);

    // Chantier "types de dégâts" (Phase 1, 2026-08-24) : 3 groupes de cases à cocher (un par
    // ensemble), même pattern que la fiche PNJ (npc-sheet.js) — réglé par le MJ uniquement
    // (verrouillé côté Joueur, comme la fiche Origine), cf. damageAffinitySchema
    // (shared-schema.js), damageTypeMultiplier (dnd-custom-ai.js).
    const damageAffinityOptions = (setField) =>
      Object.entries(DND_CUSTOM.damageTypes).map(([key, label]) => ({ key, label, checked: setField.has(key) }));
    context.damageAffinityGroups = [
      {
        field: "damageResistances",
        titleKey: "DND_CUSTOM.Npc.DamageResistances",
        options: damageAffinityOptions(system.combat.damageResistances)
      },
      {
        field: "damageImmunities",
        titleKey: "DND_CUSTOM.Npc.DamageImmunities",
        options: damageAffinityOptions(system.combat.damageImmunities)
      },
      {
        field: "damageVulnerabilities",
        titleKey: "DND_CUSTOM.Npc.DamageVulnerabilities",
        options: damageAffinityOptions(system.combat.damageVulnerabilities)
      }
    ];
    // Retour de test : côté Joueur, le tableau complet (une case par type de dégât, réservé au
    // MJ) n'a aucune valeur — seules les entrées déjà actives comptent. Résumé filtré, affiché
    // à la place du tableau pour tout non-MJ (cf. damage-affinity-panel, tab-stats.hbs).
    context.damageAffinitySummary = context.damageAffinityGroups
      .map((group) => ({
        titleKey: group.titleKey,
        labelsText: group.options
          .filter((option) => option.checked)
          .map((option) => game.i18n.localize(option.label))
          .join(", ")
      }))
      .filter((group) => group.labelsText);

    context.carriedWeight = carriedWeight(context.inventoryItems);
    context.carryingCapacity =
      carryingCapacity(system.abilities.str.total, "kg") + carryingCapacityBonus(context.inventoryItems);
    context.carryingCapacityPercent = Math.min(
      100,
      Math.round((context.carriedWeight / (context.carryingCapacity || 1)) * 100)
    );
    context.overCapacity = context.carriedWeight > context.carryingCapacity;
    context.currencyTotalCopper = currencyTotalInCopper(system.currency);

    return context;
  }

  /** @override
   * Expose le tab actif de chaque PART sous `context.tab` (utilisé par les .hbs
   * pour poser `data-tab`/la classe CSS "active" sur leur élément racine).
   */
  async _preparePartContext(partId, context) {
    context = await super._preparePartContext(partId, context);
    if (context.tabs?.[partId]) context.tab = context.tabs[partId];
    return context;
  }

  /** Un personnage Mort (3 échecs de jet de sauvegarde contre la mort, cf. context.dying.dead)
   *  ne peut plus se reposer — filet de sécurité côté données, en complément du bouton masqué/
   *  désactivé côté template (character-sheet.hbs), même principe que les champs verrouillés
   *  MJ (cf. hook preUpdateActor, dnd-custom-ai.js). */
  #isDead() {
    return this.actor.system.attributes.death.failures >= 3;
  }

  /** Repos court (simplifié, pas de dés de vie) : récupère la moitié des PV max, sans
   *  dépasser le max. Restaure aussi les emplacements de sorts de l'Occultiste (Magie de Pacte,
   *  SRD 5e : seule classe qui récupère ses emplacements au repos court).
   *
   *  Règle maison (absente du SRD, cf. CharacterData#attributes.shortRestCount) : à partir du
   *  4e repos court depuis le dernier repos long (celui-ci inclus), CHAQUE repos court
   *  supplémentaire ajoute 1 point d'Épuisement (plafonné à 6, SRD) — décourage l'abus répété de
   *  repos courts plutôt qu'un unique repos long. Le soin de moitié des PV max ci-dessus reste
   *  lui inchangé, quel que soit ce compteur. */
  static async #onRestShort() {
    if (this.#isDead()) return;
    const attributes = this.actor.system.attributes;
    const shortRestCount = attributes.shortRestCount + 1;
    const gainsExhaustion = shortRestCount > 3;
    const updates = {
      "system.attributes.hp.value": Math.min(attributes.hp.value + Math.floor(attributes.hp.max / 2), attributes.hp.max),
      "system.attributes.shortRestCount": shortRestCount,
      ...(gainsExhaustion ? { "system.attributes.exhaustion": Math.min(6, attributes.exhaustion + 1) } : {})
    };
    if (this.actor.system.class === "warlock") Object.assign(updates, this.#spellSlotResetUpdates());
    await this.actor.update(updates);
    await this.#resetFeatureUses(["shortRest"]);
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      content: game.i18n.format("DND_CUSTOM.Chat.RestShort", { name: this.actor.name })
    });
    if (gainsExhaustion) {
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: this.actor }),
        content: game.i18n.format("DND_CUSTOM.Chat.TooManyShortRests", { name: this.actor.name, count: shortRestCount })
      });
    }
    await this.#offerSpellSlotRecoveries();
  }

  /** Récupération arcanique/naturelle (cf. FeatureData#recoversSpellSlots, item-data.js) :
   *  retour de test — le texte SRD de ces deux Capacités ("une fois par jour, LORS D'UN REPOS
   *  COURT") n'était suivi par aucun code, le bouton de jet manuel restait cliquable à tout
   *  moment. Déclenchée ici pour chaque Capacité de ce type encore chargée (uses.value > 0,
   *  remis à zéro seulement au repos long, cf. #resetFeatureUses) : calcule le total de niveaux
   *  récupérables (rollFormula) et ouvre une fenêtre de répartition entre paliers
   *  (chooseSpellSlotRecovery, spell-slot-choice.js). La charge n'est consommée QUE si le
   *  joueur confirme une répartition non vide — annuler la fenêtre ou n'avoir aucun emplacement
   *  manquant à ce moment laisse la Capacité disponible pour un prochain repos court de la même
   *  journée (léger écart au SRD strict "une seule fois par jour", jugé préférable à perdre
   *  silencieusement l'occasion sans jet). */
  async #offerSpellSlotRecoveries() {
    const features = this.actor.items.contents.filter(
      (item) => item.type === "feature" && item.system.recoversSpellSlots && item.system.uses.value > 0
    );
    for (const feature of features) {
      const roll = new Roll(feature.system.rollFormula, this.actor.getRollData());
      await roll.evaluate();
      if (!roll.total) continue;

      const distribution = await chooseSpellSlotRecovery(feature.name, roll.total, this.actor.system.spells.slots);
      if (!distribution) continue;

      const slotUpdates = {};
      const parts = [];
      for (const [level, amount] of Object.entries(distribution)) {
        const slot = this.actor.system.spells.slots[level];
        slotUpdates[`system.spells.slots.${level}.value`] = Math.min(slot.max, slot.value + amount);
        parts.push(game.i18n.format("DND_CUSTOM.Spells.RecoveryLevelResult", { level, amount }));
      }
      await this.actor.update(slotUpdates);
      await feature.update({ "system.uses.value": 0 });
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: this.actor }),
        content: game.i18n.format("DND_CUSTOM.Chat.SpellSlotsRecovered", {
          name: this.actor.name,
          feature: feature.name,
          list: parts.join(", ")
        })
      });
    }
  }

  /** Repos long : soigne intégralement et restaure tous les emplacements de sorts (SRD 5e). */
  static async #onRestLong() {
    if (this.#isDead()) return;
    const hp = this.actor.system.attributes.hp;
    const updates = {
      "system.attributes.hp.value": hp.max,
      // Remet à zéro le compteur de repos courts de la règle maison "Épuisement après le 4e
      // repos court" (cf. #onRestShort ci-dessus) — seul le repos long le réinitialise.
      "system.attributes.shortRestCount": 0,
      ...this.#spellSlotResetUpdates()
    };
    await this.actor.update(updates);
    // Un repos long inclut les bénéfices d'un repos court (SRD 5e) : les deux types de
    // récupération de charges de Capacité sont donc restaurés ici.
    await this.#resetFeatureUses(["shortRest", "longRest"]);
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      content: game.i18n.format("DND_CUSTOM.Chat.RestLong", { name: this.actor.name })
    });
  }

  #spellSlotResetUpdates() {
    return spellSlotFillUpdates(this.actor);
  }

  /** Restaure au maximum les charges des Capacités à utilisations limitées (system.uses.max
   *  > 0) dont le type de récupération figure dans `rechargeTypes` (cf. #onRestShort/Long). */
  async #resetFeatureUses(rechargeTypes) {
    const updates = this.actor.items.contents
      .filter(
        (item) =>
          item.type === "feature" && item.system.uses.max > 0 && rechargeTypes.includes(item.system.uses.recharge)
      )
      .map((item) => ({ _id: item.id, "system.uses.value": item.system.uses.max }));
    if (updates.length) await this.actor.updateEmbeddedDocuments("Item", updates);
  }

  /** Boutons +/- des caractéristiques (réservés au MJ, cf. `isGM` dans le template) :
   *  modifient la valeur de base ; le bonus d'origine reste appliqué séparément
   *  (cf. CharacterData#prepareDerivedData). */
  static async #onAbilityIncrease(event, target) {
    await this.#adjustAbility(target.dataset.key, 1);
  }

  static async #onAbilityDecrease(event, target) {
    await this.#adjustAbility(target.dataset.key, -1);
  }

  async #adjustAbility(key, delta) {
    const current = this.actor.system.abilities[key].value;
    const next = Math.max(1, current + delta);
    if (next === current) return;
    await this.actor.update({ [`system.abilities.${key}.value`]: next });
  }

  /** Monte le personnage d'UN niveau (jamais directement au niveau maximal éligible, cf.
   *  levelForXp) : PV max/emplacements de sorts/vitesse se recalculent automatiquement
   *  (CharacterData#prepareDerivedData). Accessible à tout propriétaire de la fiche, pas
   *  seulement au MJ (retour de test) : l'option `dndCustomLevelUp` est l'exception ciblée
   *  reconnue par le hook preUpdateActor (dnd-custom-ai.js) pour laisser passer `level` sans
   *  ouvrir les autres champs verrouillés MJ (classe/origine/caractéristiques...). Rend aussi
   *  tous les PV au joueur (retour de test — jusqu'ici seul le max se recalculait, les PV
   *  actuels restaient inchangés) et topper les emplacements de sorts au nouveau max (même
   *  logique que #spellSlotResetUpdates pour les boutons de repos — sans quoi un lanceur de
   *  sorts fraîchement monté de niveau reste à `value: 0` jusqu'à son prochain repos long). */
  static async #onLevelUp() {
    const system = this.actor.system;
    const next = system.attributes.level + 1;
    await this.actor.update({ "system.attributes.level": next }, { dndCustomLevelUp: true });
    await this.actor.update({
      "system.attributes.hp.value": this.actor.system.attributes.hp.max,
      ...spellSlotFillUpdates(this.actor)
    });
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      content: game.i18n.format("DND_CUSTOM.Chat.LevelUp", { name: this.actor.name, level: next })
    });

    // Nouvelles Capacités de classe/nouveaux Sorts disponibles à ce niveau (cf.
    // helpers/class-content.js) : octroyés automatiquement, annoncés dans le chat s'il y en a.
    const grantedNames = await grantClassContent(this.actor, this.actor.system.class, next);
    if (grantedNames.length) {
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: this.actor }),
        content: game.i18n.format("DND_CUSTOM.Chat.ClassContentGranted", {
          name: this.actor.name,
          names: grantedNames.join(", ")
        })
      });
    }

    // Choix de sous-classe, SRD 5e (cf. DND_CUSTOM.subclassLevel, config.js) : proposé dès que
    // le niveau requis est atteint et tant qu'aucune sous-classe n'est encore choisie (cf.
    // offerSubclassChoiceDialog, subclass-choice.js) — le sélecteur de l'en-tête reste
    // disponible en secours si cette fenêtre est fermée sans choisir.
    await offerSubclassChoiceDialog(this.actor, this.actor.system.class, next);

    // Amélioration de caractéristiques OU Don au choix, SRD 5e (règle optionnelle, cf.
    // commentaire de DND_CUSTOM.abilityScoreImprovementLevels) : proposée juste après
    // l'incrément de niveau (cf. offerAbilityScoreOrFeatDialog, level-up-choice.js). Un choix dû
    // mais pas encore résolu (fenêtre fermée sans choisir à une montée de niveau précédente,
    // system.attributes.pendingAsiChoices > 0, cf. schéma character-data.js) est reproposé en
    // plus de celui de ce niveau-ci, le cas échéant.
    if (DND_CUSTOM.abilityScoreImprovementLevels.includes(next)) {
      await this.actor.update({ "system.attributes.pendingAsiChoices": this.actor.system.attributes.pendingAsiChoices + 1 });
    }
    await this.#resolvePendingAsiChoices();
  }

  /** Reproposé tant que system.attributes.pendingAsiChoices > 0 : un choix Amélioration/Don dû
   *  reste dû (jamais perdu) jusqu'à ce qu'il soit réellement appliqué (cf.
   *  offerAbilityScoreOrFeatDialog, level-up-choice.js, qui gère elle-même le va-et-vient entre
   *  ses propres fenêtres). S'arrête dès qu'une fenêtre est fermée sans choisir, pour laisser la
   *  main au joueur plutôt que de le forcer en boucle — le badge de l'en-tête (cf.
   *  #onResolvePendingAsi) reste alors le rattrapage manuel. */
  async #resolvePendingAsiChoices() {
    while (this.actor.system.attributes.pendingAsiChoices > 0) {
      const applied = await offerAbilityScoreOrFeatDialog(this.actor);
      if (!applied) return;
      await this.actor.update({ "system.attributes.pendingAsiChoices": this.actor.system.attributes.pendingAsiChoices - 1 });
    }
  }

  /** Bouton de rattrapage manuel de l'en-tête (badge visible tant que system.attributes.
   *  pendingAsiChoices > 0, character-sheet.hbs) : permet de résoudre un choix Amélioration/Don
   *  dû sans attendre la prochaine montée de niveau (retour de test — fermer la fenêtre sans
   *  choisir le perdait auparavant pour toujours, faute d'un tel rattrapage). */
  static async #onResolvePendingAsi() {
    await this.#resolvePendingAsiChoices();
  }

  /** Ouvre l'assistant de création de personnage pour cet Actor (cf.
   *  character-creation-wizard.js) : accessible à tout propriétaire, pas seulement au MJ.
   *  Referme la fiche du même mouvement (retour de test — les deux restaient affichées en
   *  même temps) ; elle se rouvrira d'elle-même à la fin de l'assistant si besoin. */
  static async #onOpenCreationWizard() {
    const actor = this.actor;
    await this.close();
    const wizard = await new CharacterCreationWizard(actor).render(true);
    wizard.bringToFront();
  }

  static async #onOpenClassSheet() {
    const classKey = this.actor.system.class;
    if (!classKey) return;
    await DndCustomActorSheet.#openReferenceItem(
      "classes",
      (item) => item.type === "class" && item.system.classKey === classKey,
      "DND_CUSTOM.Actor.ClassSheetMissing",
      game.i18n.localize(DND_CUSTOM.classes[classKey])
    );
  }

  static async #onOpenSubclassSheet() {
    const classKey = this.actor.system.class;
    const subclassKey = this.actor.system.subclass;
    if (!subclassKey) return;
    await DndCustomActorSheet.#openReferenceItem(
      "sous-classes",
      (item) => item.type === "subclass" && item.system.classKey === classKey && item.system.subclassKey === subclassKey,
      "DND_CUSTOM.Actor.SubclassSheetMissing",
      game.i18n.localize(DND_CUSTOM.subclasses[classKey]?.[subclassKey])
    );
  }

  static async #onOpenOriginSheet() {
    const origin = game.dndCustomAi?.origins?.[this.actor.system.origin];
    if (!origin?.label) return;
    await DndCustomActorSheet.#openReferenceItem(
      "origines",
      (item) => item.type === "origin" && item.name === origin.label,
      "DND_CUSTOM.Actor.OriginSheetMissing",
      origin.label
    );
  }

  /** Ouvre la fiche de description d'une Classe/Sous-classe/Origine correspondant à `predicate` :
   *  cherchée d'abord dans les Items du monde (import world-items/*.json), puis dans le
   *  compendium `packName` une fois peuplé par le MJ (cf. packs/<nom>, README de chacun) —
   *  avertit sans bloquer si introuvable, ces fiches restent optionnelles. Classe/Sous-classe
   *  identifiées par une clé stable (`system.classKey`/`subclassKey`, cf. ClassData,
   *  scripts/data/class-data.js), jamais par un nom localisé/traduit — comparer des libellés
   *  `game.i18n.localize()` à des noms d'Items codés en français échouait systématiquement sous
   *  un monde non francophone (bug historique, cf. tests/README.md > "Bug connu"). Origine
   *  identifiée par son nom exact, qui n'est de toute façon jamais localisé (cf. `origin.label`,
   *  scripts/data/origins.json). `displayName` sert uniquement au message d'avertissement,
   *  affiché dans la langue active du monde — aucun rôle dans la recherche elle-même. */
  static async #openReferenceItem(packName, predicate, missingKey, displayName) {
    const worldItem = game.items.find(predicate);
    if (worldItem) {
      worldItem.sheet.render(true);
      return;
    }

    const pack = game.packs.get(`${SYSTEM_ID}.${packName}`);
    const document = pack ? (await pack.getDocuments()).find(predicate) : null;
    if (document) {
      document.sheet.render(true);
      return;
    }

    ui.notifications.warn(game.i18n.format(missingKey, { name: displayName }));
  }

  /** Jet de sauvegarde de la mort, SRD 5e : 1d20 sans modificateur. Naturel 20 = régénère
   *  1 PV — le hook updateActor (dnd-custom-ai.js) détecte alors le retour au-dessus de 0 PV
   *  et réinitialise l'état (retire Inconscient, remet les compteurs à zéro), pas besoin de
   *  le refaire ici. Naturel 1 = deux échecs. 10+ = réussite, sinon échec. Troisième échec :
   *  declareDeath (scripts/helpers/death.js), la même fonction que pour une mort par dégâts
   *  subis à 0 PV, pour un comportement identique quelle que soit la cause. */
  static async #onRollDeathSave() {
    const actor = this.actor;
    const roll = new Roll("1d20");
    await roll.evaluate();
    const total = roll.total;
    const death = actor.system.attributes.death;

    if (total === 20) {
      await actor.update({ "system.attributes.hp.value": 1 });
    } else if (total === 1) {
      const failures = Math.min(3, death.failures + 2);
      await actor.update({ "system.attributes.death.failures": failures });
      if (failures >= 3) await declareDeath(actor);
    } else if (total >= 10) {
      const successes = Math.min(3, death.successes + 1);
      const updates = { "system.attributes.death.successes": successes };
      // Retour de test (lot 3) : troisième réussite = "stabilisé" — remet 1 PV dans la même
      // update que la 3e réussite (pas un update séparé) pour que le hook updateActor
      // (dnd-custom-ai.js, branche `newHp > 0 && oldHp === 0`) retire Inconscient et réinitialise
      // les compteurs d'un seul coup, exactement comme un nat 20 (cf. branche `total === 20`
      // ci-dessus) — même mécanisme, déclenché par un chemin différent.
      if (successes >= 3) updates["system.attributes.hp.value"] = 1;
      await actor.update(updates);
    } else {
      const failures = Math.min(3, death.failures + 1);
      await actor.update({ "system.attributes.death.failures": failures });
      if (failures >= 3) await declareDeath(actor);
    }

    await roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor }),
      flavor: game.i18n.localize("DND_CUSTOM.Roll.DeathSave"),
      flags: sheetRollFlags()
    });
  }

  /** Jet libre d'une Capacité (`system.requiresRoll`/`rollFormula`, ex. Second souffle
   *  "1d10 + @attributes.level") : formule évaluée avec les données de l'Actor
   *  (Actor#getRollData, natif Foundry) pour résoudre les références `@...`. Consomme une
   *  charge si la capacité a des utilisations limitées (system.uses.max > 0), et annule le
   *  jet si plus aucune charge n'est disponible. `system.healsTarget` (ex. don Guérisseur) :
   *  marque le message du même flag que les sorts de soin pour réutiliser le bouton "Appliquer
   *  le soin" déjà existant (cf. FeatureData#healsTarget, item-data.js) — sans lui, un jet de
   *  soin de Capacité/Don restait un simple nombre posté en chat, jamais réellement appliqué à
   *  une cible (retour de test, ANOMALIES_ACTIVES.md). Ne modélise pas la restriction SRD "une
   *  fois par créature et par repos" ni la branche "stabiliser une créature à 0 PV" du texte de
   *  Guérisseur — laissées à l'arbitrage du MJ, comme d'autres clauses partiellement automatisées
   *  ailleurs dans ce système (cf. Sentinelle/Alerte). */
  static async #onRollFeature(event, target) {
    const item = this.actor.items.get(target.closest("[data-item-id]")?.dataset.itemId);
    if (!item || item.type !== "feature" || !item.system.requiresRoll || !item.system.rollFormula) return;
    if (!(await this.#consumeActionEconomy(item))) return;

    const remaining = await this.#consumeFeatureCharge(item);
    if (remaining === null) return;

    const roll = new Roll(item.system.rollFormula, this.actor.getRollData());
    await roll.evaluate();
    const flavor = remaining === undefined ? item.name : `${item.name} (${remaining}/${item.system.uses.max})`;
    await roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      flavor,
      flags: sheetRollFlags({
        ...(item.system.healsTarget ? { healRoll: true } : {}),
        ...(item.system.reducesDamage ? { damageReduction: true } : {}),
        ...(item.system.dealsDamage ? { damageRoll: true } : {})
      })
    });
  }

  /** Capacité à jet de sauvegarde de CIBLE (ex. Canalisation divine "Repousser les
   *  morts-vivants"/"Repousser les impies"/"Abjurer un ennemi" — cf.
   *  FeatureData#savingThrow/appliesCondition/requiresCreatureTypes, item-data.js) : même
   *  mécanisme que SpellData#save (#onCastSpell plus bas, rules.js > targetSaveModifier) — le
   *  lanceur ne roule jamais lui-même, seul le DD (spellSaveDC de sa caractéristique
   *  d'incantation de classe) compte, comparé au jet propre de CHAQUE cible actuellement
   *  ciblée. Une cible qui ne correspond à AUCUN type de créature requis (ensemble vide = pas de
   *  restriction) ne subit même pas de jet — message informatif dédié. Échec du jet : applique
   *  la condition configurée à la cible (`Actor#toggleStatusEffect`, natif Foundry).
   *
   *  `costsResource` (cf. item-data.js) : comme #onUseResourceTechnique, une option de
   *  Canalisation divine peut consommer la réserve d'une AUTRE Capacité (ex. les 2 options de
   *  chaque Serment de Paladin partagent la même réserve "Canalisation divine (Paladin)",
   *  jamais leur propre charge) plutôt que sa propre `uses`. */
  static async #onRollFeatureSave(event, target) {
    const item = this.actor.items.get(target.closest("[data-item-id]")?.dataset.itemId);
    if (!item || item.type !== "feature" || !item.system.savingThrow) return;
    if (!(await this.#consumeActionEconomy(item))) return;

    const chargeHolder = item.system.costsResource
      ? this.actor.items.contents.find(
          (candidate) => candidate.type === "feature" && candidate.name === item.system.costsResource
        )
      : item;
    if (!chargeHolder) return;

    const remaining = await this.#consumeFeatureCharge(chargeHolder);
    if (remaining === null) return;

    const system = this.actor.system;
    // saveDCAbility (item-data.js) : caractéristique explicite quand la Capacité n'appartient
    // pas à une classe lanceuse (ex. Frappe étourdissante, Moine — DD basé sur la Sagesse, pas
    // sur `spellcastingAbility[class]` qui n'a pas d'entrée "monk") — sinon, comportement
    // inchangé (caractéristique d'incantation de la classe).
    const dcAbility = item.system.saveDCAbility || DND_CUSTOM.spellcastingAbility[system.class];
    const dcAbilityMod = dcAbility ? abilityModifier(system.abilities[dcAbility].total) : 0;
    const dc = spellSaveDC(proficiencyBonus(system.attributes.level), dcAbilityMod);
    const abilityLabel = game.i18n.localize(DND_CUSTOM.abilities[item.system.savingThrow]);
    const targets = Array.from(game.user.targets);

    if (!targets.length) {
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: this.actor }),
        content: game.i18n.format("DND_CUSTOM.Chat.SaveSpellNoTarget", { spell: item.name, ability: abilityLabel, dc })
      });
      return;
    }

    for (const token of targets) {
      const targetActor = token.actor;
      if (!targetActor?.system?.abilities) continue;

      if (item.system.requiresCreatureTypes.size && !item.system.requiresCreatureTypes.has(targetActor.system.creatureType)) {
        await ChatMessage.create({
          speaker: ChatMessage.getSpeaker({ actor: targetActor }),
          content: game.i18n.format("DND_CUSTOM.Chat.FeatureSaveWrongCreatureType", { name: targetActor.name, feature: item.name })
        });
        continue;
      }

      const mod = targetSaveModifier(targetActor.system, item.system.savingThrow);
      // Tactiques défensives (Hunter, Rôdeur — chantier "8 sous-classes déjà à ≥1 mécanique",
      // 2026-08-23) : avantage à la cible si "Volonté de fer" (contre Effrayé) ou "Défense contre
      // les attaques multiples" (contre CET attaquant précis, déjà attaqué ce round) s'applique.
      const hasDefenseAdvantage =
        hasSteadfastAdvantage(targetActor, item.system.appliesCondition) ||
        hasMultiattackDefenseAdvantage(targetActor, this.actor);
      const roll = new Roll(`${hasDefenseAdvantage ? "2d20kh1" : "1d20"}${formatModifier(mod)}`);
      await roll.evaluate();
      const success = roll.total >= dc;
      // Destruction des morts-vivants (Clerc 5, SRD 5e) : ne concerne QUE "Repousser les
      // morts-vivants" (seule Capacité de ce système à cibler "undead" via requiresCreatureTypes,
      // cf. son commentaire d'en-tête) — remplace l'application de la condition (Effrayé/
      // "repoussé") par une destruction pure quand le Clerc possède la Capacité ET que la FI de
      // la cible est sous le seuil de son niveau.
      const destroysUndead =
        item.system.requiresCreatureTypes.has("undead") &&
        targetActor.system.creatureType === "undead" &&
        hasFeature(this.actor.items.contents, "Destruction des morts-vivants") &&
        isUndeadDestroyed(system.attributes.level, targetActor.system.challengeRating);
      if (!success && destroysUndead) {
        await targetActor.update({ "system.attributes.hp.value": 0 });
        if (!targetActor.statuses.has("dead")) await targetActor.toggleStatusEffect("dead", { active: true });
      } else if (!success && item.system.appliesCondition) {
        await targetActor.toggleStatusEffect(item.system.appliesCondition, { active: true });
      }
      const resultKey = success
        ? "DND_CUSTOM.Roll.SaveSuccess"
        : destroysUndead
          ? "DND_CUSTOM.Roll.SaveFailUndeadDestroyed"
          : "DND_CUSTOM.Roll.SaveFail";
      await roll.toMessage({
        speaker: ChatMessage.getSpeaker({ actor: targetActor }),
        flavor: `${game.i18n.format(resultKey, { name: targetActor.name, spell: item.name, ability: abilityLabel, dc })}${
          hasDefenseAdvantage ? ` (${game.i18n.localize("DND_CUSTOM.Roll.Advantage")})` : ""
        }`,
        flags: sheetRollFlags()
      });
    }
  }

  /** Capacité qui pose une condition sur CHAQUE cible actuellement ciblée SANS jet associé (ex.
   *  Traque implacable, Paladin Serment de Vengeance — Niveau C, 2026-08-25, cf.
   *  FeatureData#grantsCondition, item-data.js) : même mécanisme que SpellData#grantsCondition
   *  (#onCastSpell plus bas), pour une Capacité au lieu d'un Sort. `costsResource` : comme
   *  #onRollFeatureSave ci-dessus, consomme la réserve d'une AUTRE Capacité si configuré
   *  (Canalisation divine (Paladin), partagée avec Abjurer un ennemi pour Traque implacable).
   *
   *  Spécialisation par NOM (comme Destruction des morts-vivants dans #onRollFeatureSave) :
   *  Traque implacable pose EN PLUS le flag `HUNTED_BY_ACTOR_ID_FLAG`
   *  (helpers/relentless-hunter.js) sur chaque cible, identifiant ce Paladin comme celui qui l'a
   *  désignée — seul moyen dans ce système de savoir QUI a posé un état homebrew (aucun autre
   *  n'a de "propriétaire"), scopé à cette seule Capacité plutôt que généralisé à
   *  `toggleStatusEffect`. Consommé par `isDisadvantagedByHuntedTarget` (même fichier) sur les 3
   *  jets d'attaque (arme/sort PJ, attaque PNJ) pour exempter le Paladin du désavantage "toute
   *  créature autre que vous". */
  static async #onGrantFeatureCondition(event, target) {
    const item = this.actor.items.get(target.closest("[data-item-id]")?.dataset.itemId);
    if (!item || item.type !== "feature" || !item.system.grantsCondition) return;
    if (!(await this.#consumeActionEconomy(item))) return;

    const chargeHolder = item.system.costsResource
      ? this.actor.items.contents.find(
          (candidate) => candidate.type === "feature" && candidate.name === item.system.costsResource
        )
      : item;
    if (!chargeHolder) return;

    const remaining = await this.#consumeFeatureCharge(chargeHolder);
    if (remaining === null) return;

    const targets = Array.from(game.user.targets);
    if (!targets.length) {
      ui.notifications.warn(game.i18n.localize("DND_CUSTOM.Chat.NoTarget"));
      return;
    }

    for (const token of targets) {
      if (!token.actor) continue;
      await token.actor.toggleStatusEffect(item.system.grantsCondition, { active: true });
      if (item.name === RELENTLESS_HUNTER_FEATURE_NAME) {
        await token.actor.setFlag(SYSTEM_ID, HUNTED_BY_ACTOR_ID_FLAG, this.actor.id);
      }
    }

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      content: game.i18n.format("DND_CUSTOM.Chat.UseFeature", {
        name: this.actor.name,
        feature: item.name,
        remaining,
        max: chargeHolder.system.uses.max
      })
    });
  }

  /** Test opposé (Agripper/Bousculer, SRD 5e — chantier "mécaniques jamais modélisées",
   *  2026-08-25, cadré avec l'utilisateur avant implémentation) : cf. FeatureData#opposedCheckType,
   *  item-data.js pour le détail complet du mécanisme et des approximations assumées (meilleur des
   *  deux jets de défense de la cible, Repoussé jamais automatisé). Contrairement au reste du
   *  système (jet comparé à un DD/une CA fixe), les DEUX camps lancent ici un d20 — 2 messages de
   *  jet distincts (attaquant puis cible, même convention que #onRollFeatureSave : un message par
   *  "camp"), puis un 3e message de résolution. Une seule cible à la fois (test opposé 1 contre
   *  1, pas de zone). */
  static async #onRollOpposedCheck(event, target) {
    const item = this.actor.items.get(target.closest("[data-item-id]")?.dataset.itemId);
    if (!item || item.type !== "feature" || !item.system.opposedCheckType) return;
    if (!(await this.#consumeActionEconomy(item))) return;

    const targets = Array.from(game.user.targets);
    if (targets.length !== 1) {
      ui.notifications.warn(
        game.i18n.localize(targets.length ? "DND_CUSTOM.Chat.OpposedCheckSingleTargetOnly" : "DND_CUSTOM.Chat.NoTarget")
      );
      return;
    }
    const targetActor = targets[0].actor;
    if (!targetActor?.system?.abilities) return;

    // Bousculer : le choix (à terre / repoussé) se fait AVANT le jet, même UX que
    // #onUseOpenHandTechnique — appliqué seulement si l'attaquant l'emporte plus bas.
    let chosenShoveEffect = null;
    if (item.system.opposedCheckType === "shove") {
      const rows = Object.entries(DND_CUSTOM.shoveEffects)
        .map(
          ([key, labelKey], index) => `
          <label class="checkbox-row">
            <input type="radio" name="shoveEffect" value="${key}" ${index === 0 ? "checked" : ""}>
            ${game.i18n.localize(labelKey)}
          </label>`
        )
        .join("");
      chosenShoveEffect = await DialogV2.prompt({
        window: { title: item.name },
        content: `<div style="display:flex;flex-direction:column;gap:0.4rem;">${rows}</div>`,
        ok: {
          label: game.i18n.localize("DND_CUSTOM.Abilities.ChooseOptionConfirm"),
          callback: (ev, button) => button.form.elements.shoveEffect?.value
        }
      });
      if (!chosenShoveEffect) return;
    }

    const attackerMod = opposedCheckModifier(this.actor.system, "athletics", SKILL_ABILITIES.athletics);
    const athleticsMod = opposedCheckModifier(targetActor.system, "athletics", SKILL_ABILITIES.athletics);
    const acrobaticsMod = opposedCheckModifier(targetActor.system, "acrobatics", SKILL_ABILITIES.acrobatics);
    const defenderSkillKey = athleticsMod >= acrobaticsMod ? "athletics" : "acrobatics";
    const defenderMod = Math.max(athleticsMod, acrobaticsMod);

    const attackerRoll = new Roll(`1d20${formatModifier(attackerMod)}`);
    await attackerRoll.evaluate();
    await attackerRoll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      flavor: game.i18n.format("DND_CUSTOM.Roll.OpposedCheckAttacker", { name: this.actor.name, feature: item.name }),
      flags: sheetRollFlags()
    });

    const defenderRoll = new Roll(`1d20${formatModifier(defenderMod)}`);
    await defenderRoll.evaluate();
    await defenderRoll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor: targetActor }),
      flavor: game.i18n.format("DND_CUSTOM.Roll.OpposedCheckDefender", {
        name: targetActor.name,
        skill: game.i18n.localize(DND_CUSTOM.skills[defenderSkillKey])
      }),
      flags: sheetRollFlags()
    });

    // Égalité = statu quo (règle générale des tests opposés SRD 5e) : l'attaquant doit
    // STRICTEMENT dépasser le total de la cible pour que l'état change.
    const success = attackerRoll.total > defenderRoll.total;

    if (success) {
      if (item.system.opposedCheckType === "grapple") {
        await targetActor.toggleStatusEffect("grappled", { active: true });
      } else if (chosenShoveEffect === "prone") {
        await targetActor.toggleStatusEffect("prone", { active: true });
      }
      // "pushed" (Repoussé) : jamais de déplacement automatique de token, cf. commentaire de
      // FeatureData#opposedCheckType — seul le message de résolution ci-dessous le mentionne.
    }

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      content: game.i18n.format(success ? "DND_CUSTOM.Chat.OpposedCheckSuccess" : "DND_CUSTOM.Chat.OpposedCheckFail", {
        attacker: this.actor.name,
        defender: targetActor.name,
        feature: item.name,
        effect:
          item.system.opposedCheckType === "shove" && chosenShoveEffect
            ? game.i18n.localize(DND_CUSTOM.shoveEffects[chosenShoveEffect])
            : game.i18n.localize("DND_CUSTOM.Conditions.grappled")
      })
    });
  }

  /** Utilisation d'une Capacité à charges limitées sans jet associé (ex. Imposition des
   *  mains) : décrémente le compteur et l'annonce dans le chat (pas de jet à afficher, donc
   *  pas de message automatique sinon comme pour #onRollFeature). */
  static async #onUseFeatureCharge(event, target) {
    const item = this.actor.items.get(target.closest("[data-item-id]")?.dataset.itemId);
    if (!item || item.type !== "feature" || !item.system.uses.max) return;
    if (!(await this.#consumeActionEconomy(item))) return;

    const remaining = await this.#consumeFeatureCharge(item);
    if (remaining === null) return;

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      content: game.i18n.format("DND_CUSTOM.Chat.UseFeature", {
        name: this.actor.name,
        feature: item.name,
        remaining,
        max: item.system.uses.max
      })
    });
  }

  /** Décrémente system.uses.value d'une Capacité à charges limitées et renvoie le nombre de
   *  charges restantes après l'opération. Renvoie `undefined` si la capacité n'a pas de suivi
   *  de charges (uses.max === 0, action toujours permise), ou `null` si plus aucune charge
   *  n'est disponible (l'appelant doit alors annuler l'action associée). */
  async #consumeFeatureCharge(item) {
    if (!item.system.uses.max) return undefined;
    if (item.system.uses.value <= 0) {
      ui.notifications.warn(game.i18n.format("DND_CUSTOM.Chat.NoChargesLeft", { feature: item.name }));
      return null;
    }
    const remaining = item.system.uses.value - 1;
    await item.update({ "system.uses.value": remaining });
    return remaining;
  }

  /** Économie d'action de combat (SRD 5e) : si `item` (Capacité ou Sort) est de type
   *  "reaction", vérifie que la réaction n'est pas déjà consommée ce round-ci
   *  (system.combat.reactionAvailable, cf. canUseReaction, rules.js) et la marque utilisée —
   *  bloquant, comme avant. Pour "action"/"bonusAction" (chantier "Suivi de l'action/action
   *  bonus", 2026-08-23) : suivi NON-bloquant délégué à noteActionEconomyUsage
   *  (helpers/action-economy.js). Renvoie `true` si l'action associée peut se poursuivre (item
   *  non-réaction, ou réaction disponible et désormais consommée), `false` UNIQUEMENT si une
   *  réaction est bloquée (avec avertissement) — l'appelant doit alors annuler l'action, sans
   *  avoir encore décompté de charge. */
  async #consumeActionEconomy(item) {
    if (item.system.activation === "reaction") {
      if (!canUseReaction(this.actor.system)) {
        ui.notifications.warn(game.i18n.format("DND_CUSTOM.Chat.ReactionUnavailable", { name: item.name }));
        return false;
      }
      await this.actor.update({ "system.combat.reactionAvailable": false });
      return true;
    }
    await noteActionEconomyUsage(this.actor, item.system.activation);
    return true;
  }

  /** Rattrapage manuel de la réaction (MJ ou joueur) : capacité qui rend une réaction
   *  supplémentaire, correction d'un clic malencontreux... Bascule simplement l'état, sans
   *  attendre un changement de tour (cf. hooks updateCombat/deleteCombat, dnd-custom-ai.js,
   *  pour la régénération automatique au début de son propre tour). */
  static async #onToggleReaction() {
    const available = this.actor.system.combat.reactionAvailable;
    await this.actor.update({ "system.combat.reactionAvailable": !available });
  }

  /** Rattrapage manuel de l'Action/Action bonus (même principe que #onToggleReaction ci-dessus) :
   *  utile pour se resynchroniser après un rappel de chat non-bloquant, ou remettre à disposition
   *  une Action rendue par une Capacité (ex. Action fulgurante). */
  static async #onToggleAction() {
    const available = this.actor.system.combat.actionAvailable;
    await this.actor.update({ "system.combat.actionAvailable": !available });
  }

  static async #onToggleBonusAction() {
    const available = this.actor.system.combat.bonusActionAvailable;
    await this.actor.update({ "system.combat.bonusActionAvailable": !available });
  }

  /** Monte la créature actuellement ciblée (Combat monté, don SRD 5e — chantier "Combat
   *  automatisé avancé", 2026-08-23) : même convention que les Capacités à cible
   *  (`game.user.targets`) plutôt qu'un select dédié. Réservé aux Actors de type "mount"
   *  (créature vivante, `CONFIG.Actor.dataModels.mount = NpcData`, dnd-custom-ai.js) — jamais
   *  "vehicle" (schéma trop pauvre pour ce don : pas de taille). */
  static async #onMount() {
    const target = [...game.user.targets][0];
    if (!target?.actor || target.actor.type !== "mount") {
      ui.notifications.warn(game.i18n.localize("DND_CUSTOM.Chat.MountNoTarget"));
      return;
    }
    await this.actor.update({ "system.combat.mountedActorId": target.actor.id });
  }

  /** Descend de sa monture actuelle (cf. #onMount ci-dessus). */
  static async #onDismount() {
    await this.actor.update({ "system.combat.mountedActorId": "" });
  }

  /** Prend une forme choisie dans un dialogue (Forme sauvage, Druide — refonte 2026-09-04,
   *  cf. offerWildShapeFormDialog, wild-shape-choice.js) : plus de ciblage de token, le joueur
   *  choisit directement parmi les formes disponibles à son niveau. Le dialogue s'affiche AVANT
   *  de consommer l'Action/Action bonus et la charge de Capacité (#consumeActionEconomy/
   *  #consumeFeatureCharge, comme toute autre Capacité), pour ne rien décompter si le joueur
   *  ferme le dialogue sans choisir. `item` est la Capacité "Forme sauvage" elle-même
   *  (`system.entersWildShape`, item-data.js). La création/réutilisation de l'Actor de la forme
   *  et la pose des PV temporaires de "Forme sauvage de combat" (Cercle de la Lune) sont
   *  déléguées à requestWildShapeTransformation (wild-shape-form.js), qui gère aussi le relais
   *  MJ nécessaire pour créer un Actor (permission que le Joueur n'a pas). */
  static async #onEnterWildShape(event, target) {
    const item = this.actor.items.get(target.closest("[data-item-id]")?.dataset.itemId);
    if (!item || item.type !== "feature" || !item.system.entersWildShape) return;

    const chosenFormName = await offerWildShapeFormDialog(this.actor);
    if (!chosenFormName) return;

    if (!(await this.#consumeActionEconomy(item))) return;

    const remaining = await this.#consumeFeatureCharge(item);
    if (remaining === null) return;

    // Forme sauvage de combat (Cercle de la Lune, Druide 2, SRD 5e) : PV temporaires égaux à 2×
    // le niveau du Druide au moment de la transformation, posés sur la FORME (system.attributes
    // .hp.temp, NpcData) puisque c'est sa réserve de PV qui sert de 2e réserve pendant la
    // transformation (cf. commentaire de wildShapeActorId, character-data.js) — jamais sur le
    // personnage lui-même. Calculé ici (niveau du Druide connu côté Joueur) mais appliqué dans
    // requestWildShapeTransformation, seule habilitée à écrire sur l'Actor de la forme.
    const combatWildShapeBonus = hasFeature(this.actor.items.contents, "Forme sauvage de combat")
      ? 2 * this.actor.system.attributes.level
      : undefined;

    await requestWildShapeTransformation(this.actor, chosenFormName, combatWildShapeBonus);
  }

  /** Redevient soi-même (cf. #onEnterWildShape ci-dessus) : volontaire, à tout moment — jamais
   *  bloquant, contrairement au retour AUTOMATIQUE à 0 PV de forme (hook updateActor,
   *  dnd-custom-ai.js). Ne rend jamais la charge de Capacité déjà consommée (SRD 5e : reprendre
   *  une forme, même la même, en recoûte une). */
  static async #onRevertWildShape() {
    await this.actor.update({ "system.combat.wildShapeActorId": "" });
  }

  /** Jet d'attaque avec la Forme sauvage actuellement prise (refonte 2026-09-04) : profil
   *  d'attaque `target.dataset.index` lu sur l'Actor lié (system.combat.wildShapeActorId), pas
   *  sur `this.actor` — même lecture que #onRollAttack (npc-sheet.js), mais exécutée depuis la
   *  fiche du PERSONNAGE pour éviter d'avoir à ouvrir la fiche PNJ de la forme en combat. `actor:
   *  this.actor` passé à rollCheck (pas la forme) : c'est le PERSONNAGE qui est Combattant du
   *  combat en cours (criticalRules > isActorInCombat) et qui parle dans le chat, la forme n'a en
   *  général ni jeton ni entrée dans le Suivi de combat. Le flag de critique en attente est donc
   *  posé sur `this.actor` (`pendingWildShapeAttackCritical`, objet par index) plutôt que sur la
   *  forme, qui n'est pas forcément possédée par le Joueur (cf. requestWildShapeTransformation,
   *  wild-shape-form.js). */
  static async #onRollWildShapeAttack(event, target) {
    const formActor = game.actors.get(this.actor.system.combat.wildShapeActorId);
    const index = Number(target.dataset.index);
    const attack = formActor?.system.attacks[index];
    if (!attack) return;

    const abilityMod = formActor.system.abilities[attack.ability]?.mod ?? 0;
    const { isCriticalHit } = await rollCheck({
      actor: this.actor,
      formula: formatModifier(abilityMod + attack.bonus),
      flavor: game.i18n.format("DND_CUSTOM.Roll.WeaponAttack", { weapon: attack.name }),
      advantage: event.shiftKey,
      disadvantage: event.ctrlKey || isDisadvantagedByHuntedTarget(this.actor),
      compareToTargetAc: true,
      criticalRules: true
    });
    if (isCriticalHit) {
      const pending = this.actor.getFlag(SYSTEM_ID, "pendingWildShapeAttackCritical") ?? {};
      await this.actor.setFlag(SYSTEM_ID, "pendingWildShapeAttackCritical", { ...pending, [index]: true });
    }
    await noteActionEconomyUsage(this.actor, "action", { isWeaponAttack: true });
    await recordAttackOnTargets(this.actor);
  }

  /** Jet de dégâts d'une attaque de Forme sauvage (cf. #onRollWildShapeAttack ci-dessus) — même
   *  moteur (rollDamage, rolls.js) que les armes/attaques de PNJ, dés/type lus sur la forme
   *  liée. */
  static async #onRollWildShapeAttackDamage(event, target) {
    const formActor = game.actors.get(this.actor.system.combat.wildShapeActorId);
    const index = Number(target.dataset.index);
    const attack = formActor?.system.attacks[index];
    if (!attack || !attack.damage.dice) return;

    const abilityMod = formActor.system.abilities[attack.ability]?.mod ?? 0;
    const damageTypeLabel = attack.damage.type ? game.i18n.localize(DND_CUSTOM.damageTypes[attack.damage.type]) : "";
    const pending = this.actor.getFlag(SYSTEM_ID, "pendingWildShapeAttackCritical") ?? {};
    const critical = Boolean(pending[index]);
    if (critical) await this.actor.update({ [`flags.${SYSTEM_ID}.pendingWildShapeAttackCritical.-=${index}`]: null });

    await rollDamage({
      actor: this.actor,
      dice: attack.damage.dice,
      formula: formatModifier(abilityMod + attack.damage.bonus),
      flavor: `${game.i18n.format("DND_CUSTOM.Roll.WeaponDamage", { weapon: attack.name })}${damageTypeLabel ? ` (${damageTypeLabel})` : ""}`,
      critical,
      damageType: attack.damage.type,
      isMagicalSource: attack.magic
    });
  }

  /** Utilisation d'une technique consommant la réserve d'une AUTRE Capacité (`system.
   *  costsResource`, ex. les techniques de Moine consommant du Ki, cf. #consumeFeatureCharge
   *  pour le cas d'une Capacité à charges qui lui sont propres) : décrémente `system.uses.value`
   *  de la Capacité réservoir (trouvée par nom exact sur l'Actor) et l'annonce dans le chat.
   *  Bouton grisé côté template (tab-abilities.hbs > featureResourceState) dès que la réserve
   *  est vide, mais revérifié ici au cas où plusieurs clients cliqueraient en même temps. */
  static async #onUseResourceTechnique(event, target) {
    const item = this.actor.items.get(target.closest("[data-item-id]")?.dataset.itemId);
    if (!item || item.type !== "feature" || !item.system.costsResource) return;
    if (!(await this.#consumeActionEconomy(item))) return;

    const resource = this.actor.items.contents.find(
      (candidate) => candidate.type === "feature" && candidate.name === item.system.costsResource
    );
    if (!resource) return;

    const remaining = await this.#consumeFeatureCharge(resource);
    if (remaining === null) return;

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      content: game.i18n.format("DND_CUSTOM.Chat.UseResourceTechnique", {
        name: this.actor.name,
        technique: item.name,
        resource: resource.name,
        remaining,
        max: resource.system.uses.max
      })
    });
  }

  /** Utilisation d'une Capacité gratuite mais conditionnée à un état actif sur l'Actor
   *  (`system.requiresState`, ex. Frénésie qui nécessite d'être En Rage, cf. DND_CUSTOM.conditions
   *  dans config.js) : pas de charge à décompter (contrairement à #onUseFeatureCharge), juste une
   *  annonce dans le chat — le bouton est déjà grisé côté template (tab-abilities.hbs >
   *  featureDisabled) tant que l'état n'est pas actif, revérifié ici au cas où plusieurs clients
   *  cliqueraient en même temps ou que l'état ait changé entre le render et le clic. */
  static async #onUseConditionalFeature(event, target) {
    const item = this.actor.items.get(target.closest("[data-item-id]")?.dataset.itemId);
    if (!item || item.type !== "feature" || !item.system.requiresState) return;
    if (!this.actor.statuses.has(item.system.requiresState)) return;
    if (!(await this.#consumeActionEconomy(item))) return;

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      content: game.i18n.format("DND_CUSTOM.Chat.UseConditionalFeature", {
        name: this.actor.name,
        feature: item.name
      })
    });
  }

  /** Choix ponctuel et définitif proposé par une Capacité (`FeatureData#grantsChoice`, ex.
   *  "Aspect de la bête", Voie du Cœur sauvage/Barbare) : petite fenêtre à choix unique (radio),
   *  même mécanique que offerSubclassChoiceDialog (helpers/subclass-choice.js)/
   *  #offerEquipSlotDialog (sheets/inventory-drag-drop.js). Le champ ciblé
   *  (`system.combat.<grantsChoice>`) et la table d'options viennent respectivement de
   *  `grantsChoice` lui-même et de CHOICE_OPTIONS_TABLES ci-dessous — n'affiche rien si le choix
   *  est déjà fait (bouton déjà masqué côté template de toute façon, revérifié ici par
   *  sécurité). */
  static async #onChooseFeatureOption(event, target) {
    const item = this.actor.items.get(target.closest("[data-item-id]")?.dataset.itemId);
    const fieldKey = item?.system.grantsChoice;
    if (!fieldKey || this.actor.system.combat[fieldKey]) return;

    const options = CHOICE_OPTIONS_TABLES[fieldKey];
    const rows = Object.entries(options)
      .map(
        ([key, labelKey], index) => `
        <label class="checkbox-row">
          <input type="radio" name="chosenOption" value="${key}" ${index === 0 ? "checked" : ""}>
          ${game.i18n.localize(labelKey)}
        </label>`
      )
      .join("");

    const chosenKey = await DialogV2.prompt({
      window: { title: item.name },
      content: `<div style="display:flex;flex-direction:column;gap:0.4rem;">${rows}</div>`,
      ok: {
        label: game.i18n.localize("DND_CUSTOM.Abilities.ChooseOptionConfirm"),
        callback: (ev, button) => button.form.elements.chosenOption?.value
      }
    });
    if (!chosenKey) return;

    await this.actor.update({ [`system.combat.${fieldKey}`]: chosenKey });
  }

  /** Don "Magie d'initié" (`FeatureData#offersSpellChoice`, SRD 5e) : choix en 2 étapes (classe
   *  lanceuse, puis 2 tours de magie + 1 sort de niveau 1 de cette classe, cf.
   *  chooseInitiateMagicSpells, helpers/initiate-magic-choice.js) — contrairement à
   *  #onChooseFeatureOption (un seul champ, une seule table), ce choix octroie de VRAIS Items
   *  Sort sur la fiche plutôt qu'une simple valeur. Règle le `uses` du don lui-même
   *  (max:1/recharge:"longRest") pour servir de charge au cast gratuit du sort de niveau 1,
   *  consommée dans #onCastSpell ci-dessous. Ne fait rien si déjà choisi (bouton déjà masqué
   *  côté template, revérifié ici par sécurité). */
  static async #onChooseInitiateMagic(event, target) {
    const item = this.actor.items.get(target.closest("[data-item-id]")?.dataset.itemId);
    if (!item || !item.system.offersSpellChoice || item.system.chosenLevelOneSpell) return;

    const choice = await chooseInitiateMagicSpells();
    if (!choice) return;

    await this.actor.createEmbeddedDocuments("Item", [
      ...choice.cantripItems.map((spell) => spell.toObject()),
      choice.levelOneSpellItem.toObject()
    ]);
    await item.update({
      "system.chosenSpellClass": choice.classKey,
      "system.chosenCantrips": choice.cantripItems.map((spell) => spell.name),
      "system.chosenLevelOneSpell": choice.levelOneSpellItem.name,
      "system.uses": { max: 1, value: 1, recharge: "longRest" }
    });
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      content: game.i18n.format("DND_CUSTOM.Chat.InitiateMagicGranted", {
        name: this.actor.name,
        class: game.i18n.localize(DND_CUSTOM.classes[choice.classKey]),
        cantrip1: choice.cantripItems[0].name,
        cantrip2: choice.cantripItems[1].name,
        spell: choice.levelOneSpellItem.name
      })
    });
  }

  /** Invoque le compagnon animal d'une Capacité `system.summonsCompanion` (ex. "Compagnon
   *  animal", Maître des bêtes/Rôdeur) : une seule fois par personnage (flag
   *  `beastCompanionCreated`, cf. helpers/companion.js), jamais recréé ensuite. */
  static async #onSummonCompanion(event, target) {
    const item = this.actor.items.get(target.closest("[data-item-id]")?.dataset.itemId);
    if (!item || !item.system.summonsCompanion) return;
    if (this.actor.getFlag(SYSTEM_ID, "beastCompanionCreated")) return;

    await requestBeastCompanion(this.actor);
  }

  /** Dépense une charge de "Dés de manœuvre" (Maître de guerre, Guerrier) : contrairement à
   *  #onChooseFeatureOption (choix ponctuel et définitif), ce choix de manœuvre est reproposé à
   *  CHAQUE charge dépensée (cf. FeatureData#offersManeuverChoice, DND_CUSTOM.maneuvers,
   *  config.js) — même mécanique de dialogue que #offerEquipSlotDialog
   *  (sheets/inventory-drag-drop.js), juste rejouée à chaque utilisation plutôt qu'une fois. */
  static async #onUseManeuver(event, target) {
    const item = this.actor.items.get(target.closest("[data-item-id]")?.dataset.itemId);
    if (!item || !item.system.offersManeuverChoice) return;
    if (!(await this.#consumeActionEconomy(item))) return;

    const options = DND_CUSTOM.maneuvers;
    const rows = Object.entries(options)
      .map(
        ([key, labelKey], index) => `
        <label class="checkbox-row">
          <input type="radio" name="maneuver" value="${key}" ${index === 0 ? "checked" : ""}>
          ${game.i18n.localize(labelKey)}
        </label>`
      )
      .join("");
    const chosenKey = await DialogV2.prompt({
      window: { title: item.name },
      content: `<div style="display:flex;flex-direction:column;gap:0.4rem;">${rows}</div>`,
      ok: {
        label: game.i18n.localize("DND_CUSTOM.Abilities.ChooseOptionConfirm"),
        callback: (ev, button) => button.form.elements.maneuver?.value
      }
    });
    if (!chosenKey) return;

    const remaining = await this.#consumeFeatureCharge(item);
    if (remaining === null) return;

    const roll = new Roll(item.system.rollFormula, this.actor.getRollData());
    await roll.evaluate();
    await roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      flavor: `${item.name} — ${game.i18n.localize(options[chosenKey])} (${remaining}/${item.system.uses.max})`,
      flags: sheetRollFlags()
    });
  }

  /** Technique de la Main Ouverte (Open Hand, Moine, SRD 5e — chantier "8 sous-classes déjà à
   *  ≥1 mécanique", 2026-08-23) : sur un coup de Rafale de coups, choix d'un effet parmi 3 (cf.
   *  FeatureData#offersOpenHandTechnique/DND_CUSTOM.openHandEffects, config.js), reproposé à
   *  chaque utilisation (même dialogue que #onUseManeuver ci-dessus), puis jet de sauvegarde de
   *  Dextérité (simplifié — SRD 5e laisse la cible choisir Dex ou Force) pour CHAQUE cible
   *  actuellement ciblée, comparé au DD de Moine (8 + maîtrise + Sagesse, `saveDCAbility: "wis"`
   *  toujours réglé sur cette Capacité, jamais `spellcastingAbility[class]` — le Moine n'est pas
   *  une classe lanceuse). Ne consomme ni charge ni Action/Action bonus propres : rider gratuit
   *  d'un coup de Rafale de coups déjà comptabilisée séparément (costsResource: "Ki"). Échec :
   *  applique l'effet choisi (à terre -> toggleStatusEffect ; pas de réaction -> vide
   *  reactionAvailable UNIQUEMENT pour un personnage joueur, une cible PNJ n'a pas ce suivi ;
   *  repoussée -> non automatisé, laissé au MJ, cf. commentaire de la Capacité). */
  static async #onUseOpenHandTechnique(event, target) {
    const item = this.actor.items.get(target.closest("[data-item-id]")?.dataset.itemId);
    if (!item || !item.system.offersOpenHandTechnique) return;

    const options = DND_CUSTOM.openHandEffects;
    const rows = Object.entries(options)
      .map(
        ([key, labelKey], index) => `
        <label class="checkbox-row">
          <input type="radio" name="openHandEffect" value="${key}" ${index === 0 ? "checked" : ""}>
          ${game.i18n.localize(labelKey)}
        </label>`
      )
      .join("");
    const chosenEffect = await DialogV2.prompt({
      window: { title: item.name },
      content: `<div style="display:flex;flex-direction:column;gap:0.4rem;">${rows}</div>`,
      ok: {
        label: game.i18n.localize("DND_CUSTOM.Abilities.ChooseOptionConfirm"),
        callback: (ev, button) => button.form.elements.openHandEffect?.value
      }
    });
    if (!chosenEffect) return;

    const system = this.actor.system;
    const wisMod = abilityModifier(system.abilities.wis.total);
    const dc = spellSaveDC(proficiencyBonus(system.attributes.level), wisMod);
    const targets = Array.from(game.user.targets);

    if (!targets.length) {
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: this.actor }),
        content: game.i18n.format("DND_CUSTOM.Chat.SaveSpellNoTarget", {
          spell: item.name,
          ability: game.i18n.localize(DND_CUSTOM.abilities.dex),
          dc
        })
      });
      return;
    }

    for (const token of targets) {
      const targetActor = token.actor;
      if (!targetActor?.system?.abilities) continue;

      const mod = targetSaveModifier(targetActor.system, "dex");
      const roll = new Roll(`1d20${formatModifier(mod)}`);
      await roll.evaluate();
      const success = roll.total >= dc;
      if (!success) {
        if (chosenEffect === "prone") await targetActor.toggleStatusEffect("prone", { active: true });
        else if (chosenEffect === "noReaction" && targetActor.type === "character") {
          await targetActor.update({ "system.combat.reactionAvailable": false });
        }
      }
      const resultKey = success ? "DND_CUSTOM.Roll.SaveSuccess" : "DND_CUSTOM.Roll.SaveFail";
      await roll.toMessage({
        speaker: ChatMessage.getSpeaker({ actor: targetActor }),
        flavor: `${game.i18n.format(resultKey, {
          name: targetActor.name,
          spell: item.name,
          ability: game.i18n.localize(DND_CUSTOM.abilities.dex),
          dc
        })} — ${game.i18n.localize(options[chosenEffect])}`,
        flags: sheetRollFlags()
      });
    }
  }

  /** Jet de caractéristique (1d20 + modificateur). Maj-clic = avantage, Ctrl-clic =
   *  désavantage (cf. tooltip des boutons de jet). */
  static async #onRollAbility(event, target) {
    const key = target.dataset.key;
    const mod = abilityModifier(this.actor.system.abilities[key].total);
    const cond = conditionRollEffects(this.actor, "check", key);
    // Ennemi juré (Rôdeur 1, SRD 5e) : avantage au test d'Intelligence brut (se souvenir d'une
    // info) contre une cible actuellement ciblée du type de créature favori choisi.
    const favoredEnemyAdvantage = key === "int" && hasFavoredEnemyAdvantage(this.actor);
    await rollCheck({
      actor: this.actor,
      formula: formatModifier(mod) + cond.bonus,
      flavor: game.i18n.format("DND_CUSTOM.Roll.AbilityCheck", {
        ability: game.i18n.localize(DND_CUSTOM.abilities[key])
      }),
      advantage: event.shiftKey || cond.advantage || favoredEnemyAdvantage,
      disadvantage: event.ctrlKey || cond.disadvantage,
      inspirationEligible: true
    });
  }

  /** Jet de sauvegarde (1d20 + modificateur de caractéristique + bonus de maîtrise si
   *  maîtrisée). `criticalRules: true` : un 1/20 naturel est un échec/succès critique
   *  automatique EN COMBAT (retour de test) — ce système ne compare déjà aucune sauvegarde à
   *  une CD (le MJ juge à l'œil), donc seul le libellé de chat change, au MJ d'appliquer la
   *  règle. */
  static async #onRollSave(event, target) {
    const key = target.dataset.key;
    const system = this.actor.system;
    const mod = abilityModifier(system.abilities[key].total);
    const profBonus = system.saves[key].proficient ? proficiencyBonus(system.attributes.level) : 0;
    const cond = conditionRollEffects(this.actor, "save", key);
    // Combat monté (don SRD 5e, clause 3) : "votre monture réussit automatiquement tout jet de
    // sauvegarde de Dextérité que vous réussissez vous-même" — la réussite n'étant jamais
    // déterminée par ce système (aucune sauvegarde générique ne compare à un DD, le MJ juge à
    // l'œil, cf. commentaire ci-dessus), seul un rappel textuel est ajouté, jamais un jet/statut
    // appliqué automatiquement à la monture.
    const mount = system.combat.mountedActorId ? game.actors.get(system.combat.mountedActorId) : null;
    const mountNote = key === "dex" && mount && hasFeature(this.actor.items.contents, "Combat monté")
      ? ` (${game.i18n.format("DND_CUSTOM.Roll.MountedDexSaveNote", { mount: mount.name })})`
      : "";
    await rollCheck({
      actor: this.actor,
      formula: formatModifier(mod + profBonus) + cond.bonus,
      flavor: game.i18n.format("DND_CUSTOM.Roll.SavingThrow", {
        ability: game.i18n.localize(DND_CUSTOM.abilities[key])
      }) + mountNote,
      advantage: event.shiftKey || cond.advantage,
      disadvantage: event.ctrlKey || cond.disadvantage,
      criticalRules: true,
      savingThrow: true
    });
  }

  /** Jet de compétence (1d20 + modificateur). L'avantage d'Origine (cf.
   *  CharacterData#prepareDerivedData) et le désavantage d'armure (Discrétion) sont appliqués
   *  automatiquement en plus du Maj/Ctrl-clic manuel — plusieurs avantages ne cumulent jamais
   *  (SRD 5e), et avantage + désavantage s'annulent (cf. rollCheck).
   *
   *  Bonus conditionnel de trait spécial d'Origine (ex. Art de la Parole/Lucentia sur
   *  Perspicacité, Sagesse Ancienne/Azhar sur Perception, cf. `specialTrait.conditionalBonus`
   *  dans scripts/data/origins.json) : retour de test, ce bonus ne doit PAS s'appliquer
   *  automatiquement (contrairement à l'avantage d'Origine ci-dessus, qui lui reste automatique)
   *  — proposé comme un choix au moment du jet via une boîte de dialogue, le joueur décidant
   *  d'utiliser ou non son trait pour CE jet précis. */
  static async #onRollSkill(event, target) {
    const key = target.dataset.key;
    const system = this.actor.system;
    const advantageKey = event.shiftKey;
    const disadvantageKey = event.ctrlKey;
    const profBonus = proficiencyBonus(system.attributes.level);
    const jackOfAllTrades = hasFeature(this.actor.items.contents, "Aptitudes multiples");
    let mod = skillModifier(system, key, profBonus, jackOfAllTrades);
    const originAdvantage = Boolean(
      game.dndCustomAi?.origins?.[system.origin]?.skillAdvantages?.includes(key)
    );
    const armorDisadvantage = key === "stealth" && system.stealthDisadvantage;
    // Infiltration (sous-classe Assassin, Roublard, niveau 9) : avantage automatique aux tests
    // de Discrétion — propre au personnage qui jette (Capacité qu'il possède), pas une lecture
    // d'état de cible, donc dans le même esprit que l'avantage d'Origine ci-dessus. Vérifie la
    // Capacité réellement possédée (comme jackOfAllTrades ci-dessus), pas seulement la
    // sous-classe choisie : le niveau 9 doit être atteint.
    const assassinStealthAdvantage = key === "stealth" && hasFeature(this.actor.items.contents, "Infiltration");
    // Ennemi juré (Rôdeur 1, SRD 5e) : avantage au test de Survie (pister) contre une cible
    // actuellement ciblée du type de créature favori choisi.
    const favoredEnemyAdvantage = key === "survival" && hasFavoredEnemyAdvantage(this.actor);
    const cond = conditionRollEffects(this.actor, "check", SKILL_ABILITIES[key]);

    let flavor = game.i18n.format("DND_CUSTOM.Roll.SkillCheck", { skill: game.i18n.localize(DND_CUSTOM.skills[key]) });
    const specialTrait = game.dndCustomAi?.origins?.[system.origin]?.specialTrait;
    if (specialTrait?.conditionalBonus?.skill === key) {
      const useTrait = await DialogV2.confirm({
        window: { title: specialTrait.name },
        content: `<p>${game.i18n.format("DND_CUSTOM.Roll.OriginTraitBonusPrompt", { trait: specialTrait.name })}</p>`,
        rejectClose: false
      });
      if (useTrait) {
        mod += abilityModifier(system.abilities[specialTrait.conditionalBonus.ability].total);
        flavor += ` (${specialTrait.name})`;
      }
    }

    await rollCheck({
      actor: this.actor,
      formula: formatModifier(mod) + cond.bonus,
      flavor,
      advantage: advantageKey || originAdvantage || assassinStealthAdvantage || favoredEnemyAdvantage || cond.advantage,
      disadvantage: disadvantageKey || armorDisadvantage || cond.disadvantage,
      inspirationEligible: true
    });
  }

  /** Jet d'attaque d'une arme de l'inventaire (1d20 + bonus d'attaque, cf. weaponAttackDamage
   *  dans rules.js — bonus de maîtrise seulement si la classe couvre la catégorie de l'arme).
   *  `criticalRules: true` : 1/20 naturel = échec/coup critique automatique EN COMBAT (retour de
   *  test) — un coup critique pose un flag transitoire sur CETTE arme précise (pas sur l'Actor,
   *  pour ne jamais affecter une autre arme/un autre sort en cours d'usage), consommé par le
   *  prochain jet de dégâts de cette même arme (#onRollWeaponDamage) pour doubler ses dés.
   *
   *  `noteActionEconomyUsage(..., { isWeaponAttack: true })` (chantier "Suivi de l'action/action
   *  bonus", 2026-08-23) : contrairement aux Capacités/Sorts (`item.system.activation`), une arme
   *  n'a pas de champ activation propre — un jet d'attaque à l'arme consomme toujours l'Action,
   *  `isWeaponAttack` exempte du rappel les personnages avec Attaque supplémentaire. */
  static async #onRollWeaponAttack(event, target) {
    const item = this.actor.items.get(target.closest("[data-item-id]")?.dataset.itemId);
    if (!item || item.type !== "weapon") return;
    const proficient = isProficientWithWeapon(this.actor.system.class, item.system.weaponType);
    const atk = weaponAttackDamage(
      item.system,
      this.actor.system.abilities,
      proficiencyBonus(this.actor.system.attributes.level),
      proficient
    );
    const cond = conditionRollEffects(this.actor, "attack");
    const { isCriticalHit } = await rollCheck({
      actor: this.actor,
      formula: formatModifier(atk.attackBonus) + cond.bonus,
      flavor: game.i18n.format("DND_CUSTOM.Roll.WeaponAttack", { weapon: item.name }),
      advantage: event.shiftKey || cond.advantage || hasMountedSizeAdvantage(this.actor),
      disadvantage: event.ctrlKey || cond.disadvantage || isDisadvantagedByHuntedTarget(this.actor),
      compareToTargetAc: true,
      criticalRules: true,
      forceCriticalHit: hasAssassinAutoCritical(this.actor),
      criticalThreshold: improvedCriticalThreshold(this.actor)
    });
    if (isCriticalHit) await item.setFlag(SYSTEM_ID, "pendingCritical", true);
    await noteActionEconomyUsage(this.actor, "action", { isWeaponAttack: true });
    await recordAttackOnTargets(this.actor);
  }

  /** Jet de dégâts d'une arme de l'inventaire. Pour une arme Polyvalente, le dé par défaut
   *  suit l'équipement réel (deux mains si la main secondaire est libre, une main sinon, cf.
   *  tab-equipment.hbs/tab-inventory.hbs) ; le bouton alternative (ou Maj-clic) force l'autre
   *  dé. Pas d'avantage/désavantage (ne concerne que les jets de d20). */
  static async #onRollWeaponDamage(event, target) {
    const item = this.actor.items.get(target.closest("[data-item-id]")?.dataset.itemId);
    if (!item || item.type !== "weapon") return;

    const isVersatile = item.system.properties.versatile && Boolean(item.system.damageVersatile.dice);
    let isTwoHandedActive = false;
    if (isVersatile) {
      const otherOffHand = this.actor.items.contents.find(
        (other) =>
          other.id !== item.id &&
          ["weapon", "armor"].includes(other.type) &&
          other.system.equipped &&
          equipmentSlots(other.type, other.system).includes("offHand")
      );
      isTwoHandedActive =
        item.system.equipped &&
        equipmentSlots(item.type, item.system).includes("mainHand") &&
        !otherOffHand;
    }
    const forceAlternate = event.shiftKey || target.dataset.versatile === "true";
    const useVersatileDice = isVersatile && (forceAlternate ? !isTwoHandedActive : isTwoHandedActive);
    const dice = useVersatileDice ? item.system.damageVersatile.dice : item.system.damage.dice;
    if (!dice) return;

    const atk = weaponAttackDamage(
      item.system,
      this.actor.system.abilities,
      proficiencyBonus(this.actor.system.attributes.level)
    );
    const damageTypeLabel = item.system.damage.type
      ? game.i18n.localize(DND_CUSTOM.damageTypes[item.system.damage.type])
      : "";
    // Consomme le flag posé par #onRollWeaponAttack sur un coup critique (jamais sur l'Actor,
    // cf. son commentaire) : dés doublés une seule fois, puis retiré même si ce jet de dégâts
    // ne correspond finalement pas à l'attaque qui l'a posé (le joueur reste libre de l'ordre
    // de ses clics, cohérent avec "le jet reste manuel").
    const critical = Boolean(item.getFlag(SYSTEM_ID, "pendingCritical"));
    if (critical) await item.unsetFlag(SYSTEM_ID, "pendingCritical");
    // Critique brutal (Barbare 9, SRD 5e) : un dé de dégâts supplémentaire sur un coup critique
    // à l'arme de CORPS À CORPS uniquement (RAW) — cf. rollDamage#criticalMultiplier.
    const isMelee = item.system.weaponType?.startsWith("melee");
    const criticalMultiplier =
      critical && isMelee && hasFeature(this.actor.items.contents, "Critique brutal") ? 3 : 2;
    // Rage (Barbare, SRD 5e — Niveau C, 2026-08-24) : +2 dégâts sur une attaque d'arme de CORPS
    // À CORPS utilisant la Force (RAW : "si vous utilisez une arme basée sur la Force").
    // `atk.abilityMod` (weaponAttackDamage, rules.js) vaut déjà le meilleur de Force/Dextérité
    // pour une arme Finesse — comparer à strMod exclut donc le cas où le joueur combat en
    // Dextérité sur une Finesse (Dextérité strictement supérieure), sans complexifier
    // weaponAttackDamage pour ce seul cas.
    const strMod = abilityModifier(this.actor.system.abilities.str.total);
    const rageDamageBonus = this.actor.statuses.has("raging") && isMelee && atk.abilityMod === strMod ? "+2" : "";
    await rollDamage({
      actor: this.actor,
      dice,
      formula: formatModifier(atk.abilityMod) + rageDamageBonus,
      flavor: `${game.i18n.format("DND_CUSTOM.Roll.WeaponDamage", { weapon: item.name })}${damageTypeLabel ? ` (${damageTypeLabel})` : ""}`,
      critical,
      criticalMultiplier,
      damageType: item.system.damage.type,
      isMagicalSource: item.system.magic
    });

    // Dégâts BONUS d'une propriété magique (chantier "types de dégâts", Phase 3, 2026-08-24 —
    // ex. épée de feu = tranchant + feu) : 2e message de dégâts DISTINCT, son propre type, jamais
    // de modificateur de caractéristique/Rage ajouté (SRD 5e : dés fixes) — résolu indépendamment
    // du 1er contre les résistances de la cible (cf. damageTypeMultiplier, dnd-custom-ai.js).
    // Même critique (dés doublés/triplés) que le composant principal, SRD 5e : "roll all of the
    // attack's damage dice twice" sur un coup critique, sans distinction de composant.
    if (item.system.secondaryDamage.dice) {
      const secondaryDamageTypeLabel = item.system.secondaryDamage.type
        ? game.i18n.localize(DND_CUSTOM.damageTypes[item.system.secondaryDamage.type])
        : "";
      await rollDamage({
        actor: this.actor,
        dice: item.system.secondaryDamage.dice,
        formula: "",
        flavor: `${game.i18n.format("DND_CUSTOM.Roll.WeaponDamage", { weapon: item.name })}${secondaryDamageTypeLabel ? ` (${secondaryDamageTypeLabel})` : ""}`,
        critical,
        criticalMultiplier,
        damageType: item.system.secondaryDamage.type,
        isMagicalSource: item.system.magic
      });
    }
  }

  /** Lance un sort de l'onglet Sorts : décompte 1 charge d'un emplacement de sort (système réel
   *  par palier 1-9, cf. rules.js > spellSlotsForClass et helpers/spell-slot-choice.js pour le
   *  surclassement), sans effet pour un tour de magie (niveau 0). Un sort marqué "jet d'attaque"
   *  (`system.attack`, cf. SpellData dans item-data.js) fait un jet d'attaque de sort (1d20 +
   *  spellAttackBonus, comme #onRollWeaponAttack pour une arme) au lieu de simplement poster la
   *  description ; le jet de dégâts associé reste un bouton séparé (#onRollSpellDamage,
   *  affiché seulement si un hit est confirmé), sur le même principe que les armes — dégâts non
   *  automatiques tant que le MJ n'a pas confirmé le jet d'attaque contre la CA de la cible. */
  static async #onCastSpell(event, target) {
    const item = this.actor.items.get(target.closest("[data-item-id]")?.dataset.itemId);
    if (!item || item.type !== "spell") return;
    if (!(await this.#consumeActionEconomy(item))) return;

    // Incantation rituelle (Capacité, SRD 5e) : un sort marqué Rituel se lance sans dépenser de
    // charge dès que le personnage possède la Capacité "Incantation rituelle (<sa classe>)" —
    // appliqué automatiquement, sans case à cocher ni choix à faire pour le joueur. Seuls le
    // Clerc et le Druide ont cette Capacité dans world-items/features.json (SRD 5e : Magicien
    // aussi, mais uniquement pour les sorts déjà inscrits dans son grimoire — non modélisé ici,
    // cf. simplification des Capacités de classe).
    const castsAsFreeRitual =
      item.system.ritual && RITUAL_CASTING_FEATURES.some((name) => hasFeature(this.actor.items.contents, name));
    // Incantation mineure de sous-classe (ex. Chevalier occulte, Guerrier — cf.
    // FeatureData#grantsSpells) : ces Sorts sont "toujours prêts", jamais décomptés d'un
    // emplacement — sans quoi ils resteraient inutilisables pour une classe non lanceuse (tous
    // paliers à 0/0, cf. rules.js > spellSlotsForClass). Cherche parmi les Capacités possédées
    // plutôt que sur le Sort lui-même : c'est la Capacité qui déclare la liste, jamais le Sort.
    const castsAsFreeSubclassSpell = this.actor.items.some(
      (feature) => feature.type === "feature" && feature.system.grantsSpells?.has?.(item.name)
    );
    // Don "Magie d'initié" (cf. FeatureData#offersSpellChoice/chosenLevelOneSpell) : le sort de
    // niveau 1 choisi se lance GRATUITEMENT une fois entre deux repos longs (SRD 5e), au-delà il
    // redevient un sort normal (décompte un emplacement du personnage comme les autres, cf.
    // commentaire de chosenLevelOneSpell dans item-data.js). Charge réutilisée directement sur
    // le don lui-même (`uses`, réglé au moment du choix), consommée plus bas une fois le
    // contournement confirmé.
    const initiateFeature = this.actor.items.find(
      (feature) => feature.type === "feature" && feature.system.chosenLevelOneSpell === item.name
    );
    const castsAsFreeInitiateSpell = Boolean(initiateFeature && initiateFeature.system.uses.value > 0);
    // Palier RÉELLEMENT dépensé (peut différer de item.system.level en cas de surclassement) —
    // sert au bonus de soin de Disciple de la vie (Life, Clerc) ci-dessous, cf. son commentaire.
    let effectiveSpellLevel = item.system.level;
    if (item.system.level > 0 && !castsAsFreeRitual && !castsAsFreeSubclassSpell && !castsAsFreeInitiateSpell) {
      const slots = this.actor.system.spells.slots;
      // Détermine quel palier dépenser (le sien si disponible, sinon propose un surclassement
      // vers un palier supérieur disponible, cf. spell-slot-choice.js) : renvoie null si aucun
      // palier utilisable (épuisé ou dialogue annulé par le joueur).
      const chosenLevel = await chooseSpellSlotLevel(item.name, item.system.level, slots);
      if (chosenLevel === null) {
        ui.notifications.warn(game.i18n.localize("DND_CUSTOM.Spells.NoSlotAvailable"));
        return;
      }
      effectiveSpellLevel = chosenLevel;
      await this.actor.update({ [`system.spells.slots.${chosenLevel}.value`]: slots[chosenLevel].value - 1 });

      // Voie de la Magie sauvage (Ensorceleur, cf. world-items/subclasses.json > "wildSorcery") :
      // Surtenance sauvage tirée à chaque emplacement de sort réellement dépensé — même
      // primitive (P1) que la Voie de la Magie sauvage du Barbare, table de tirage distincte
      // (rollWildSurge indexe par classe, pas par sous-classe : "wildMagic"/Barbare et
      // "wildSorcery"/Ensorceleur ne se confondent jamais).
      if (this.actor.system.subclass === "wildSorcery") await rollWildSurge(this.actor, "sorcerer");
    } else if (castsAsFreeInitiateSpell) {
      await initiateFeature.update({ "system.uses.value": 0 });
    }

    // Concentration, SRD 5e : un seul sort à la fois — en lancer un nouveau remplace celui en
    // cours (pas de choix à faire, la règle est automatique).
    if (item.system.concentration) {
      const previous = this.actor.system.spells.concentratingOn;
      await this.actor.update({ "system.spells.concentratingOn": item.name });
      if (previous && previous !== item.name) {
        await ChatMessage.create({
          speaker: ChatMessage.getSpeaker({ actor: this.actor }),
          content: game.i18n.format("DND_CUSTOM.Chat.ConcentrationBroken", { name: this.actor.name, spell: previous })
        });
      }
    }

    // Sort émettant de la lumière (ex. Lumière, cf. SpellData#light dans item-data.js) : allume
    // le(s) token(s) du lanceur, même principe qu'un objet `gear` "light" (#toggleLight) —
    // retour de test, rien ne liait jusqu'ici les sorts de lumière au système de lumière des
    // tokens. Un sort n'a pas d'état "allumé/éteint" persistant à basculer (contrairement à un
    // objet porté, réutilisable via le même bouton "Utiliser") : chaque lancer allume, sans
    // interrupteur dédié — cohérent avec un effet magique que le MJ narrativise à sa fin.
    // `#setTokensLight` poste déjà son propre message "allume {sort}" : retour de test, un
    // second message générique "lance {sort}" (plus bas) s'ajoutait en double pour la même
    // action — sauté ici (sauf sort d'attaque, qui poste son propre jet de toute façon).
    const hasLight = Boolean(item.system.light?.bright || item.system.light?.dim);
    if (hasLight) {
      await DndCustomActorSheet.#setTokensLight(this.actor, item.name, item.system.light);
      if (!item.system.attack) return;
    }

    if (item.system.attack) {
      const system = this.actor.system;
      const spellAbility = DND_CUSTOM.spellcastingAbility[system.class];
      const spellAbilityMod = spellAbility ? abilityModifier(system.abilities[spellAbility].total) : 0;
      const attackBonus = spellAttackBonus(proficiencyBonus(system.attributes.level), spellAbilityMod);
      const cond = conditionRollEffects(this.actor, "attack");
      // criticalRules/pendingCritical : même mécanique que #onRollWeaponAttack (cf. son
      // commentaire) — flag posé sur CE sort précis, consommé par #onRollSpellDamage.
      const { isCriticalHit } = await rollCheck({
        actor: this.actor,
        formula: formatModifier(attackBonus) + cond.bonus,
        flavor: game.i18n.format("DND_CUSTOM.Roll.SpellAttack", { spell: item.name }),
        advantage: event.shiftKey || cond.advantage || hasMountedSizeAdvantage(this.actor),
        disadvantage: event.ctrlKey || cond.disadvantage || isDisadvantagedByHuntedTarget(this.actor),
        compareToTargetAc: true,
        criticalRules: true,
        forceCriticalHit: hasAssassinAutoCritical(this.actor),
        criticalThreshold: improvedCriticalThreshold(this.actor)
      });
      if (isCriticalHit) await item.setFlag(SYSTEM_ID, "pendingCritical", true);
      await recordAttackOnTargets(this.actor);
      return;
    }

    // Sort à jet de sauvegarde de la cible (ex. Boule de feu, cf. SpellData#save dans
    // item-data.js) : auto-jet POUR CHAQUE cible actuellement ciblée (1d20 + son propre
    // modificateur de sauvegarde, rules.js > targetSaveModifier), comparé au DD du lanceur —
    // même niveau d'automatisation que le jet d'attaque ci-dessus (compareToTargetAc), jamais
    // une interruption du client de la cible. Le dé de dégâts éventuel (system.damage.dice) se
    // lance séparément via le même bouton "Dégâts" que pour un sort d'attaque (#onRollSpellDamage
    // ci-dessous, déjà indifférent à attack/save) ; son application (pleine ou moitié selon
    // halfOnSave) reste manuelle via "Appliquer les dégâts", comme pour une attaque qui touche/
    // rate déjà aujourd'hui.
    if (item.system.save?.ability) {
      const system = this.actor.system;
      const spellAbility = DND_CUSTOM.spellcastingAbility[system.class];
      const spellAbilityMod = spellAbility ? abilityModifier(system.abilities[spellAbility].total) : 0;
      const dc = spellSaveDC(proficiencyBonus(system.attributes.level), spellAbilityMod);
      const abilityLabel = game.i18n.localize(DND_CUSTOM.abilities[item.system.save.ability]);
      const targets = Array.from(game.user.targets);

      if (!targets.length) {
        await ChatMessage.create({
          speaker: ChatMessage.getSpeaker({ actor: this.actor }),
          content: game.i18n.format("DND_CUSTOM.Chat.SaveSpellNoTarget", { spell: item.name, ability: abilityLabel, dc })
        });
        return;
      }

      // Sort Prudent/Sort Élevé (Métamagie, Ensorceleur, cf. helpers/metamagic.js) : Maj/Ctrl-clic
      // sur "Lancer" propose de dépenser 1 point de sorcellerie pour faire réussir automatiquement
      // (Prudent) ou désavantager (Élevé) le jet d'UNE cible ciblée — aucune touche maintenue,
      // aucune Capacité "Métamagie" ou aucun point restant : `null` immédiat, comportement
      // inchangé, jamais de fenêtre popup pour le cas courant.
      const metamagic = await chooseMetamagicOption(this.actor, targets, {
        careful: event.shiftKey,
        heightened: event.ctrlKey
      });
      // Sculpteur de sorts (Évocation, Magicien, cf. helpers/sculpt-spells.js) : même Maj-clic
      // que Sort Prudent ci-dessus mais gratuit — jamais les deux à la fois en pratique (classes
      // différentes), donc pas de conflit si les deux helpers sont interrogés systématiquement.
      const sculptedTargetId = await chooseSculptSpellsTarget(this.actor, targets, { careful: event.shiftKey });

      // halfOnSave (chantier "prérequis Évasion/Tour de magie renforcé", Niveau C, 2026-08-24) :
      // pose sur la CIBLE le résultat du jet (réussite/échec) pour que #onRollSpellDamage +
      // "Appliquer les dégâts" (dnd-custom-ai.js > applyDamageToTargets) puisse appliquer
      // automatiquement la bonne fraction de dégâts plus tard — jamais fait jusqu'ici (le bouton
      // appliquait toujours le montant plein, quel que soit le résultat de CE jet). Un seul
      // exemplaire par cible (`setFlag` écrase le précédent) : lancer un 2e sort à sauvegarde sur
      // la même cible sans avoir appliqué les dégâts du 1er perd silencieusement son résultat —
      // simplification acceptée avec l'utilisateur, jamais de risque d'appliquer le MAUVAIS
      // multiplicateur au mauvais sort (spellName revérifié à la consommation, dnd-custom-ai.js).
      const setPendingSpellSaveOutcome = (targetActor, success) =>
        targetActor.setFlag(SYSTEM_ID, "pendingSpellSaveOutcome", {
          success,
          halfOnSave: item.system.save.halfOnSave,
          ability: item.system.save.ability,
          spellLevel: item.system.level,
          spellName: item.name
        });

      for (const token of targets) {
        const targetActor = token.actor;
        if (!targetActor?.system?.abilities) continue;

        if (metamagic?.targetActorId === targetActor.id && metamagic.option === "careful") {
          await setPendingSpellSaveOutcome(targetActor, true);
          await ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ actor: targetActor }),
            content: game.i18n.format("DND_CUSTOM.Roll.MetamagicCarefulSuccess", { name: targetActor.name, spell: item.name })
          });
          continue;
        }
        if (sculptedTargetId === targetActor.id) {
          await setPendingSpellSaveOutcome(targetActor, true);
          await ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ actor: targetActor }),
            content: game.i18n.format("DND_CUSTOM.Roll.SculptSpellsSuccess", { name: targetActor.name, spell: item.name })
          });
          continue;
        }

        const mod = targetSaveModifier(targetActor.system, item.system.save.ability);
        const heightened = metamagic?.targetActorId === targetActor.id && metamagic.option === "heightened";
        // Défense contre les attaques multiples (Tactiques défensives, Rôdeur Hunter — chantier
        // "8 sous-classes déjà à ≥1 mécanique", 2026-08-23) : avantage si CE lanceur a déjà
        // attaqué la cible ce round. "Volonté de fer" (cf. hasSteadfastAdvantage) s'applique
        // aussi depuis que les Sorts ont un `appliesCondition` (Niveau B, cf.
        // ClaudeFiles/MECANIQUES_A_AUTOMATISER.md) — ne se déclenche en pratique que si le sort
        // pose Effrayé sur échec, aucun des sorts SRD actuellement automatisés ici. S'annule avec
        // Sort Élevé (Métamagie) comme avantage/désavantage normalement (même logique que
        // rollCheck, rolls.js).
        const hasDefenseAdvantage =
          (hasMultiattackDefenseAdvantage(targetActor, this.actor) ||
            hasSteadfastAdvantage(targetActor, item.system.save.appliesCondition)) &&
          !heightened;
        const useDisadvantage = heightened && !hasMultiattackDefenseAdvantage(targetActor, this.actor);
        const die = hasDefenseAdvantage ? "2d20kh1" : useDisadvantage ? "2d20kl1" : "1d20";
        const roll = new Roll(`${die}${formatModifier(mod)}`);
        await roll.evaluate();
        const success = roll.total >= dc;
        // Applique automatiquement la condition configurée sur échec (ex. paralysé pour
        // Immobilisation de personne), même mécanisme que #onRollFeatureSave ci-dessus.
        if (!success && item.system.save.appliesCondition) {
          await targetActor.toggleStatusEffect(item.system.save.appliesCondition, { active: true });
        }
        await setPendingSpellSaveOutcome(targetActor, success);
        const resultKey = success
          ? item.system.save.halfOnSave
            ? "DND_CUSTOM.Roll.SaveSuccessHalf"
            : "DND_CUSTOM.Roll.SaveSuccess"
          : "DND_CUSTOM.Roll.SaveFail";
        await roll.toMessage({
          speaker: ChatMessage.getSpeaker({ actor: targetActor }),
          flavor: `${game.i18n.format(resultKey, { name: targetActor.name, spell: item.name, ability: abilityLabel, dc })}${
            hasDefenseAdvantage ? ` (${game.i18n.localize("DND_CUSTOM.Roll.Advantage")})` : ""
          }`,
          flags: sheetRollFlags()
        });
      }
      return;
    }

    // Sort de soin (ex. Mot de guérison, Soin des blessures, cf. SpellData#heal dans
    // item-data.js) : lance le dé de soin + modificateur de caractéristique d'incantation
    // immédiatement (contrairement aux dégâts d'un sort d'attaque, un soin n'a pas besoin de
    // confirmation de touche) — retour de test, ces sorts ne lançaient jusqu'ici aucun dé et ne
    // soignaient rien. Le bouton "Appliquer le soin" affiché sur ce message (dnd-custom-ai.js)
    // applique le total aux cibles actuellement ciblées, même mécanique que les dégâts.
    if (item.system.heal?.dice) {
      const system = this.actor.system;
      const spellAbility = DND_CUSTOM.spellcastingAbility[system.class];
      const spellAbilityMod = spellAbility ? abilityModifier(system.abilities[spellAbility].total) : 0;
      // Disciple de la vie (Life, Clerc, SRD 5e — chantier "8 sous-classes déjà à ≥1 mécanique",
      // 2026-08-23) : +2 PV sur tout sort de niveau 1+ qui soigne, +1 de plus par palier
      // au-delà du premier (surclassement inclus, cf. effectiveSpellLevel ci-dessus). Un tour de
      // magie (niveau 0) n'en bénéficie jamais.
      const disciplineOfLifeBonus =
        effectiveSpellLevel >= 1 && hasFeature(this.actor.items.contents, "Disciple de la vie")
          ? 2 + (effectiveSpellLevel - 1)
          : 0;
      await rollHeal({
        actor: this.actor,
        dice: item.system.heal.dice,
        formula: formatModifier(spellAbilityMod + disciplineOfLifeBonus),
        flavor: game.i18n.format("DND_CUSTOM.Roll.SpellHeal", { spell: item.name })
      });
      return;
    }

    // Sort qui pose un état sans jet associé (ex. Invisibilité, Invisibilité suprême, cf.
    // SpellData#grantsCondition dans item-data.js) : bascule l'état configuré sur chaque cible
    // actuellement ciblée (même convention de ciblage que save/heal ci-dessus — pour se rendre
    // soi-même invisible, le lanceur doit se cibler lui-même). Pas de jet, donc pas de message
    // dédié : tombe ensuite dans le message générique "lance {sort}" ci-dessous.
    if (item.system.grantsCondition) {
      const targets = Array.from(game.user.targets);
      if (!targets.length) {
        ui.notifications.warn(game.i18n.localize("DND_CUSTOM.Chat.NoTarget"));
      } else {
        for (const token of targets) {
          if (!token.actor) continue;
          await token.actor.toggleStatusEffect(item.system.grantsCondition, { active: true });
        }
      }
    }

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      content: game.i18n.format("DND_CUSTOM.Chat.CastSpell", { name: this.actor.name, spell: item.name })
    });
  }

  /** Jet de dégâts d'un sort d'attaque (cf. #onCastSpell) : juste le(s) dé(s) de dégâts
   *  configurés sur le sort, sans modificateur — contrairement à une arme, les dégâts d'un
   *  sort SRD 5e n'ajoutent pas le modificateur de caractéristique d'incantation (sauf mention
   *  explicite du sort, non modélisée ici) — SAUF si l'Actor possède une Capacité dont
   *  `boostsSpellDamage` cible ce Sort par son nom exact (ex. "Salve implacable"/Agonizing
   *  Blast, Invocation occulte de l'Occultiste, qui ajoute le modificateur de Cha aux dégâts de
   *  "Décharge occulte" — cf. FeatureData#boostsSpellDamage, item-data.js). */
  static async #onRollSpellDamage(event, target) {
    const item = this.actor.items.get(target.closest("[data-item-id]")?.dataset.itemId);
    if (!item || item.type !== "spell" || !item.system.damage.dice) return;

    const damageTypeLabel = item.system.damage.type
      ? game.i18n.localize(DND_CUSTOM.damageTypes[item.system.damage.type])
      : "";
    const critical = Boolean(item.getFlag(SYSTEM_ID, "pendingCritical"));
    if (critical) await item.unsetFlag(SYSTEM_ID, "pendingCritical");

    const boostFeature = this.actor.items.contents.find(
      (candidate) => candidate.type === "feature" && candidate.system.boostsSpellDamage === item.name
    );
    const boostMod = boostFeature
      ? abilityModifier(this.actor.system.abilities[boostFeature.system.boostsSpellDamageAbility].total)
      : 0;

    // Affinité élémentaire (Ensorceleur, Lignage draconique 6, SRD 5e) : modificateur de
    // Charisme ajouté aux dégâts d'un sort dont le TYPE correspond au lignage draconique choisi
    // (`system.combat.draconicResistanceType`, cf. Résilience draconique) — contrairement à
    // `boostsSpellDamage` ci-dessus (ciblé par nom de Sort exact), ce bonus se déclenche par
    // correspondance de type, jamais les deux en pratique (classes différentes).
    const hasElementalAffinity = hasFeature(this.actor.items.contents, "Affinité élémentaire");
    const elementalAffinityMod =
      hasElementalAffinity && item.system.damage.type && item.system.damage.type === this.actor.system.combat.draconicResistanceType
        ? abilityModifier(this.actor.system.abilities.cha.total)
        : 0;
    const totalBoostMod = boostMod + elementalAffinityMod;

    await rollDamage({
      actor: this.actor,
      dice: item.system.damage.dice,
      formula: totalBoostMod ? formatModifier(totalBoostMod) : "",
      critical,
      flavor: `${game.i18n.format("DND_CUSTOM.Roll.SpellDamage", { spell: item.name })}${damageTypeLabel ? ` (${damageTypeLabel})` : ""}`,
      damageType: item.system.damage.type,
      isSpellDamage: true,
      spellName: item.name,
      // Chantier "types de dégâts" (Phase 1, 2026-08-24) : un sort est toujours considéré
      // magique au SRD 5e (contourne la résistance/immunité générique "contre les attaques non
      // magiques", cf. damageTypeMultiplier, dnd-custom-ai.js).
      isMagicalSource: true
    });
  }

  /** Rompt volontairement la concentration en cours (SRD 5e : possible à tout moment). */
  static async #onDropConcentration() {
    await this.actor.update({ "system.spells.concentratingOn": "" });
  }

  /** Bascule l'onglet par niveau de la liste de Sorts (retour de test, cf. #activeSpellLevel) :
   *  purement visuel (classe `.active` sur l'onglet cliqué + le panneau correspondant), aucun
   *  `actor.update()` donc aucun re-render — mémorise juste le palier choisi sur l'instance pour
   *  qu'un re-render déclenché ailleurs (ex. lancer un sort) le restitue au lieu de retomber sur
   *  le premier palier (cf. context.spellsByLevel, #_prepareContext). */
  static #onSelectSpellLevel(event, target) {
    const level = Number(target.dataset.level);
    this.#activeSpellLevel = level;
    target.closest(".spell-level-tabs")
      ?.querySelectorAll(".spell-level-tab")
      .forEach((tab) => tab.classList.toggle("active", tab === target));
    this.element
      .querySelectorAll(".spell-level-group")
      .forEach((panel) => panel.classList.toggle("active", Number(panel.dataset.level) === level));
  }

  /** Bouton "Utiliser" de l'inventaire : objets `gear` avec `system.use.type` renseigné
   *  ("light" allume/éteint la source sur le(s) token(s) de l'Actor sur la scène active,
   *  "heal" rend (healBase + bonus de compétence) PV), ou objets `tool` avec
   *  `system.useEffect.skill` renseigné (test de compétence, cf. #onUseTool). */
  static async #onUseItem(event, target) {
    const itemId = target.closest("[data-item-id]")?.dataset.itemId;
    const item = this.actor.items.get(itemId);
    if (!item) return;

    if (item.type === "tool") return DndCustomActorSheet.#onUseTool(event, this.actor, item);

    const use = item.system.use;
    if (!use || use.type === "none") return;

    if (use.type === "light") return DndCustomActorSheet.#toggleLight(this.actor, item);
    if (use.type === "heal") return DndCustomActorSheet.#applyHeal(this.actor, item);
  }

  /** Test de compétence avec un outil (`system.useEffect.skill`, cf. ToolData) : l'outil
   *  confère sa propre maîtrise (bonus de maîtrise toujours appliqué, indépendamment de la
   *  maîtrise de la compétence elle-même — cf. toolCheckModifier dans rules.js), plus
   *  l'éventuel bonus fixe de l'objet (`system.useEffect.bonus`). Maj/Ctrl-clic = avantage/
   *  désavantage, même convention que #onRollSkill. Décrémente `system.quantity` à chaque
   *  utilisation (retour de test — s'écarte du SRD 5e, où un kit d'outils est réutilisable à
   *  l'infini, mais explicitement demandé) ; bloqué avec un avertissement une fois épuisé. */
  static async #onUseTool(event, actor, item) {
    const skillKey = item.system.useEffect.skill;
    if (!skillKey) return;

    if (item.system.quantity <= 0) {
      ui.notifications.warn(game.i18n.format("DND_CUSTOM.Chat.NoChargesLeft", { feature: item.name }));
      return;
    }

    const profBonus = proficiencyBonus(actor.system.attributes.level);
    const mod = toolCheckModifier(actor.system, skillKey, profBonus, item.system.useEffect.bonus);
    await rollCheck({
      actor,
      formula: formatModifier(mod),
      flavor: game.i18n.format("DND_CUSTOM.Roll.ToolCheck", {
        tool: item.name,
        skill: game.i18n.localize(DND_CUSTOM.skills[skillKey])
      }),
      advantage: event.shiftKey,
      disadvantage: event.ctrlKey
    });
    await item.update({ "system.quantity": item.system.quantity - 1 });
  }

  static async #toggleLight(actor, item) {
    const turningOn = !item.system.lit;
    if (turningOn) {
      // Un token n'a qu'une seule configuration de lumière active : éteindre toute autre
      // source déjà allumée sur cet Actor avant d'allumer celle-ci.
      const others = actor.items.contents.filter(
        (other) => other.id !== item.id && other.type === "gear" && other.system.use.type === "light" && other.system.lit
      );
      if (others.length) {
        await actor.updateEmbeddedDocuments(
          "Item",
          others.map((other) => ({ _id: other.id, "system.lit": false }))
        );
      }
    }

    await item.update({ "system.lit": turningOn });

    if (turningOn) {
      await DndCustomActorSheet.#setTokensLight(actor, item.name, item.system.use.light);
    } else {
      const applied = await DndCustomActorSheet.#applyTokensLight(actor, { bright: 0, dim: 0 });
      if (applied) {
        await ChatMessage.create({
          speaker: ChatMessage.getSpeaker({ actor }),
          content: game.i18n.format("DND_CUSTOM.Chat.UseLightOff", { name: actor.name, item: item.name })
        });
      }
    }
  }

  /** Allume la source de lumière du/des token(s) de `actor` sur la scène active (objet `gear`
   *  "light" allumé, cf. #toggleLight, ou sort émettant de la lumière, cf. #onCastSpell) et
   *  l'annonce dans le chat. `light` : `{ bright, dim }`, `dim` stocké comme rayon
   *  SUPPLÉMENTAIRE au-delà de `bright` (formulation SRD) — converti ci-dessous en rayon total
   *  depuis le token, attendu par `TokenDocument#light.dim`. */
  static async #setTokensLight(actor, itemName, light) {
    const applied = await DndCustomActorSheet.#applyTokensLight(actor, {
      bright: light.bright,
      dim: light.bright + light.dim
    });
    if (!applied) return;

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: game.i18n.format("DND_CUSTOM.Chat.UseLightOn", { name: actor.name, item: itemName })
    });
  }

  /** Applique `light` (déjà au format `TokenDocument#light`, rayons totaux) à tous les tokens
   *  actifs de `actor` sur la scène courante. Renvoie `false` (et prévient) sans rien modifier
   *  si l'Actor n'a aucun token sur la scène active. */
  static async #applyTokensLight(actor, light) {
    const tokens = actor.getActiveTokens();
    if (!tokens.length) {
      ui.notifications.warn(game.i18n.localize("DND_CUSTOM.Inventory.NoTokenOnScene"));
      return false;
    }
    for (const token of tokens) await token.document.update({ light });
    return true;
  }

  static async #applyHeal(actor, item) {
    const use = item.system.use;
    const bonus = skillModifier(actor.system, use.healSkill || "medicine", proficiencyBonus(actor.system.attributes.level));
    const amount = Math.max(0, use.healBase + bonus);

    const hp = actor.system.attributes.hp;
    await actor.update({ "system.attributes.hp.value": Math.min(hp.value + amount, hp.max) });

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: game.i18n.format("DND_CUSTOM.Chat.UseHeal", { name: actor.name, item: item.name, amount })
    });
  }

  /** Bascule purement visuelle (classe `.active` + icône case à cocher) de la sélection en
   *  attente d'un état dans la liste déroulante — ne touche jamais l'Actor. Retour de test :
   *  l'ancienne version appelait `actor.toggleStatusEffect` (donc un `actor.update()`) à chaque
   *  clic, déclenchant un re-render complet qui régénère le `<details>` et le referme,
   *  empêchant de cocher plusieurs états d'affilée sans rouvrir la liste à chaque fois. L'Actor
   *  n'est désormais mis à jour qu'à la fermeture de la liste, en un seul geste pour tous les
   *  états changés (cf. #applyPendingConditions, branché par #attachConditionsListeners). */
  static #onToggleConditionSelection(event, target) {
    const nowActive = target.classList.toggle("active");
    const icon = target.querySelector("i");
    icon.classList.toggle("fa-square", !nowActive);
    icon.classList.toggle("fa-square-check", nowActive);
  }

  /** Branche la persistance des états sur la fermeture de la liste déroulante (évènement natif
   *  `toggle` d'un `<details>`, déclenché à l'ouverture ET à la fermeture — seule la fermeture
   *  nous intéresse ici, repérée par `details.open` déjà repassé à `false`). */
  #attachConditionsListeners() {
    const details = this.element.querySelector(".conditions-dropdown");
    if (!details) return;
    details.addEventListener("toggle", () => {
      if (details.open) return;
      this.#applyPendingConditions(details);
    });
  }

  /** Compare la sélection en attente (classe `.active` posée par #onToggleConditionSelection)
   *  à l'état réel de l'Actor, et ne touche (via `Actor#toggleStatusEffect`, qui crée/retire
   *  l'ActiveEffect correspondante) que les états qui ont effectivement changé — jamais un
   *  Promise.all sur plusieurs bascules simultanées : des créations/suppressions concurrentes
   *  de documents embarqués sur le même Actor pourraient se marcher dessus. */
  async #applyPendingConditions(details) {
    const rows = [...details.querySelectorAll(".condition-checkbox-row")];
    const current = this.actor.statuses;
    const changed = rows.filter((row) => row.classList.contains("active") !== current.has(row.dataset.key));
    for (const row of changed) {
      await this.actor.toggleStatusEffect(row.dataset.key);
    }
  }

  static async #onExhaustionIncrease() {
    await this.#adjustExhaustion(1);
  }

  static async #onExhaustionDecrease() {
    await this.#adjustExhaustion(-1);
  }

  async #adjustExhaustion(delta) {
    const current = this.actor.system.attributes.exhaustion;
    const next = Math.max(0, Math.min(6, current + delta));
    if (next === current) return;
    await this.actor.update({ "system.attributes.exhaustion": next });
  }
}