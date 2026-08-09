import { SKILL_ABILITIES } from "./character-data.js";
import { currencySchema } from "./shared-schema.js";

const { SchemaField, NumberField, StringField, BooleanField, HTMLField } = foundry.data.fields;

/** Champs communs aux armes/armures : objets physiques qui peuvent être équipés dans un
 *  emplacement de la fiche de personnage (cf. onglet "Équipement"). Poids toujours en kg
 *  (cf. ClaudeFiles/ITEMS.md > convention d'unités). */
function physicalItemSchema() {
  return {
    weight: new NumberField({ required: true, min: 0, initial: 0 }),
    quantity: new NumberField({ required: true, integer: true, min: 0, initial: 1 }),
    equipped: new BooleanField({ required: true, initial: false }),
    description: new HTMLField({ required: false, blank: true, initial: "" })
  };
}

/** Sous-schéma "portée" (mètres), partagé par la propriété Portée (armes à distance) et la
 *  propriété Lancer (armes de corps à corps lancées) — même forme dans les deux cas. */
function rangeSchema() {
  return new SchemaField({
    normal: new NumberField({ required: true, integer: true, min: 0, initial: 0 }),
    long: new NumberField({ required: true, integer: true, min: 0, initial: 0 })
  });
}

export class WeaponData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      ...physicalItemSchema(),
      weaponType: new StringField({
        required: true,
        initial: "meleeSimple",
        choices: ["meleeSimple", "meleeMartial", "rangedSimple", "rangedMartial"]
      }),
      price: currencySchema(),
      damage: new SchemaField({
        dice: new StringField({ required: false, blank: true, initial: "" }),
        type: new StringField({
          required: false,
          blank: true,
          initial: "",
          choices: ["bludgeoning", "piercing", "slashing"]
        })
      }),
      // Dégâts à deux mains si la propriété Polyvalente (properties.versatile) est active ;
      // n'a de sens/n'est affiché dans la fiche que dans ce cas (cf. ITEMS.md).
      damageVersatile: new SchemaField({
        dice: new StringField({ required: false, blank: true, initial: "" })
      }),
      slot: new StringField({
        required: true,
        initial: "mainHand",
        choices: ["mainHand", "offHand"]
      }),
      properties: new SchemaField({
        handedness: new StringField({
          required: true,
          initial: "oneHanded",
          choices: ["oneHanded", "twoHanded"]
        }),
        versatile: new BooleanField({ required: true, initial: false }),
        finesse: new BooleanField({ required: true, initial: false }),
        light: new BooleanField({ required: true, initial: false }),
        thrown: new BooleanField({ required: true, initial: false }),
        heavy: new BooleanField({ required: true, initial: false }),
        reach: new BooleanField({ required: true, initial: false }),
        reload: new BooleanField({ required: true, initial: false }),
        reloadValue: new NumberField({ required: true, integer: true, min: 0, initial: 0 }),
        // Utilisé à la fois pour Portée (armes à distance) et Lancer (armes de corps à
        // corps lancées) : même sous-schéma, activé selon weaponType / properties.thrown.
        range: rangeSchema(),
        special: new StringField({ required: false, blank: true, initial: "" })
      })
    };
  }
}

export class ArmorData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      ...physicalItemSchema(),
      armorType: new StringField({
        required: true,
        initial: "light",
        choices: ["light", "medium", "heavy"]
      }),
      price: currencySchema(),
      baseAC: new NumberField({ required: true, integer: true, min: 0, initial: 10 }),
      strengthRequired: new NumberField({ required: true, integer: true, min: 0, initial: 0 }),
      stealthDisadvantage: new BooleanField({ required: true, initial: false }),
      slot: new StringField({
        required: true,
        initial: "armor",
        choices: ["armor", "offHand", "accessory"]
      })
    };
  }
}

/** Objet générique (composant, objet de quête, etc.) : pas d'emplacement d'équipement,
 *  juste une quantité et un poids/prix unitaires (cf. ITEMS.md > Item Objet). */
export class GearData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      weight: new NumberField({ required: true, min: 0, initial: 0 }),
      quantity: new NumberField({ required: true, integer: true, min: 0, initial: 1 }),
      price: currencySchema(),
      description: new HTMLField({ required: false, blank: true, initial: "" })
    };
  }
}

/** Capacité (de classe, d'Origine, de don...) : peut nécessiter un jet de dé (SRD 5e). */
export class FeatureData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      class: new StringField({ required: false, blank: true, initial: "" }),
      level: new NumberField({ required: true, integer: true, min: 1, initial: 1 }),
      description: new HTMLField({ required: false, blank: true, initial: "" }),
      requiresRoll: new BooleanField({ required: true, initial: false }),
      rollFormula: new StringField({ required: false, blank: true, initial: "" }),
      source: new StringField({ required: false, blank: true, initial: "" })
    };
  }
}

/** Outil utilisable (ex. Outils de voleur) : objet qui accorde un bonus à une compétence
 *  lorsqu'il est utilisé. Application automatique du bonus sur la fiche non encore câblée
 *  (cf. ITEMS.md) — pour l'instant, donnée informative/manuelle. */
export class ToolData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      price: currencySchema(),
      weight: new NumberField({ required: true, min: 0, initial: 0 }),
      useEffect: new SchemaField({
        skill: new StringField({
          required: false,
          blank: true,
          initial: "",
          choices: Object.keys(SKILL_ABILITIES)
        }),
        bonus: new NumberField({ required: true, integer: true, initial: 0 })
      }),
      descriptionRP: new HTMLField({ required: false, blank: true, initial: "" })
    };
  }
}
