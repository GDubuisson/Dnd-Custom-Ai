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
  formatAttackLabels,
  hitPointsPercent,
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
  parenthesized,
} from "../helpers/rules.js";
import { SKILL_ABILITIES } from "../data/character-data.js";
import { InventoryDragDropMixin } from "./inventory-drag-drop.js";
import { WildShapeSheetMixin } from "./wild-shape-mixin.js";
import { FeatureActionsSheetMixin } from "./feature-actions-mixin.js";
import { RestAndLevelingSheetMixin } from "./rest-and-leveling-mixin.js";
import { SpellcastingSheetMixin } from "./spellcasting-mixin.js";
import { rollCheck, rollDamage, sheetRollFlags } from "../helpers/rolls.js";
import { CharacterCreationWizard, openWizardActorIds } from "./character-creation-wizard.js";
import { declareDeath } from "../helpers/death.js";
import { noteActionEconomyUsage } from "../helpers/action-economy.js";
import { conditionsContext } from "../helpers/sheet-conditions.js";
import { damageAffinityGroups, damageAffinitySummary } from "../helpers/damage-affinity.js";
import { itemFromTarget } from "../helpers/sheet-items.js";
import { attackRollOptions, conditionRollEffects } from "../helpers/roll-modifiers.js";
import { setTokensLight, applyTokensLight } from "../helpers/token-light.js";
import { recordAttackOnTargets } from "../helpers/hunters-defense.js";

const { HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

const SYSTEM_ID = "dnd-custom-ai";

/** Ennemi juré : vrai si une cible ciblée est du type de créature favori de `actor`. */
function hasFavoredEnemyAdvantage(actor) {
  const favoredType = actor.system.combat?.favoredEnemyType;
  if (!favoredType) return false;
  return [...game.user.targets].some((token) => token.actor?.system?.creatureType === favoredType);
}

/** Libellé localisé d'un type de dégâts, vide sans type. */
function damageTypeLabel(type) {
  return type ? game.i18n.localize(DND_CUSTOM.damageTypes[type]) : "";
}

/** Vrai si l'arme équipée en main principale n'a aucune autre arme ou armure en main secondaire. */
function isWieldedTwoHanded(actor, item) {
  if (!item.system.equipped || !equipmentSlots(item.type, item.system).includes("mainHand")) return false;
  return !actor.items.contents.some(
    (other) =>
      other.id !== item.id &&
      ["weapon", "armor"].includes(other.type) &&
      other.system.equipped &&
      equipmentSlots(other.type, other.system).includes("offHand")
  );
}

/**
 * Libellés d'attaque et de dégâts d'une arme ; une Polyvalente tenue à deux mains (main secondaire libre)
 * affiche ses dégâts à deux mains et rappelle l'autre mode.
 */
function weaponStats(weapon, system, proficiencyBonus, { mainHand, offHand }) {
  const proficient = isProficientWithWeapon(system.class, weapon.system.weaponType);
  const atk = weaponAttackDamage(weapon.system, system.abilities, proficiencyBonus, proficient);
  const damageType = damageTypeLabel(weapon.system.damage.type);
  const damageLabel = (dice) => (dice ? `${dice}${formatModifier(atk.damageMod)} ${damageType}`.trim() : "");
  const oneHandedLabel = damageLabel(weapon.system.damage.dice);
  const twoHandedLabel = damageLabel(weapon.system.damageVersatile.dice);
  const isVersatile = Boolean(weapon.system.properties.versatile && weapon.system.damageVersatile.dice);
  const isTwoHandedActive = isVersatile && mainHand?.id === weapon.id && (!offHand || offHand.id === weapon.id);

  let versatileLabel = "";
  if (isTwoHandedActive) {
    versatileLabel = `${oneHandedLabel} (${game.i18n.localize("DND_CUSTOM.Equipment.OneHandedShort")})`;
  } else if (isVersatile) {
    versatileLabel = `${twoHandedLabel} (${game.i18n.localize("DND_CUSTOM.Equipment.TwoHandedShort")})`;
  }
  return {
    attackLabel: formatModifier(atk.attackBonus),
    damageLabel: isTwoHandedActive ? twoHandedLabel : oneHandedLabel,
    versatileLabel,
    isTwoHandedActive,
    proficient
  };
}

/** Fiche de personnage joueur (une PART par onglet), avec transfert d'objets par glisser-déposer. */
export class DndCustomActorSheet extends SpellcastingSheetMixin(
  FeatureActionsSheetMixin(
    RestAndLevelingSheetMixin(
      WildShapeSheetMixin(InventoryDragDropMixin(HandlebarsApplicationMixin(ActorSheetV2)))
    )
  )
) {
  static DEFAULT_OPTIONS = {
    classes: [SYSTEM_ID, "sheet", "actor", "character"],
    tag: "form",
    // Taille d'ouverture où chaque onglet tient en entier ; redimensionnable.
    position: { width: 708, height: 768 },
    window: { resizable: true },
    form: { submitOnChange: true, closeOnSubmit: false },
    actions: {
      useItem: DndCustomActorSheet.#onUseItem,
      rollAbility: DndCustomActorSheet.#onRollAbility,
      rollSave: DndCustomActorSheet.#onRollSave,
      rollSkill: DndCustomActorSheet.#onRollSkill,
      rollWeaponAttack: DndCustomActorSheet.#onRollWeaponAttack,
      rollWeaponDamage: DndCustomActorSheet.#onRollWeaponDamage,
      toggleConditionSelection: DndCustomActorSheet.#onToggleConditionSelection,
      exhaustionIncrease: DndCustomActorSheet.#onExhaustionIncrease,
      exhaustionDecrease: DndCustomActorSheet.#onExhaustionDecrease,
      openCreationWizard: DndCustomActorSheet.#onOpenCreationWizard,
      openClassSheet: DndCustomActorSheet.#onOpenClassSheet,
      openSubclassSheet: DndCustomActorSheet.#onOpenSubclassSheet,
      openOriginSheet: DndCustomActorSheet.#onOpenOriginSheet,
      openPlayerGuide: DndCustomActorSheet.#onOpenPlayerGuide,
      rollDeathSave: DndCustomActorSheet.#onRollDeathSave,
      selectSpellLevel: DndCustomActorSheet.#onSelectSpellLevel
      // Les actions des mixins (Capacités, incantation, Forme sauvage) sont fusionnées par ApplicationV2.
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

  /** Palier de sorts affiché, conservé entre deux rendus. */
  #activeSpellLevel = null;

  /** @override Ne rend pas la fiche tant que l'assistant de création est ouvert pour cet Actor. */
  render(...args) {
    if (openWizardActorIds.has(this.actor.id)) return Promise.resolve(this);
    return super.render(...args);
  }

  /** @override Rebranche la persistance des états sur la liste déroulante recréée. */
  _onRender(context, options) {
    super._onRender(context, options);
    this.#attachConditionsListeners();
  }

  /** @override Contexte commun à tous les onglets : valeurs du système et valeurs dérivées. */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const system = this.actor.system;

    context.actor = this.actor;
    context.system = system;
    context.config = DND_CUSTOM;
    context.isGM = game.user.isGM;

    // Ordre significatif : certaines étapes lisent le contexte posé par les précédentes.
    this.#prepareClassOriginContext(context, system);
    this.#prepareCombatEconomyContext(context, system);
    this.#prepareProgressionContext(context, system);
    this.#prepareCharacterStatsContext(context, system);
    this.#prepareItemsContext(context, system);
    this.#prepareLanguagesAndSpellsContext(context, system);
    this.#prepareInventoryContext(context, system);
    this.#prepareConditionsContext(context, system);
    this.#prepareCarryingCapacityContext(context, system);

    return context;
  }

  /** Classe, Origine et sous-classe ; pose `context.origins` et `context.isSpellcaster`. */
  #prepareClassOriginContext(context, system) {
    // Origines chargées à l'init.
    context.origins = game.dndCustomAi?.origins ?? {};
    // Classe et Origine en lecture seule, définies par l'assistant de création.
    context.classLabel = system.class ? game.i18n.localize(DND_CUSTOM.classes[system.class]) : "";
    context.originLabel = context.origins[system.origin]?.label ?? "";

    // Sélecteur de sous-classe.
    const subclassChoices = DND_CUSTOM.subclasses[system.class] ?? {};
    context.subclassLevel = DND_CUSTOM.subclassLevel[system.class] ?? null;
    context.subclassAvailable = context.subclassLevel !== null && system.attributes.level >= context.subclassLevel;
    context.subclassOptions = Object.entries(subclassChoices).map(([key, labelKey]) => ({
      key,
      label: game.i18n.localize(labelKey),
      selected: key === system.subclass
    }));
    context.subclassLabel = system.subclass ? game.i18n.localize(subclassChoices[system.subclass]) : "";
    // Indice « Disponible au niveau N » avant le niveau requis.
    context.subclassLevelHint =
      context.subclassLevel && !context.subclassAvailable
        ? game.i18n.format("DND_CUSTOM.Actor.SubclassLevelHint", { level: context.subclassLevel })
        : "";
    // Bouton « Créer un personnage » tant que Classe ou Origine manque.
    context.showCreationWizardButton = !(system.class && system.origin);

    context.isSpellcaster = DND_CUSTOM.spellcastingClasses.includes(system.class);
    // Partial d'en-tête d'ambiance de classe (onglet Capacités/Sorts).
    context.classTabPartial = `systems/${SYSTEM_ID}/templates/actor/abilities/class-flavor.hbs`;
    if (DND_CUSTOM.classes[system.class]) {
      context.classFlavorKey = system.class;
      context.classFlavorIcon = DND_CUSTOM.classFlavorIcon[system.class];
      context.classFlavorTitle = game.i18n.localize(`DND_CUSTOM.Abilities.ClassFlavor.${system.class}.Title`);
      context.classFlavorTagline = game.i18n.localize(`DND_CUSTOM.Abilities.ClassFlavor.${system.class}.Tagline`);
    }

    // Trait spécial de l'Origine, informatif.
    const currentOrigin = context.origins[system.origin] ?? null;
    context.originTrait = currentOrigin?.specialTrait ?? null;
  }

  /** Économie d'action, monture et Forme sauvage. */
  #prepareCombatEconomyContext(context, system) {
    // Disponibilité de la réaction, de l'Action et de l'Action bonus.
    context.reactionAvailable = canUseReaction(system);
    context.actionAvailable = system.combat.actionAvailable;
    context.bonusActionAvailable = system.combat.bonusActionAvailable;

    // Monture chevauchée.
    context.mount = system.combat.mountedActorId ? (game.actors.get(system.combat.mountedActorId) ?? null) : null;

    // Forme sauvage active.
    context.wildShapeForm = system.combat.wildShapeActorId ? (game.actors.get(system.combat.wildShapeActorId) ?? null) : null;

    // Attaques de la Forme sauvage, libellés formatés.
    context.wildShapeAttacks = context.wildShapeForm
      ? context.wildShapeForm.system.attacks.map((attack, index) => {
          const abilityMod = context.wildShapeForm.system.abilities[attack.ability]?.mod ?? 0;
          return { index, name: attack.name, ...formatAttackLabels(attack, abilityMod) };
        })
      : [];
  }

  /** PV, maîtrise, niveau, XP et agonie ; pose `context.proficiencyBonus`. */
  #prepareProgressionContext(context, system) {
    const hp = system.attributes.hp;
    context.hpPercent = hitPointsPercent(hp);

    context.proficiencyBonus = proficiencyBonus(system.attributes.level);
    context.levelUpAvailable = levelForXp(system.xp) > system.attributes.level;
    // Choix Amélioration/Don dus (badge d'en-tête).
    context.pendingAsiChoices = system.attributes.pendingAsiChoices;
    // Seuil XP du niveau suivant (affiché au MJ), absent au niveau 20.
    context.xpNextThreshold = system.attributes.level < 20 ? DND_CUSTOM.xpThresholds[system.attributes.level] : null;
    // Progression XP relative affichée au joueur, sans chiffres.
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

    // Panneau d'agonie à 0 PV, jusqu'à stabilisation ou mort.
    const death = system.attributes.death;
    context.dying = {
      active: hp.value === 0,
      stabilized: death.successes >= 3,
      dead: death.failures >= 3,
      resolved: death.successes >= 3 || death.failures >= 3,
      successPips: [1, 2, 3].map((n) => death.successes >= n),
      failurePips: [1, 2, 3].map((n) => death.failures >= n)
    };
  }

  /** Initiative, perception passive, incantation, caractéristiques et compétences. */
  #prepareCharacterStatsContext(context, system) {
    // Modificateur d'initiative dérivé, identique à celui du jet.
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
    // Avantages de compétences de l'Origine.
    const currentOrigin = context.origins[system.origin] ?? null;
    const originAbilityBonuses = currentOrigin?.abilityBonuses ?? {};
    const originSkillAdvantages = new Set(currentOrigin?.skillAdvantages ?? []);
    // Aptitudes multiples : moitié de la maîtrise aux compétences non maîtrisées.
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
          mod: mod + (system.saves[key].proficient ? context.proficiencyBonus : 0) + system.attributes.saveBonus
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
          // Désavantage de Discrétion dû à l'armure.
          armorDisadvantage: key === "stealth" && system.stealthDisadvantage,
          // Abréviation localisée de la caractéristique.
          ability: game.i18n.localize(DND_CUSTOM.abilitiesShort[skill.ability]),
          proficient: skill.proficient,
          jackOfAllTrades: jackOfAllTrades && !skill.proficient,
          mod,
          modLabel: formatModifier(mod)
        };
      })
      .sort((a, b) => a.label.localeCompare(b.label, game.i18n.lang));
  }

  /** Items possédés, réserves et choix de Capacités, compagnon ; pose `context.weapons` et `context.armors`. */
  #prepareItemsContext(context, system) {
    const items = this.actor.items.contents;
    context.weapons = items.filter((item) => item.type === "weapon");
    context.armors = items.filter((item) => item.type === "armor");
    context.gear = items.filter((item) => item.type === "gear");
    context.features = items.filter((item) => item.type === "feature");
    // États actifs, pour désactiver les Capacités dont l'état requis manque.
    context.activeStatuses = this.actor.statuses;
    // Déclencheur d'Attaque d'opportunité étendu par Sentinelle.
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
    // État de la réserve de chaque technique `costsResource`, par id.
    context.featureResourceState = {};
    for (const feature of context.features) {
      const resourceName = feature.system.costsResource;
      // Les techniques à sauvegarde ont leur propre bouton.
      if (!resourceName || feature.system.savingThrow) continue;
      const resource = context.features.find((candidate) => candidate.name === resourceName);
      if (!resource) continue;
      context.featureResourceState[feature.id] = {
        resourceName,
        // Nom repris pour le bloc `{{#with}}` du template.
        techniqueName: feature.name,
        remaining: resource.system.uses.value,
        max: resource.system.uses.max
      };
    }
    // Choix définitif déjà fait, par id de Capacité.
    context.featureChoiceMade = {};
    for (const feature of context.features) {
      const fieldKey = feature.system.grantsChoice;
      if (fieldKey) context.featureChoiceMade[feature.id] = !!system.combat[fieldKey];
    }

    // Compagnon déjà invoqué.
    context.companionAlreadySummoned = !!this.actor.getFlag(SYSTEM_ID, "beastCompanionCreated");
  }

  /** Langues connues, Sorts par niveau et emplacements de sorts. */
  #prepareLanguagesAndSpellsContext(context, system) {
    const items = this.actor.items.contents;
    // Langues dans l'ordre d'ajout, Commune en tête.
    context.languages = items
      .filter((item) => item.type === "language")
      .sort((a, b) => Number(b.system.category === "common") - Number(a.system.category === "common"));
    // Sorts groupés par niveau (0 = tours de magie).
    const spells = items.filter((item) => item.type === "spell");
    context.spellsByLevel = Array.from({ length: 10 }, (_, level) => ({
      level,
      label:
        level === 0
          ? game.i18n.localize("DND_CUSTOM.Abilities.Cantrips")
          : game.i18n.format("DND_CUSTOM.Abilities.SpellLevelLabel", { level }),
      // Libellé court d'onglet : « Tours » / « Niv. X ».
      shortLabel:
        level === 0
          ? game.i18n.localize("DND_CUSTOM.Abilities.CantripsShort")
          : game.i18n.format("DND_CUSTOM.Abilities.SpellSlotLevelShort", { level }),
      spells: spells
        .filter((spell) => spell.system.level === level)
        .sort((a, b) => a.name.localeCompare(b.name, game.i18n.lang))
        // Bouton de dégâts pour un sort d'attaque, à sauvegarde ou doté de dés.
        .map((spell) => ({
          item: spell,
          showDamageButton: spell.system.attack || Boolean(spell.system.save.ability) || Boolean(spell.system.damage.dice)
        }))
    })).filter((group) => group.spells.length);
    // Palier affiché : celui mémorisé s'il a encore des Sorts, sinon le premier.
    if (!context.spellsByLevel.some((group) => group.level === this.#activeSpellLevel)) {
      this.#activeSpellLevel = context.spellsByLevel[0]?.level ?? null;
    }
    context.activeSpellLevel = this.#activeSpellLevel;
    context.spellsByLevel = context.spellsByLevel.map((group) => ({
      ...group,
      active: group.level === this.#activeSpellLevel
    }));
    // Colonne Sorts aussi pour une classe non lanceuse possédant des Sorts.
    context.hasAnySpells = context.isSpellcaster || spells.length > 0;
    // Emplacements par palier accessible ; badge de Magie de Pacte.
    context.spellSlots = SPELL_LEVELS.map((level) => ({
      level,
      value: system.spells.slots[level].value,
      max: system.spells.slots[level].max
    })).filter((slot) => slot.max > 0);
    context.isPactMagic = Boolean(system.spells.isPactMagic);
    context.concentratingOn = system.spells.concentratingOn;
  }

  /** Emplacements d'équipement, statistiques d'armes et bonus de CA des armures. */
  #prepareInventoryContext(context, system) {
    const items = this.actor.items.contents;
    // Inventaire scindé : Armes/Armures et Objets/Outils.
    context.weaponsAndArmor = items.filter((item) => ["weapon", "armor"].includes(item.type));
    context.gearAndTools = items.filter((item) => ["gear", "tool"].includes(item.type));
    context.inventoryItems = items.filter((item) =>
      ["weapon", "armor", "gear", "tool"].includes(item.type)
    );

    // Armes et armures équipées réparties dans leurs emplacements.
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
      // Arme à deux mains : la main secondaire affiche une mention.
      offHandOccupiedByMainHand: Boolean(mainHand && offHand && mainHand.id === offHand.id),
      armor: findBySlot("armor"),
      accessories: equippedWeaponsAndArmor.filter((item) =>
        equipmentSlots(item.type, item.system).includes("accessory")
      )
    };

    // Bonus d'attaque et dégâts de chaque arme (maîtrise selon la classe).
    context.weaponStats = Object.fromEntries(
      context.weapons.map((weapon) => [weapon.id, weaponStats(weapon, system, context.proficiencyBonus, { mainHand, offHand })])
    );

    // Bonus de CA de chaque armure, bouclier ou accessoire.
    const dexMod = abilityModifier(system.abilities.dex.total);
    context.armorStats = {};
    for (const armor of context.armors) {
      const contribution = armorContribution(armor.system, dexMod);
      // Armure : CA totale ; bouclier/accessoire : bonus signé.
      context.armorStats[armor.id] = {
        acLabel: armor.system.slot === "armor" ? `${contribution}` : formatModifier(contribution),
        typeLabel: DND_CUSTOM.armorTypes[armor.system.armorType]
      };
    }
  }

  /** États actifs et affinités aux dégâts. */
  #prepareConditionsContext(context, system) {
    // États, et résumé des états actifs de l'en-tête.
    Object.assign(context, conditionsContext(this.actor));

    // Cases d'affinités aux dégâts (sous `system.combat`), réglées par le MJ.
    context.damageAffinityGroups = damageAffinityGroups(system.combat);
    // Résumé des affinités affiché aux non-MJ.
    context.damageAffinitySummary = damageAffinitySummary(context.damageAffinityGroups);
  }

  /** Poids porté, capacité de charge et richesse ; requiert `context.inventoryItems`. */
  #prepareCarryingCapacityContext(context, system) {
    context.carriedWeight = carriedWeight(context.inventoryItems);
    context.carryingCapacity =
      carryingCapacity(system.abilities.str.total, "kg") + carryingCapacityBonus(context.inventoryItems);
    context.carryingCapacityPercent = Math.min(
      100,
      Math.round((context.carriedWeight / (context.carryingCapacity || 1)) * 100)
    );
    context.overCapacity = context.carriedWeight > context.carryingCapacity;
    context.currencyTotalCopper = currencyTotalInCopper(system.currency);
  }

  /** Ouvre l'assistant de création et ferme la fiche, rouverte à la fin. */
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

  /** Ouvre le Journal « Guide du Joueur » (recherché par son nom localisé). */
  static async #onOpenPlayerGuide() {
    const guide = game.journal.getName(game.i18n.localize("DND_CUSTOM.Journal.PlayerGuideTitle"));
    if (!guide) {
      ui.notifications.warn(game.i18n.localize("DND_CUSTOM.Actor.PlayerGuideMissing"));
      return;
    }
    await guide.sheet.render(true);
  }

  /** Ouvre la fiche de référence d'une Classe, Sous-classe ou Origine, depuis le monde puis le compendium. */
  static async #openReferenceItem(packName, predicate, missingKey, displayName) {
    const worldItem = game.items.find(predicate);
    if (worldItem) {
      await worldItem.sheet.render(true);
      return;
    }

    const pack = game.packs.get(`${SYSTEM_ID}.${packName}`);
    const document = pack ? (await pack.getDocuments()).find(predicate) : null;
    if (document) {
      await document.sheet.render(true);
      return;
    }

    ui.notifications.warn(game.i18n.format(missingKey, { name: displayName }));
  }

  /** Sauvegarde contre la mort : 20 naturel = 1 PV, 1 naturel = deux échecs, 10+ (bonus inclus) = réussite. */
  static async #onRollDeathSave() {
    const actor = this.actor;
    const bonus = actor.system.attributes.saveBonus;
    const roll = new Roll(bonus ? `1d20${formatModifier(bonus)}` : "1d20");
    await roll.evaluate();
    const natural = roll.dice[0].total;
    const total = roll.total;
    const death = actor.system.attributes.death;

    if (natural === 20) {
      await actor.update({ "system.attributes.hp.value": 1 });
    } else if (natural === 1) {
      const failures = Math.min(3, death.failures + 2);
      await actor.update({ "system.attributes.death.failures": failures });
      if (failures >= 3) await declareDeath(actor);
    } else if (total >= 10) {
      const successes = Math.min(3, death.successes + 1);
      const updates = { "system.attributes.death.successes": successes };
      // Troisième réussite : stabilisé à 1 PV.
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
      flags: sheetRollFlags({ savingThrowRoll: true })
    });
  }

  /** Jet de caractéristique. Maj-clic = avantage, Ctrl-clic = désavantage. */
  static async #onRollAbility(event, target) {
    const key = target.dataset.key;
    const mod = abilityModifier(this.actor.system.abilities[key].total);
    const cond = conditionRollEffects(this.actor, "check", key);
    // Ennemi juré : avantage aux tests d'Intelligence.
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

  /** Jet de sauvegarde (critiques en combat). */
  static async #onRollSave(event, target) {
    const key = target.dataset.key;
    const system = this.actor.system;
    const mod = abilityModifier(system.abilities[key].total);
    const profBonus = system.saves[key].proficient ? proficiencyBonus(system.attributes.level) : 0;
    const cond = conditionRollEffects(this.actor, "save", key);
    // Combat monté : rappel que la monture réussit aussi une sauvegarde de Dex réussie.
    const mount = system.combat.mountedActorId ? game.actors.get(system.combat.mountedActorId) : null;
    const mountNote = key === "dex" && mount && hasFeature(this.actor.items.contents, "Combat monté")
      ? ` (${game.i18n.format("DND_CUSTOM.Roll.MountedDexSaveNote", { mount: mount.name })})`
      : "";
    await rollCheck({
      actor: this.actor,
      formula: formatModifier(mod + profBonus + system.attributes.saveBonus) + cond.bonus,
      flavor: game.i18n.format("DND_CUSTOM.Roll.SavingThrow", {
        ability: game.i18n.localize(DND_CUSTOM.abilities[key])
      }) + mountNote,
      advantage: event.shiftKey || cond.advantage,
      disadvantage: event.ctrlKey || cond.disadvantage,
      criticalRules: true,
      savingThrow: true
    });
  }

  /** Jet de compétence avec avantage d'Origine, désavantage d'armure et bonus de trait d'Origine proposé. */
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
    // Infiltration (Assassin) : avantage en Discrétion.
    const assassinStealthAdvantage = key === "stealth" && hasFeature(this.actor.items.contents, "Infiltration");
    // Ennemi juré : avantage en Survie.
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

  /** Jet d'attaque d'une arme ; un critique est mémorisé sur l'arme pour ses dégâts. */
  static async #onRollWeaponAttack(event, target) {
    const item = itemFromTarget(this.actor, target);
    if (item?.type !== "weapon") return;
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
      ...attackRollOptions(this.actor, event, cond)
    });
    if (isCriticalHit) await item.setFlag(SYSTEM_ID, "pendingCritical", true);
    await noteActionEconomyUsage(this.actor, "action", { isWeaponAttack: true });
    await recordAttackOnTargets(this.actor);
  }

  /** Jet de dégâts d'une arme ; Polyvalente : dé selon l'équipement, Maj-clic pour l'autre. */
  static async #onRollWeaponDamage(event, target) {
    const item = itemFromTarget(this.actor, target);
    if (item?.type !== "weapon") return;

    const isVersatile = item.system.properties.versatile && Boolean(item.system.damageVersatile.dice);
    const isTwoHandedActive = isVersatile && isWieldedTwoHanded(this.actor, item);
    const forceAlternate = event.shiftKey || target.dataset.versatile === "true";
    const useVersatileDice = isVersatile && (forceAlternate ? !isTwoHandedActive : isTwoHandedActive);
    const dice = useVersatileDice ? item.system.damageVersatile.dice : item.system.damage.dice;
    if (!dice) return;

    const atk = weaponAttackDamage(
      item.system,
      this.actor.system.abilities,
      proficiencyBonus(this.actor.system.attributes.level)
    );
    // Consomme le critique mémorisé sur l'arme.
    const critical = Boolean(item.getFlag(SYSTEM_ID, "pendingCritical"));
    if (critical) await item.unsetFlag(SYSTEM_ID, "pendingCritical");
    // Critique brutal : dé supplémentaire en mêlée.
    const isMelee = item.system.weaponType?.startsWith("melee");
    const criticalMultiplier =
      critical && isMelee && hasFeature(this.actor.items.contents, "Critique brutal") ? 3 : 2;
    // Rage : +2 aux dégâts d'une attaque de mêlée utilisant la Force.
    const strMod = abilityModifier(this.actor.system.abilities.str.total);
    const rageDamageBonus = this.actor.statuses.has("raging") && isMelee && atk.abilityMod === strMod ? "+2" : "";
    await rollDamage({
      actor: this.actor,
      dice,
      formula: formatModifier(atk.damageMod) + rageDamageBonus,
      flavor: `${game.i18n.format("DND_CUSTOM.Roll.WeaponDamage", { weapon: item.name })}${parenthesized(damageTypeLabel(item.system.damage.type))}`,
      critical,
      criticalMultiplier,
      damageType: item.system.damage.type,
      isMagicalSource: item.system.magic
    });

    // Dégâts secondaires : message distinct, sans modificateur, critique appliqué.
    if (item.system.secondaryDamage.dice) {
      await rollDamage({
        actor: this.actor,
        dice: item.system.secondaryDamage.dice,
        formula: "",
        flavor: `${game.i18n.format("DND_CUSTOM.Roll.WeaponDamage", { weapon: item.name })}${parenthesized(damageTypeLabel(item.system.secondaryDamage.type))}`,
        critical,
        criticalMultiplier,
        damageType: item.system.secondaryDamage.type,
        isMagicalSource: item.system.magic
      });
    }
  }

  /** Affiche l'onglet de palier de sorts cliqué et le mémorise, sans rendu. */
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

  /** Bouton « Utiliser » : lumière ou soin d'un objet, test d'un outil. */
  static async #onUseItem(event, target) {
    const item = itemFromTarget(this.actor, target);
    if (!item) return;

    if (item.type === "tool") return DndCustomActorSheet.#onUseTool(event, this.actor, item);

    const use = item.system.use;
    if (!use || use.type === "none") return;

    if (use.type === "light") return DndCustomActorSheet.#toggleLight(this.actor, item);
    if (use.type === "heal") return DndCustomActorSheet.#applyHeal(this.actor, item);
  }

  /** Test de compétence avec un outil (maîtrise toujours appliquée) ; consomme une unité. */
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
      // Éteint les autres sources de lumière de l'Actor.
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
      await setTokensLight(actor, item.name, item.system.use.light);
    } else {
      const applied = await applyTokensLight(actor, { bright: 0, dim: 0 });
      if (applied) {
        await ChatMessage.create({
          speaker: ChatMessage.getSpeaker({ actor }),
          content: game.i18n.format("DND_CUSTOM.Chat.UseLightOff", { name: actor.name, item: item.name })
        });
      }
    }
  }

  /** Soin d'un objet sur son porteur : healDice + healBase + bonus de compétence ; consomme une unité si consommable. */
  static async #applyHeal(actor, item) {
    const use = item.system.use;
    if (use.consumable && item.system.quantity <= 0) {
      ui.notifications.warn(game.i18n.format("DND_CUSTOM.Chat.NoChargesLeft", { feature: item.name }));
      return;
    }

    const bonus = use.healSkill
      ? skillModifier(actor.system, use.healSkill, proficiencyBonus(actor.system.attributes.level))
      : 0;
    let amount = Math.max(0, use.healBase + bonus);
    let roll = null;
    if (use.healDice) {
      roll = await new Roll(`${use.healDice}${formatModifier(use.healBase + bonus)}`).evaluate();
      amount = Math.max(0, roll.total);
    }

    const hp = actor.system.attributes.hp;
    await actor.update({ "system.attributes.hp.value": Math.min(hp.value + amount, hp.max) });
    if (use.consumable) await item.update({ "system.quantity": item.system.quantity - 1 });

    const text = game.i18n.format("DND_CUSTOM.Chat.UseHeal", { name: actor.name, item: item.name, amount });
    const speaker = ChatMessage.getSpeaker({ actor });
    if (roll) await roll.toMessage({ speaker, flavor: text, flags: sheetRollFlags() });
    else await ChatMessage.create({ speaker, content: text });
  }

  /** Coche ou décoche visuellement un état, appliqué à la fermeture de la liste. */
  static #onToggleConditionSelection(event, target) {
    const nowActive = target.classList.toggle("active");
    const icon = target.querySelector("i");
    icon.classList.toggle("fa-square", !nowActive);
    icon.classList.toggle("fa-square-check", nowActive);
  }

  /** Applique les états sélectionnés à la fermeture de la liste déroulante. */
  #attachConditionsListeners() {
    const details = this.element.querySelector(".conditions-dropdown");
    if (!details) return;
    details.addEventListener("toggle", () => {
      if (details.open) return;
      void this.#applyPendingConditions(details);
    });
  }

  /** Bascule un à un les états dont la sélection diffère de l'Actor. */
  async #applyPendingConditions(details) {
    const rows = [...details.querySelectorAll(".condition-checkbox-row")];
    const current = this.actor.statuses;
    const changed = rows.filter((row) => row.classList.contains("active") !== current.has(row.dataset.key));
    for (const row of changed) {
      await this.actor.toggleStatusEffect(row.dataset.key); // NOSONAR : séquentiel voulu
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