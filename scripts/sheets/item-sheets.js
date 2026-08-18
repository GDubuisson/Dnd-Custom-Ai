import { DND_CUSTOM } from "../helpers/config.js";
import { ABILITY_KEYS, SKILL_ABILITIES } from "../data/character-data.js";
import { isOffHandEligible } from "../helpers/rules.js";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ItemSheetV2 } = foundry.applications.sheets;

const SYSTEM_ID = "dnd-custom-ai";

/** Base commune aux 8 fiches d'Item du système : un template Handlebars dédié par type
 *  (cf. ClaudeFiles/CONCEPTION_FONCTIONNELLE.md), contexte partagé (item/system/config) préparé ici. */
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
      ? DND_CUSTOM.weaponSlotOptions
      : { mainHand: DND_CUSTOM.weaponSlotOptions.mainHand };
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
    context.slotOptions = DND_CUSTOM.armorSlotOptions;
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
    // system.class/system.subclass stockent désormais une clé stable (ex. "fighter"/"champion"),
    // jamais un libellé localisé/traduit (cf. FeatureData#class, item-data.js) — l'ancien champ
    // texte libre + datalist branché sur les noms d'Items "class"/"subclass" du monde a été
    // retiré (retour de test : cassait la comparaison de grantClassContent dès que le monde
    // n'était pas en français, cf. tests/README.md > "Bug connu"). Le select Classe rend
    // directement depuis `config.classes` (helper Handlebars natif `selectOptions`, même
    // convention que weapon-sheet.hbs > weaponType/slot) ; le select Sous-classe a besoin d'être
    // précalculé ici plutôt qu'un `{{lookup config.subclasses system.class}}` dans le template —
    // `DND_CUSTOM.subclasses[""]` (Capacité sans classe encore choisie) vaut `undefined`, que le
    // VRAI `selectOptions` de Foundry (contrairement à sa réimplémentation dans les tests DOM)
    // ne tolère pas ("Cannot convert undefined or null to object", retour de test réel).
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
    // Retour de test : la liste complète (une case par compétence, ~18 lignes) prenait trop de
    // place affichée en permanence — repliée par défaut dans une liste déroulante (cf.
    // origin-sheet.hbs), dont le résumé montre uniquement les compétences déjà cochées.
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
    // system.classKey/subclassKey (cf. ClassData, class-data.js) identifient l'Item pour
    // #onOpenClassSheet/#onOpenSubclassSheet (actor-sheet.js), indépendamment de la langue
    // active du monde — jamais déduits du nom de l'Item (cf. tests/README.md > "Bug connu").
    // Partagé entre les types "class" et "subclass" (une sous-classe porte aussi la clé de sa
    // classe parente, cf. commentaire de classe de ClassData) ; le select Classe rend
    // directement depuis `config.classes` (`selectOptions`), le select Sous-classe a besoin
    // d'être précalculé (comme FeatureItemSheet ci-dessus) : `DND_CUSTOM.subclasses[""]` vaut
    // `undefined`, que le VRAI `selectOptions` de Foundry ne tolère pas ("Cannot convert
    // undefined or null to object", retour de test réel).
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
    // Cases à cocher sur les classes lanceuses de sorts (DND_CUSTOM.spellcastingClasses) : un
    // sort ne concerne jamais une classe non lanceuse, pas besoin de proposer les 12 classes.
    // system.classes stocke un ensemble de clés stables, jamais des libellés localisés/traduits
    // (cf. SpellData#classes, item-data.js — l'ancien champ texte libre séparé par virgules a
    // été retiré, cf. tests/README.md > "Bug connu").
    context.classOptions = DND_CUSTOM.spellcastingClasses.map((key) => ({
      key,
      label: game.i18n.localize(DND_CUSTOM.classes[key]),
      checked: context.system.classes.has(key)
    }));
    context.isReaction = context.system.activation === "reaction";
    return context;
  }
}

export class LanguageItemSheet extends DndCustomItemSheet {
  static PARTS = {
    form: { template: `systems/${SYSTEM_ID}/templates/item/language-sheet.hbs` }
  };
}
