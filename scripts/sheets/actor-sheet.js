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
  spellSlotFillUpdates
} from "../helpers/rules.js";
import { InventoryDragDropMixin } from "./inventory-drag-drop.js";
import { rollCheck, rollDamage, rollHeal } from "../helpers/rolls.js";
import { CharacterCreationWizard } from "./character-creation-wizard.js";
import { declareDeath } from "../helpers/death.js";
import { offerAbilityScoreOrFeatDialog } from "../helpers/level-up-choice.js";
import { offerSubclassChoiceDialog } from "../helpers/subclass-choice.js";
import { chooseSpellSlotLevel } from "../helpers/spell-slot-choice.js";
import { grantClassContent } from "../helpers/class-content.js";
import { requestBeastCompanion } from "../helpers/companion.js";
import { rollWildSurge } from "../helpers/wild-magic-tables.js";

const { HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

const SYSTEM_ID = "dnd-custom-ai";

// Niveau d'Exhaustion à partir duquel chaque catégorie de jet est désavantagée, SRD 5e.
const EXHAUSTION_CHECK_DISADVANTAGE_LEVEL = 1;
const EXHAUSTION_ATTACK_SAVE_DISADVANTAGE_LEVEL = 3;

// Capacités (world-items/features.json) conférant l'incantation rituelle gratuite (cf.
// #onCastSpell) : une par classe qui l'a en SRD 5e et pour laquelle elle est modélisée ici.
const RITUAL_CASTING_FEATURES = ["Incantation rituelle (Clerc)", "Incantation rituelle (Druide)"];

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

/** Avantage/désavantage automatique selon les états actifs (cf. CONFIG.statusEffects) et le
 *  niveau d'Exhaustion — seules les règles univoques et propres au personnage qui jette sont
 *  automatisées (pas d'effets dépendant d'une cible/de la position, hors du scope "combat
 *  automatisé avancé" explicitement exclu de ce système, cf. PROJECT.md). `kind` : "check"
 *  (test de caractéristique/compétence), "save" (sauvegarde), "attack" (jet d'attaque). */
function conditionRollEffects(actor, kind, abilityKey) {
  const statuses = actor.statuses;
  const exhaustion = actor.system.attributes?.exhaustion ?? 0;
  let advantage = false;
  let disadvantage = false;

  if (kind === "check") {
    disadvantage =
      statuses.has("poisoned") || statuses.has("frightened") || exhaustion >= EXHAUSTION_CHECK_DISADVANTAGE_LEVEL;
  } else if (kind === "attack") {
    disadvantage =
      statuses.has("poisoned") ||
      statuses.has("frightened") ||
      statuses.has("restrained") ||
      statuses.has("prone") ||
      statuses.has("blinded") ||
      exhaustion >= EXHAUSTION_ATTACK_SAVE_DISADVANTAGE_LEVEL;
    advantage = statuses.has("invisible");
  } else if (kind === "save") {
    disadvantage =
      exhaustion >= EXHAUSTION_ATTACK_SAVE_DISADVANTAGE_LEVEL || (abilityKey === "dex" && statuses.has("restrained"));
  }
  return { advantage, disadvantage };
}

/** Feuille de personnage joueur : un onglet Handlebars par PART, ApplicationV2/ActorSheetV2.
 *  Le glisser-déposer d'objets (InventoryDragDropMixin) permet de transférer un objet vers/
 *  depuis un autre Actor ouvert (ex. la fiche d'un véhicule). */
export class DndCustomActorSheet extends InventoryDragDropMixin(HandlebarsApplicationMixin(ActorSheetV2)) {
  static DEFAULT_OPTIONS = {
    classes: [SYSTEM_ID, "sheet", "actor", "character"],
    tag: "form",
    position: { width: 720, height: 720 },
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
      useFeatureCharge: DndCustomActorSheet.#onUseFeatureCharge,
      useResourceTechnique: DndCustomActorSheet.#onUseResourceTechnique,
      useConditionalFeature: DndCustomActorSheet.#onUseConditionalFeature,
      chooseFeatureOption: DndCustomActorSheet.#onChooseFeatureOption,
      summonCompanion: DndCustomActorSheet.#onSummonCompanion,
      useManeuver: DndCustomActorSheet.#onUseManeuver,
      toggleReaction: DndCustomActorSheet.#onToggleReaction
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
    // Capacités/Sorts (cf. #consumeReaction ci-dessous, hooks updateCombat/deleteCombat).
    context.reactionAvailable = canUseReaction(system);

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
      if (!resourceName) continue;
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
      spells: spells
        .filter((spell) => spell.system.level === level)
        .sort((a, b) => a.name.localeCompare(b.name, game.i18n.lang))
        .map((spell) => ({ item: spell }))
    })).filter((group) => group.spells.length);
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
   *  SRD 5e : seule classe qui récupère ses emplacements au repos court). */
  static async #onRestShort() {
    if (this.#isDead()) return;
    const hp = this.actor.system.attributes.hp;
    const updates = { "system.attributes.hp.value": Math.min(hp.value + Math.floor(hp.max / 2), hp.max) };
    if (this.actor.system.class === "warlock") Object.assign(updates, this.#spellSlotResetUpdates());
    await this.actor.update(updates);
    await this.#resetFeatureUses(["shortRest"]);
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      content: game.i18n.format("DND_CUSTOM.Chat.RestShort", { name: this.actor.name })
    });
  }

  /** Repos long : soigne intégralement et restaure tous les emplacements de sorts (SRD 5e). */
  static async #onRestLong() {
    if (this.#isDead()) return;
    const hp = this.actor.system.attributes.hp;
    const updates = { "system.attributes.hp.value": hp.max, ...this.#spellSlotResetUpdates() };
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
      flavor: game.i18n.localize("DND_CUSTOM.Roll.DeathSave")
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
    if (!(await this.#consumeReaction(item))) return;

    const remaining = await this.#consumeFeatureCharge(item);
    if (remaining === null) return;

    const roll = new Roll(item.system.rollFormula, this.actor.getRollData());
    await roll.evaluate();
    const flavor = remaining === undefined ? item.name : `${item.name} (${remaining}/${item.system.uses.max})`;
    await roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      flavor,
      ...(item.system.healsTarget ? { flags: { "dnd-custom-ai": { healRoll: true } } } : {})
    });
  }

  /** Utilisation d'une Capacité à charges limitées sans jet associé (ex. Imposition des
   *  mains) : décrémente le compteur et l'annonce dans le chat (pas de jet à afficher, donc
   *  pas de message automatique sinon comme pour #onRollFeature). */
  static async #onUseFeatureCharge(event, target) {
    const item = this.actor.items.get(target.closest("[data-item-id]")?.dataset.itemId);
    if (!item || item.type !== "feature" || !item.system.uses.max) return;
    if (!(await this.#consumeReaction(item))) return;

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
   *  (system.combat.reactionAvailable, cf. canUseReaction, rules.js) et la marque utilisée.
   *  Renvoie `true` si l'action associée peut se poursuivre (item non-réaction, ou réaction
   *  disponible et désormais consommée), `false` sinon (avec avertissement) — l'appelant doit
   *  alors annuler l'action, sans avoir encore décompté de charge. */
  async #consumeReaction(item) {
    if (item.system.activation !== "reaction") return true;
    if (!canUseReaction(this.actor.system)) {
      ui.notifications.warn(game.i18n.format("DND_CUSTOM.Chat.ReactionUnavailable", { name: item.name }));
      return false;
    }
    await this.actor.update({ "system.combat.reactionAvailable": false });
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

  /** Utilisation d'une technique consommant la réserve d'une AUTRE Capacité (`system.
   *  costsResource`, ex. les techniques de Moine consommant du Ki, cf. #consumeFeatureCharge
   *  pour le cas d'une Capacité à charges qui lui sont propres) : décrémente `system.uses.value`
   *  de la Capacité réservoir (trouvée par nom exact sur l'Actor) et l'annonce dans le chat.
   *  Bouton grisé côté template (tab-abilities.hbs > featureResourceState) dès que la réserve
   *  est vide, mais revérifié ici au cas où plusieurs clients cliqueraient en même temps. */
  static async #onUseResourceTechnique(event, target) {
    const item = this.actor.items.get(target.closest("[data-item-id]")?.dataset.itemId);
    if (!item || item.type !== "feature" || !item.system.costsResource) return;
    if (!(await this.#consumeReaction(item))) return;

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
    if (!(await this.#consumeReaction(item))) return;

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
   *  (`system.combat.<grantsChoice>`) et les options possibles viennent respectivement de
   *  `grantsChoice` lui-même et de DND_CUSTOM.totemSpirits (seule table de choix existante
   *  pour l'instant, cf. config.js) — n'affiche rien si le choix est déjà fait (bouton déjà
   *  masqué côté template de toute façon, revérifié ici par sécurité). */
  static async #onChooseFeatureOption(event, target) {
    const item = this.actor.items.get(target.closest("[data-item-id]")?.dataset.itemId);
    const fieldKey = item?.system.grantsChoice;
    if (!fieldKey || this.actor.system.combat[fieldKey]) return;

    const options = DND_CUSTOM.totemSpirits;
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
    if (!(await this.#consumeReaction(item))) return;

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
      flavor: `${item.name} — ${game.i18n.localize(options[chosenKey])} (${remaining}/${item.system.uses.max})`
    });
  }

  /** Jet de caractéristique (1d20 + modificateur). Maj-clic = avantage, Ctrl-clic =
   *  désavantage (cf. tooltip des boutons de jet). */
  static async #onRollAbility(event, target) {
    const key = target.dataset.key;
    const mod = abilityModifier(this.actor.system.abilities[key].total);
    const cond = conditionRollEffects(this.actor, "check");
    await rollCheck({
      actor: this.actor,
      formula: formatModifier(mod),
      flavor: game.i18n.format("DND_CUSTOM.Roll.AbilityCheck", {
        ability: game.i18n.localize(DND_CUSTOM.abilities[key])
      }),
      advantage: event.shiftKey || cond.advantage,
      disadvantage: event.ctrlKey || cond.disadvantage
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
    await rollCheck({
      actor: this.actor,
      formula: formatModifier(mod + profBonus),
      flavor: game.i18n.format("DND_CUSTOM.Roll.SavingThrow", {
        ability: game.i18n.localize(DND_CUSTOM.abilities[key])
      }),
      advantage: event.shiftKey || cond.advantage,
      disadvantage: event.ctrlKey || cond.disadvantage,
      criticalRules: true
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
    const cond = conditionRollEffects(this.actor, "check");

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
      formula: formatModifier(mod),
      flavor,
      advantage: advantageKey || originAdvantage || assassinStealthAdvantage || cond.advantage,
      disadvantage: disadvantageKey || armorDisadvantage || cond.disadvantage
    });
  }

  /** Jet d'attaque d'une arme de l'inventaire (1d20 + bonus d'attaque, cf. weaponAttackDamage
   *  dans rules.js — bonus de maîtrise seulement si la classe couvre la catégorie de l'arme).
   *  `criticalRules: true` : 1/20 naturel = échec/coup critique automatique EN COMBAT (retour de
   *  test) — un coup critique pose un flag transitoire sur CETTE arme précise (pas sur l'Actor,
   *  pour ne jamais affecter une autre arme/un autre sort en cours d'usage), consommé par le
   *  prochain jet de dégâts de cette même arme (#onRollWeaponDamage) pour doubler ses dés. */
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
      formula: formatModifier(atk.attackBonus),
      flavor: game.i18n.format("DND_CUSTOM.Roll.WeaponAttack", { weapon: item.name }),
      advantage: event.shiftKey || cond.advantage,
      disadvantage: event.ctrlKey || cond.disadvantage,
      compareToTargetAc: true,
      criticalRules: true,
      forceCriticalHit: hasAssassinAutoCritical(this.actor)
    });
    if (isCriticalHit) await item.setFlag(SYSTEM_ID, "pendingCritical", true);
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
    const damageType = item.system.damage.type
      ? game.i18n.localize(DND_CUSTOM.damageTypes[item.system.damage.type])
      : "";
    // Consomme le flag posé par #onRollWeaponAttack sur un coup critique (jamais sur l'Actor,
    // cf. son commentaire) : dés doublés une seule fois, puis retiré même si ce jet de dégâts
    // ne correspond finalement pas à l'attaque qui l'a posé (le joueur reste libre de l'ordre
    // de ses clics, cohérent avec "le jet reste manuel").
    const critical = Boolean(item.getFlag(SYSTEM_ID, "pendingCritical"));
    if (critical) await item.unsetFlag(SYSTEM_ID, "pendingCritical");
    await rollDamage({
      actor: this.actor,
      dice,
      formula: formatModifier(atk.abilityMod),
      flavor: `${game.i18n.format("DND_CUSTOM.Roll.WeaponDamage", { weapon: item.name })}${damageType ? ` (${damageType})` : ""}`,
      critical
    });
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
    if (!(await this.#consumeReaction(item))) return;

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
    if (item.system.level > 0 && !castsAsFreeRitual && !castsAsFreeSubclassSpell) {
      const slots = this.actor.system.spells.slots;
      // Détermine quel palier dépenser (le sien si disponible, sinon propose un surclassement
      // vers un palier supérieur disponible, cf. spell-slot-choice.js) : renvoie null si aucun
      // palier utilisable (épuisé ou dialogue annulé par le joueur).
      const chosenLevel = await chooseSpellSlotLevel(item.name, item.system.level, slots);
      if (chosenLevel === null) {
        ui.notifications.warn(game.i18n.localize("DND_CUSTOM.Spells.NoSlotAvailable"));
        return;
      }
      await this.actor.update({ [`system.spells.slots.${chosenLevel}.value`]: slots[chosenLevel].value - 1 });

      // Voie de la Magie sauvage (Ensorceleur, cf. world-items/subclasses.json > "wildSorcery") :
      // Surtenance sauvage tirée à chaque emplacement de sort réellement dépensé — même
      // primitive (P1) que la Voie de la Magie sauvage du Barbare, table de tirage distincte
      // (rollWildSurge indexe par classe, pas par sous-classe : "wildMagic"/Barbare et
      // "wildSorcery"/Ensorceleur ne se confondent jamais).
      if (this.actor.system.subclass === "wildSorcery") await rollWildSurge(this.actor, "sorcerer");
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
        formula: formatModifier(attackBonus),
        flavor: game.i18n.format("DND_CUSTOM.Roll.SpellAttack", { spell: item.name }),
        advantage: event.shiftKey || cond.advantage,
        disadvantage: event.ctrlKey || cond.disadvantage,
        compareToTargetAc: true,
        criticalRules: true,
        forceCriticalHit: hasAssassinAutoCritical(this.actor)
      });
      if (isCriticalHit) await item.setFlag(SYSTEM_ID, "pendingCritical", true);
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
      await rollHeal({
        actor: this.actor,
        dice: item.system.heal.dice,
        formula: formatModifier(spellAbilityMod),
        flavor: game.i18n.format("DND_CUSTOM.Roll.SpellHeal", { spell: item.name })
      });
      return;
    }

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      content: game.i18n.format("DND_CUSTOM.Chat.CastSpell", { name: this.actor.name, spell: item.name })
    });
  }

  /** Jet de dégâts d'un sort d'attaque (cf. #onCastSpell) : juste le(s) dé(s) de dégâts
   *  configurés sur le sort, sans modificateur — contrairement à une arme, les dégâts d'un
   *  sort SRD 5e n'ajoutent pas le modificateur de caractéristique d'incantation (sauf mention
   *  explicite du sort, non modélisée ici). */
  static async #onRollSpellDamage(event, target) {
    const item = this.actor.items.get(target.closest("[data-item-id]")?.dataset.itemId);
    if (!item || item.type !== "spell" || !item.system.damage.dice) return;

    const damageType = item.system.damage.type
      ? game.i18n.localize(DND_CUSTOM.damageTypes[item.system.damage.type])
      : "";
    const critical = Boolean(item.getFlag(SYSTEM_ID, "pendingCritical"));
    if (critical) await item.unsetFlag(SYSTEM_ID, "pendingCritical");
    await rollDamage({
      actor: this.actor,
      dice: item.system.damage.dice,
      formula: "",
      critical,
      flavor: `${game.i18n.format("DND_CUSTOM.Roll.SpellDamage", { spell: item.name })}${damageType ? ` (${damageType})` : ""}`
    });
  }

  /** Rompt volontairement la concentration en cours (SRD 5e : possible à tout moment). */
  static async #onDropConcentration() {
    await this.actor.update({ "system.spells.concentratingOn": "" });
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