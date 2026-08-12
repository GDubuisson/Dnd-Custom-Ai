import { DND_CUSTOM } from "../helpers/config.js";
import {
  abilityModifier,
  maxHitPoints,
  armorClass,
  speedPenalty,
  classSpeedBonus,
  exhaustionSpeed,
  exhaustionMaxHp,
  spellUsesForClass,
  hasFeature
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
        exhaustion: new NumberField({ required: true, integer: true, min: 0, max: 6, initial: 0 }),
        // Jets de sauvegarde de la mort, SRD 5e : 3 réussites = stabilisé, 3 échecs = mort.
        // Remis à zéro automatiquement en tombant à 0 PV ou en repassant au-dessus (cf. hook
        // updateActor dans dnd-custom-ai.js).
        death: new SchemaField({
          successes: new NumberField({ required: true, integer: true, min: 0, max: 3, initial: 0 }),
          failures: new NumberField({ required: true, integer: true, min: 0, max: 3, initial: 0 })
        })
      }),
      origin: new StringField({ required: true, blank: true, initial: "" }),
      class: new StringField({ required: true, blank: true, initial: "" }),
      // Clé de sous-classe (ex. "berserker"), cf. DND_CUSTOM.subclasses[class] (config.js) —
      // même convention que `class` : stocke la clé, pas le libellé localisé. Vide tant que le
      // personnage n'a pas atteint le niveau de sous-classe de sa classe (DND_CUSTOM.subclassLevel).
      subclass: new StringField({ required: true, blank: true, initial: "" }),
      xp: new NumberField({ required: true, integer: true, min: 0, initial: 0 }),
      saves: new SchemaField(schemaFromKeys(ABILITY_KEYS, () => saveField())),
      skills: new SchemaField(
        Object.fromEntries(
          Object.entries(SKILL_ABILITIES).map(([key, ability]) => [key, skillField(ability)])
        )
      ),
      currency: currencySchema(),
      // Sorts par repos, système simplifié (cf. spellUsesForClass, rules.js) : un seul pool
      // `uses` plutôt qu'un emplacement par niveau de sort (1-9) — `max` est entièrement dérivé
      // (classe + niveau, cf. prepareDerivedData) comme PV max/CA/Vitesse ; `value` (charges
      // restantes) est la seule valeur persistée, décrémentée en lançant un sort (hors tour de
      // magie) et restaurée à `max` au repos long (cf. actor-sheet.js).
      spells: new SchemaField({
        uses: new SchemaField({
          value: new NumberField({ required: true, integer: true, min: 0, initial: 0 }),
          max: new NumberField({ required: true, integer: true, min: 0, initial: 0 })
        }),
        // Nom (texte libre, pas une référence d'Item) du sort actuellement concentré, SRD 5e
        // "un seul sort à la fois" : lancer un nouveau sort à concentration remplace celui-ci
        // (cf. DndCustomActorSheet#onCastSpell) ; un échec de jet de sauvegarde de
        // Constitution après des dégâts subis le vide (cf. dnd-custom-ai.js).
        concentratingOn: new StringField({ required: false, blank: true, initial: "" })
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
    // Défense sans armure du Barbare (Capacité, SRD 5e) : 10 + Dex + Con au lieu de 10 + Dex,
    // uniquement sans armure portée (un bouclier reste utilisable sans perdre le bénéfice, cf.
    // armorClass qui ajoute son bonus séparément) — appliqué automatiquement dès que le
    // personnage possède la Capacité, sans que le joueur ait à y penser à chaque calcul de CA.
    const unarmoredDefenseBonus =
      !equippedArmor && hasFeature(items, "Défense sans armure (Barbare)") ? conMod : 0;
    this.attributes.ac.value = armorClass(
      dexMod,
      equippedArmor,
      equippedShield,
      equippedAccessories,
      unarmoredDefenseBonus
    );

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

    // Modificateur d'Initiative (mod. de Dextérité) : donnée dérivée non persistée, exposée à
    // la fois pour l'affichage et pour la formule d'initiative du Combat Tracker Foundry
    // (`"initiative": "1d20 + @attributes.initiativeMod"` dans system.json).
    this.attributes.initiativeMod = dexMod;

    // Pool de sorts par repos (cf. schéma ci-dessus) : `value` n'est jamais touché ici, seul
    // `max` est recalculé à chaque préparation. `maxLevel` (plus haut niveau de sort
    // accessible) n'est pas persisté (même convention que stealthDisadvantage/initiativeMod
    // ci-dessus) : exposé uniquement pour limiter les Sorts octroyés automatiquement à la
    // classe/au niveau (cf. helpers/class-content.js).
    const spellUses = spellUsesForClass(this.class, this.attributes.level, game.dndCustomAi?.spellSlotTables);
    this.spells.uses.max = spellUses.max;
    this.spells.maxLevel = spellUses.maxSpellLevel;
  }
}

export { ABILITY_KEYS, SKILL_ABILITIES };