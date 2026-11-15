import { DND_CUSTOM } from "../helpers/config.js";
import { ABILITY_KEYS, SKILL_ABILITIES } from "../data/character-data.js";
import { isOffHandEligible } from "../helpers/rules.js";
import { damageAffinityGroups } from "../helpers/damage-affinity.js";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ItemSheetV2 } = foundry.applications.sheets;

const SYSTEM_ID = "dnd-custom-ai";

/** Base des fiches d'Item : template dédié par type et contexte commun (item, system, config). */
class DndCustomItemSheet extends HandlebarsApplicationMixin(ItemSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: [SYSTEM_ID, "sheet", "item"],
    tag: "form",
    position: { width: 480, height: "auto" },
    window: { resizable: true },
    form: { submitOnChange: true, closeOnSubmit: false }
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.item = this.item;
    context.system = this.item.system;
    context.config = DND_CUSTOM;
    context.isGM = game.user.isGM;
    return context;
  }

  /** @override Rend `.window-content` défilable dans la limite de la fenêtre du navigateur. */
  _onRender(context, options) {
    super._onRender(context, options);
    // Repli sur la racine si `.window-content` est absent.
    const content = this.element.querySelector(".window-content") ?? this.element;
    content.style.maxHeight = "85vh";
    content.style.overflowY = "auto";
  }
}

const GEAR_USE_TYPE_OPTIONS = {
  none: "DND_CUSTOM.Item.GearUseTypes.none",
  light: "DND_CUSTOM.Item.GearUseTypes.light",
  heal: "DND_CUSTOM.Item.GearUseTypes.heal"
};

const FEATURE_RECHARGE_OPTIONS = {
  shortRest: "DND_CUSTOM.Item.RechargeTypes.shortRest",
  longRest: "DND_CUSTOM.Item.RechargeTypes.longRest"
};

export class WeaponItemSheet extends DndCustomItemSheet {
  static PARTS = {
    form: { template: `systems/${SYSTEM_ID}/templates/item/weapon-sheet.hbs` }
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const properties = context.system.properties;
    // Main secondaire proposée seulement pour une arme Légère.
    context.slotOptions = isOffHandEligible(context.system)
      ? DND_CUSTOM.weaponSlotOptions
      : { mainHand: DND_CUSTOM.weaponSlotOptions.mainHand };
    // Une arme à deux mains n'a pas d'emplacement à choisir.
    context.showSlotSelect = properties.handedness !== "twoHanded";
    context.offHandRequiresLightNote = context.showSlotSelect && !isOffHandEligible(context.system);
    context.isRanged = ["rangedSimple", "rangedMartial"].includes(context.system.weaponType);
    context.showRange = context.isRanged || properties.thrown;
    context.showReloadValue = properties.reload;
    // Affinités aux dégâts accordées par l'arme équipée (ex. Marque du givre).
    context.damageAffinityGroups = damageAffinityGroups(context.system);
    return context;
  }
}

export class ArmorItemSheet extends DndCustomItemSheet {
  static PARTS = {
    form: { template: `systems/${SYSTEM_ID}/templates/item/armor-sheet.hbs` }
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.slotOptions = DND_CUSTOM.armorSlotOptions;
    // Cases d'affinités aux dégâts propres à l'armure.
    context.damageAffinityGroups = damageAffinityGroups(context.system);
    return context;
  }
}

export class GearItemSheet extends DndCustomItemSheet {
  static PARTS = {
    form: { template: `systems/${SYSTEM_ID}/templates/item/gear-sheet.hbs` }
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.useTypeOptions = GEAR_USE_TYPE_OPTIONS;
    context.showLightFields = context.system.use.type === "light";
    context.showHealFields = context.system.use.type === "heal";
    return context;
  }
}

export class FeatureItemSheet extends DndCustomItemSheet {
  static PARTS = {
    form: { template: `systems/${SYSTEM_ID}/templates/item/feature-sheet.hbs` }
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    // Options de sous-classe précalculées : `selectOptions` refuse `undefined` sans classe choisie.
    context.subclassOptions = DND_CUSTOM.subclasses[context.system.class] ?? {};
    context.rechargeOptions = FEATURE_RECHARGE_OPTIONS;
    context.isReaction = context.system.activation === "reaction";
    return context;
  }
}

export class OriginItemSheet extends DndCustomItemSheet {
  static PARTS = {
    form: { template: `systems/${SYSTEM_ID}/templates/item/origin-sheet.hbs` }
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.abilityBonusFields = ABILITY_KEYS.map((key) => ({
      key,
      label: DND_CUSTOM.abilities[key],
      value: context.system.abilityBonuses[key]
    }));
    context.skillAdvantageOptions = Object.keys(SKILL_ABILITIES).map((key) => ({
      key,
      label: DND_CUSTOM.skills[key],
      checked: context.system.skillAdvantages.has(key)
    }));
    // Compétences cochées, résumées dans la liste repliée.
    context.checkedSkillAdvantages = context.skillAdvantageOptions.filter((option) => option.checked);
    return context;
  }
}

export class ClassItemSheet extends DndCustomItemSheet {
  static PARTS = {
    form: { template: `systems/${SYSTEM_ID}/templates/item/class-sheet.hbs` }
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.savingThrowOptions = ABILITY_KEYS.map((key) => ({
      key,
      label: DND_CUSTOM.abilities[key],
      checked: context.system.savingThrows.has(key)
    }));
    context.weaponProficiencyOptions = Object.keys(DND_CUSTOM.weaponTypes).map((key) => ({
      key,
      label: DND_CUSTOM.weaponTypes[key],
      checked: context.system.weaponProficiencies.has(key)
    }));
    // Options de sous-classe précalculées : `selectOptions` refuse `undefined` sans classe choisie.
    context.isSubclass = context.item.type === "subclass";
    if (context.isSubclass) context.subclassKeyOptions = DND_CUSTOM.subclasses[context.system.classKey] ?? {};
    return context;
  }
}

export class ToolItemSheet extends DndCustomItemSheet {
  static PARTS = {
    form: { template: `systems/${SYSTEM_ID}/templates/item/tool-sheet.hbs` }
  };
}

export class SpellItemSheet extends DndCustomItemSheet {
  static PARTS = {
    form: { template: `systems/${SYSTEM_ID}/templates/item/spell-sheet.hbs` }
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    // Cases des classes lanceuses de sorts (clés stables).
    context.classOptions = DND_CUSTOM.spellcastingClasses.map((key) => ({
      key,
      label: game.i18n.localize(DND_CUSTOM.classes[key]),
      checked: context.system.classes.has(key)
    }));
    context.isReaction = context.system.activation === "reaction";
    // Champs de dégâts pour un sort d'attaque, à sauvegarde, ou déjà doté de dés (touche automatique).
    context.showDamageFields =
      context.system.attack || Boolean(context.system.save.ability) || Boolean(context.system.damage.dice);
    return context;
  }
}

export class LanguageItemSheet extends DndCustomItemSheet {
  static PARTS = {
    form: { template: `systems/${SYSTEM_ID}/templates/item/language-sheet.hbs` }
  };
}
