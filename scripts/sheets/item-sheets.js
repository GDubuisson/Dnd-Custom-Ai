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
    context.isGM = game.user.isGM;
    return context;
  }

  /** @override
   *  position.height "auto" (cf. DEFAULT_OPTIONS) laisse Foundry mesurer la hauteur au contenu
   *  réellement affiché, SANS jamais la plafonner à la fenêtre du navigateur : une fiche avec
   *  beaucoup de champs visibles à la fois (ex. Arme à distance rechargeable : prix, dégâts, 7
   *  propriétés, portée, rechargement...) débordait donc simplement du viewport (retour de test
   *  avec capture d'écran, y compris depuis l'onglet natif "Objets" et un compendium de
   *  Foundry), sans AUCUNE barre de défilement pour atteindre les champs du bas — une première
   *  tentative de correctif (plafonner position.height via setPosition ici même) s'est avérée
   *  sans effet en pratique : Foundry mesure/applique sa propre hauteur "auto" à un moment du
   *  cycle de rendu qu'on ne maîtrise pas assez finement pour être certain de s'exécuter après.
   *  Plutôt que de deviner ce timing, on force directement le style inline (priorité maximale,
   *  gagne face à n'importe quelle CSS externe) sur .window-content, le VRAI conteneur de
   *  défilement de Foundry pour une ApplicationV2 (cf. doc Foundry v11+) — indépendant de la
   *  classe CSS `.dnd-custom-ai.sheet.item` qui, elle, cible le cadre englobant (`.application`,
   *  en-tête de fenêtre compris) et n'a donc jamais pu être le bon endroit pour ce correctif. */
  _onRender(context, options) {
    super._onRender(context, options);
    // Repli sur this.element lui-même si .window-content venait à ne pas exister (nom de
    // classe interne Foundry non garanti à vie) : dégrade proprement plutôt que de ne rien
    // faire silencieusement.
    const content = this.element.querySelector(".window-content") ?? this.element;
    content.style.maxHeight = "85vh";
    content.style.overflowY = "auto";
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
    // Même principe pour la sous-classe : référence texte libre vers un Item "subclass" du
    // monde (system.subclass), pas une "choices" figée du DataModel.
    context.subclassOptions = game.items
      .filter((item) => item.type === "subclass")
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
