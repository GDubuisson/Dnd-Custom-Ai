import { DND_CUSTOM } from "../helpers/config.js";
import { ABILITY_KEYS, SKILL_ABILITIES } from "../data/character-data.js";
import { isOffHandEligible } from "../helpers/rules.js";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ItemSheetV2 } = foundry.applications.sheets;

const SYSTEM_ID = "dnd-custom-ai";

/** Base commune aux 8 fiches d'Item du système : un template Handlebars dédié par type
 *  (cf. ClaudeFiles/ITEMS.md), contexte partagé (item/system/config) préparé ici. */
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
    return context;
  }
}

const WEAPON_SLOT_OPTIONS = {
  mainHand: "DND_CUSTOM.Equipment.MainHand",
  offHand: "DND_CUSTOM.Equipment.OffHand"
};

const ARMOR_SLOT_OPTIONS = {
  armor: "DND_CUSTOM.Equipment.Armor",
  offHand: "DND_CUSTOM.Equipment.OffHand",
  accessory: "DND_CUSTOM.Equipment.Accessories"
};

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
    // Main secondaire retirée du choix pour une arme non-Légère (cf. isOffHandEligible dans
    // rules.js, SRD 5e combat à deux armes) : évite de configurer un emplacement que le hook
    // d'équipement (dnd-custom-ai.js) refuserait de toute façon au moment d'équiper.
    context.slotOptions = isOffHandEligible(context.system)
      ? WEAPON_SLOT_OPTIONS
      : { mainHand: WEAPON_SLOT_OPTIONS.mainHand };
    // Une arme à deux mains occupe toujours Main principale + Main secondaire (cf.
    // equipmentSlots dans rules.js) : le champ Emplacement n'a alors pas de sens.
    context.showSlotSelect = properties.handedness !== "twoHanded";
    context.offHandRequiresLightNote = context.showSlotSelect && !isOffHandEligible(context.system);
    context.isRanged = ["rangedSimple", "rangedMartial"].includes(context.system.weaponType);
    context.showRange = context.isRanged || properties.thrown;
    context.showReloadValue = properties.reload;
    return context;
  }
}

export class ArmorItemSheet extends DndCustomItemSheet {
  static PARTS = {
    form: { template: `systems/${SYSTEM_ID}/templates/item/armor-sheet.hbs` }
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.slotOptions = ARMOR_SLOT_OPTIONS;
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
    // Référence texte libre vers un Item "class" du monde (cf. ClaudeFiles/ITEMS.md) :
    // liste dynamique, pas une "choices" figée du DataModel.
    context.classOptions = game.items
      .filter((item) => item.type === "class")
      .map((item) => item.name)
      .sort((a, b) => a.localeCompare(b, game.i18n.lang));
    context.rechargeOptions = FEATURE_RECHARGE_OPTIONS;
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
    return context;
  }
}

export class ClassItemSheet extends DndCustomItemSheet {
  static PARTS = {
    form: { template: `systems/${SYSTEM_ID}/templates/item/class-sheet.hbs` }
  };
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
}

export class LanguageItemSheet extends DndCustomItemSheet {
  static PARTS = {
    form: { template: `systems/${SYSTEM_ID}/templates/item/language-sheet.hbs` }
  };
}
