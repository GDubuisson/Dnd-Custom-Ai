import { DND_CUSTOM } from "../helpers/config.js";
import { abilityModifier, maxHitPoints, armorClass } from "../helpers/rules.js";

const { SchemaField, NumberField, StringField, BooleanField, HTMLField } = foundry.data.fields;

const ABILITY_KEYS = ["str", "dex", "con", "int", "wis", "cha"];

/** Compétences D&D 5e (18), rattachées à leur caractéristique. */
const SKILL_ABILITIES = {
  acrobatics: "dex",
  animalHandling: "wis",
  arcana: "int",
  athletics: "str",
  deception: "cha",
  history: "int",
  insight: "wis",
  intimidation: "cha",
  investigation: "int",
  medicine: "wis",
  nature: "int",
  perception: "wis",
  performance: "cha",
  persuasion: "cha",
  religion: "int",
  sleightOfHand: "dex",
  stealth: "dex",
  survival: "wis"
};

function abilityField() {
  return new SchemaField({
    value: new NumberField({ required: true, integer: true, min: 1, initial: 10 })
  });
}

function saveField() {
  return new SchemaField({
    proficient: new BooleanField({ required: true, initial: false })
  });
}

function skillField(ability) {
  return new SchemaField({
    ability: new StringField({ required: true, initial: ability, choices: ABILITY_KEYS }),
    proficient: new BooleanField({ required: true, initial: false })
  });
}

function schemaFromKeys(keys, fieldFactory) {
  return Object.fromEntries(keys.map((key) => [key, fieldFactory(key)]));
}

export class CharacterData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      abilities: new SchemaField(schemaFromKeys(ABILITY_KEYS, () => abilityField())),
      attributes: new SchemaField({
        hp: new SchemaField({
          value: new NumberField({ required: true, integer: true, min: 0, initial: 10 }),
          max: new NumberField({ required: true, integer: true, min: 0, initial: 10 }),
          temp: new NumberField({ required: true, integer: true, min: 0, initial: 0 })
        }),
        ac: new SchemaField({
          value: new NumberField({ required: true, integer: true, min: 0, initial: 10 })
        }),
        speed: new NumberField({ required: true, integer: true, min: 0, initial: 30 }),
        level: new NumberField({ required: true, integer: true, min: 1, initial: 1 })
      }),
      origin: new StringField({ required: true, blank: true, initial: "" }),
      class: new StringField({ required: true, blank: true, initial: "" }),
      xp: new NumberField({ required: true, integer: true, min: 0, initial: 0 }),
      saves: new SchemaField(schemaFromKeys(ABILITY_KEYS, () => saveField())),
      skills: new SchemaField(
        Object.fromEntries(
          Object.entries(SKILL_ABILITIES).map(([key, ability]) => [key, skillField(ability)])
        )
      ),
      currency: new SchemaField({
        pc: new NumberField({ required: true, integer: true, min: 0, initial: 0 }),
        pa: new NumberField({ required: true, integer: true, min: 0, initial: 0 }),
        po: new NumberField({ required: true, integer: true, min: 0, initial: 0 }),
        pp: new NumberField({ required: true, integer: true, min: 0, initial: 0 })
      }),
      biography: new HTMLField({ required: false, blank: true, initial: "" }),
      notes: new HTMLField({ required: false, blank: true, initial: "" })
    };
  }

  /** PV max, CA et Vitesse sont entièrement dérivés (classe/niveau/CON, Dex + armure
   *  équipée, constante de base) : jamais des valeurs saisies, ni par le joueur ni par
   *  le MJ. Recalculés à chaque préparation de l'Actor, donc toujours à jour. */
  prepareDerivedData() {
    const items = this.parent?.items ?? [];
    const equippedArmor = items.find(
      (item) => item.type === "armor" && item.system.slot === "armor" && item.system.equipped
    );
    const equippedShield = items.find(
      (item) => item.type === "armor" && item.system.slot === "offHand" && item.system.equipped
    );

    const hitDie = DND_CUSTOM.classHitDice[this.class] ?? 8;
    const conMod = abilityModifier(this.abilities.con.value);
    this.attributes.hp.max = maxHitPoints(hitDie, this.attributes.level, conMod);

    const dexMod = abilityModifier(this.abilities.dex.value);
    this.attributes.ac.value = armorClass(dexMod, equippedArmor, equippedShield);

    this.attributes.speed = DND_CUSTOM.baseSpeed;
  }
}

export { ABILITY_KEYS, SKILL_ABILITIES };