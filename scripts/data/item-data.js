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