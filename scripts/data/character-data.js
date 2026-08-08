import { DND_CUSTOM } from "../helpers/config.js";
import { abilityModifier, maxHitPoints, armorClass, speedPenalty } from "../helpers/rules.js";
import { currencySchema } from "./shared-schema.js";

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
    value: new NumberField({ required: true, integer: true, min: 1, initial: 10 }),
    total: new NumberField({ required: true, integer: true, min: 1, initial: 10 })
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
      currency: currencySchema(),
      biography: new HTMLField({ required: false, blank: true, initial: "" }),
      notes: new HTMLField({ required: false, blank: true, initial: "" })
    };
  }

  /** PV max, CA et Vitesse sont entièrement dérivés (classe/niveau/CON, Dex + armure/
   *  bouclier/accessoires équipés, constante de base) : jamais des valeurs saisies, ni
   *  par le joueur ni par le MJ. Recalculés à chaque préparation de l'Actor, donc toujours à jour. */
  prepareDerivedData() {
    const originData = game.dndCustomAi?.origins?.[this.origin];
    const originBonuses = originData?.abilityBonuses ?? {};
    for (const key of ABILITY_KEYS) {
      this.abilities[key].total = this.abilities[key].value + (originBonuses[key] ?? 0);
    }

    const items = this.parent?.items ?? [];
    const equippedArmor = items.find(
      (item) => item.type === "armor" && item.system.slot === "armor" && item.system.equipped
    );
    const equippedShield = items.find(
      (item) => item.type === "armor" && item.system.slot === "offHand" && item.system.equipped
    );
    const equippedAccessories = items.filter(
      (item) => item.type === "armor" && item.system.slot === "accessory" && item.system.equipped
    );

    const hitDie = DND_CUSTOM.classHitDice[this.class] ?? 8;
    const conMod = abilityModifier(this.abilities.con.total);
    this.attributes.hp.max = maxHitPoints(hitDie, this.attributes.level, conMod);

    const dexMod = abilityModifier(this.abilities.dex.total);
    this.attributes.ac.value = armorClass(dexMod, equippedArmor, equippedShield, equippedAccessories);

    const strengthRequired = equippedArmor?.system.strengthRequired ?? 0;
    this.attributes.speed = DND_CUSTOM.baseSpeed - speedPenalty(strengthRequired, this.abilities.str.total);

    // Désavantage aux tests de Discrétion imposé par l'armure équipée (SRD 5e) : donnée
    // dérivée non persistée, exposée pour l'affichage (cf. actor-sheet.js > context.skills).
    this.stealthDisadvantage = Boolean(equippedArmor?.system.stealthDisadvantage);
  }
}

export { ABILITY_KEYS, SKILL_ABILITIES };