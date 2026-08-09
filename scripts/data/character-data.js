import { DND_CUSTOM } from "../helpers/config.js";
import {
  abilityModifier,
  maxHitPoints,
  armorClass,
  speedPenalty,
  classSpeedBonus,
  exhaustionSpeed,
  exhaustionMaxHp,
  spellSlotsForClass
} from "../helpers/rules.js";
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
        level: new NumberField({ required: true, integer: true, min: 1, initial: 1 }),
        // Niveaux d'Exhaustion SRD 5e (0-6) : effets appliqués dans prepareDerivedData
        // (vitesse dès le niveau 2, PV max dès le niveau 4) ; désavantage aux tests/
        // sauvegardes/attaques géré au moment du jet (cf. actor-sheet.js).
        exhaustion: new NumberField({ required: true, integer: true, min: 0, max: 6, initial: 0 })
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
      // Emplacements de sorts par niveau (1-9) : `max` est entièrement dérivé (classe +
      // niveau, cf. prepareDerivedData) comme PV max/CA/Vitesse ; `value` (emplacements
      // restants) est la seule valeur persistée, décrémentée en lançant un sort et
      // restaurée à `max` au repos long (cf. actor-sheet.js).
      spells: new SchemaField({
        slots: new SchemaField(
          schemaFromKeys(["1", "2", "3", "4", "5", "6", "7", "8", "9"], () => new SchemaField({
            value: new NumberField({ required: true, integer: true, min: 0, initial: 0 }),
            max: new NumberField({ required: true, integer: true, min: 0, initial: 0 })
          }))
        )
      }),
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
    this.attributes.hp.max = exhaustionMaxHp(
      maxHitPoints(hitDie, this.attributes.level, conMod),
      this.attributes.exhaustion
    );

    const dexMod = abilityModifier(this.abilities.dex.total);
    this.attributes.ac.value = armorClass(dexMod, equippedArmor, equippedShield, equippedAccessories);

    const strengthRequired = equippedArmor?.system.strengthRequired ?? 0;
    const isHeavyArmor = equippedArmor?.system.armorType === "heavy";
    const hasArmorOrShield = Boolean(equippedArmor) || Boolean(equippedShield);
    const classBonus = classSpeedBonus(this.class, this.attributes.level, isHeavyArmor, hasArmorOrShield);
    const speedBeforeExhaustion =
      DND_CUSTOM.baseSpeed - speedPenalty(strengthRequired, this.abilities.str.total) + classBonus;
    this.attributes.speed = exhaustionSpeed(speedBeforeExhaustion, this.attributes.exhaustion);

    // Désavantage aux tests de Discrétion imposé par l'armure équipée (SRD 5e) : donnée
    // dérivée non persistée, exposée pour l'affichage (cf. actor-sheet.js > context.skills).
    this.stealthDisadvantage = Boolean(equippedArmor?.system.stealthDisadvantage);

    // Emplacements de sorts max (cf. schéma ci-dessus) : `value` n'est jamais touché ici,
    // seul `max` est recalculé à chaque préparation.
    const maxSlots = spellSlotsForClass(this.class, this.attributes.level, game.dndCustomAi?.spellSlotTables);
    for (const level of ["1", "2", "3", "4", "5", "6", "7", "8", "9"]) {
      this.spells.slots[level].max = maxSlots[level];
    }
  }
}

export { ABILITY_KEYS, SKILL_ABILITIES };