import { SKILL_ABILITIES } from "./character-data.js";

const { SchemaField, NumberField, StringField, BooleanField, HTMLField } = foundry.data.fields;

/** Champs communs à tout objet physique transportable (arme, armure, objet). */
function physicalItemSchema() {
  return {
    weight: new NumberField({ required: true, min: 0, initial: 0 }),
    quantity: new NumberField({ required: true, integer: true, min: 0, initial: 1 }),
    equipped: new BooleanField({ required: true, initial: false }),
    description: new HTMLField({ required: false, blank: true, initial: "" })
  };
}

export class WeaponData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      ...physicalItemSchema(),
      damage: new StringField({ required: false, blank: true, initial: "" }),
      properties: new StringField({ required: false, blank: true, initial: "" }),
      slot: new StringField({
        required: true,
        initial: "mainHand",
        choices: ["mainHand", "offHand"]
      })
    };
  }
}

export class ArmorData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      ...physicalItemSchema(),
      ac: new NumberField({ required: true, integer: true, min: 0, initial: 10 }),
      category: new StringField({
        required: true,
        initial: "light",
        choices: ["light", "medium", "heavy"]
      }),
      slot: new StringField({
        required: true,
        initial: "armor",
        choices: ["armor", "offHand", "accessory"]
      })
    };
  }
}

export class GearData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      ...physicalItemSchema()
    };
  }
}

export class FeatureData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      description: new HTMLField({ required: false, blank: true, initial: "" }),
      source: new StringField({ required: false, blank: true, initial: "" })
    };
  }
}

/** Outil utilisable (ex. Outils de voleur) : objet physique transportable qui accorde un
 *  bonus à une compétence lorsqu'il est utilisé. Application automatique du bonus sur la
 *  fiche non encore câblée (cf. suivi) — pour l'instant, donnée informative/manuelle. */
export class ToolData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      ...physicalItemSchema(),
      bonusSkill: new StringField({
        required: false,
        blank: true,
        initial: "",
        choices: Object.keys(SKILL_ABILITIES)
      }),
      bonusValue: new NumberField({ required: true, integer: true, initial: 0 })
    };
  }
}

/** Monture ou véhicule (charrette, bateau...) : pas un objet transporté dans l'inventaire
 *  (pas de poids/quantité), mais un moyen de transport avec ses propres stats simplifiées. */
export class VehicleData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      category: new StringField({
        required: true,
        initial: "mount",
        choices: ["mount", "landVehicle", "waterVehicle"]
      }),
      speed: new NumberField({ required: true, integer: true, min: 0, initial: 30 }),
      capacity: new StringField({ required: false, blank: true, initial: "" }),
      ac: new NumberField({ required: true, integer: true, min: 0, initial: 10 }),
      hp: new NumberField({ required: true, integer: true, min: 0, initial: 10 }),
      description: new HTMLField({ required: false, blank: true, initial: "" })
    };
  }
}