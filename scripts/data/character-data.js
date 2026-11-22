import { DND_CUSTOM } from "../helpers/config.js";
import {
  abilityModifier,
  maxHitPoints,
  armorClass,
  speedPenalty,
  classSpeedBonus,
  exhaustionSpeed,
  exhaustionMaxHp,
  spellSlotsForClass,
  SPELL_LEVELS,
  hasFeature
} from "../helpers/rules.js";
import { currencySchema, damageAffinitySchema, schemaFromKeys } from "./shared-schema.js";

const { SchemaField, NumberField, StringField, BooleanField, HTMLField, SetField } = foundry.data.fields;

const ABILITY_KEYS = ["str", "dex", "con", "int", "wis", "cha"];

/** Les 18 compétences et leur caractéristique. */
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
        // Choix Amélioration/Don dus et non résolus, reproposés tant que > 0.
        pendingAsiChoices: new NumberField({ required: true, integer: true, min: 0, initial: 0 }),
        // Niveau d'Épuisement (0-6) : vitesse et PV max dérivés, désavantages appliqués au jet.
        exhaustion: new NumberField({ required: true, integer: true, min: 0, max: 6, initial: 0 }),
        // Repos courts depuis le dernier repos long : à partir du 4e, chacun ajoute 1 point d'Épuisement.
        shortRestCount: new NumberField({ required: true, integer: true, min: 0, initial: 0 }),
        // Jets de sauvegarde contre la mort : 3 réussites = stabilisé, 3 échecs = mort.
        death: new SchemaField({
          successes: new NumberField({ required: true, integer: true, min: 0, max: 3, initial: 0 }),
          failures: new NumberField({ required: true, integer: true, min: 0, max: 3, initial: 0 })
        }),
        // Points d'inspiration accordés par le MJ, dépensés pour relancer un test.
        inspirationPoints: new NumberField({ required: true, integer: true, min: 0, initial: 0 })
      }),
      origin: new StringField({ required: true, blank: true, initial: "" }),
      class: new StringField({ required: true, blank: true, initial: "" }),
      // Clé de sous-classe (cf. DND_CUSTOM.subclasses), vide avant le niveau requis.
      subclass: new StringField({ required: true, blank: true, initial: "" }),
      xp: new NumberField({ required: true, integer: true, min: 0, initial: 0 }),
      saves: new SchemaField(schemaFromKeys(ABILITY_KEYS, () => saveField())),
      skills: new SchemaField(
        Object.fromEntries(
          Object.entries(SKILL_ABILITIES).map(([key, ability]) => [key, skillField(ability)])
        )
      ),
      currency: currencySchema(),
      // Emplacements de sorts par palier : `max` dérivé de la classe et du niveau, `value` persistée.
      spells: new SchemaField({
        slots: new SchemaField(
          Object.fromEntries(
            SPELL_LEVELS.map((level) => [
              String(level),
              new SchemaField({
                value: new NumberField({ required: true, integer: true, min: 0, initial: 0 }),
                max: new NumberField({ required: true, integer: true, min: 0, initial: 0 })
              })
            ])
          )
        ),
        // Nom du sort de concentration en cours.
        concentratingOn: new StringField({ required: false, blank: true, initial: "" })
      }),
      // Économie d'action du tour, régénérée au début du tour du personnage en combat.
      combat: new SchemaField({
        reactionAvailable: new BooleanField({ required: true, initial: true }),
        // Action et Action bonus : suivi non bloquant (rappel en chat).
        actionAvailable: new BooleanField({ required: true, initial: true }),
        bonusActionAvailable: new BooleanField({ required: true, initial: true }),
        // Rounds de Rage restants ; 0 = pas de décompte.
        rageRoundsRemaining: new NumberField({ required: true, integer: true, min: 0, initial: 0 }),
        // Dernier round traité par le décompte de Rage.
        rageLastRound: new NumberField({ required: true, integer: true, min: 0, initial: 0 }),
        // Esprit totem choisi (Aspect de la bête), définitif.
        totemSpirit: new StringField({ required: true, blank: true, initial: "", choices: ["bear", "eagle", "wolf"] }),
        // Id de l'Actor « mount » chevauché ; vide = à pied.
        mountedActorId: new StringField({ required: true, blank: true, initial: "" }),
        // Id de l'Actor « wildShapeForm » de la forme sauvage active, dont les PV servent de 2e réserve.
        wildShapeActorId: new StringField({ required: true, blank: true, initial: "" }),
        // Type de dégâts résisté par Résilience draconique, définitif.
        draconicResistanceType: new StringField({
          required: true,
          blank: true,
          initial: "",
          choices: ["acid", "cold", "fire", "lightning", "poison"]
        }),
        // Option de Tactiques défensives choisie, définitive.
        huntersDefense: new StringField({
          required: true,
          blank: true,
          initial: "",
          choices: ["mobile", "multiattackDefense", "steadfast"]
        }),
        // Type de créature d'Ennemi juré, définitif : avantage à certains tests contre lui.
        favoredEnemyType: new StringField({
          required: true,
          blank: true,
          initial: "",
          choices: Object.keys(DND_CUSTOM.creatureTypes)
        }),
        // Résistances, immunités et vulnérabilités réglées par le MJ.
        ...damageAffinitySchema(),
        // Ids des Actors ayant attaqué ce personnage depuis le début de son tour.
        attackedByThisRound: new SetField(new StringField({ blank: false }), { required: true, initial: [] })
      }),
      biography: new HTMLField({ required: false, blank: true, initial: "" }),
      notes: new HTMLField({ required: false, blank: true, initial: "" })
    };
  }

  /** Dérive caractéristiques, PV max, CA, vitesse, initiative et emplacements de sorts. */
  prepareDerivedData() {
    const items = this.parent?.items ?? [];
    deriveAbilities(this, items);
    deriveHitPointsAndDefense(this, items);
    deriveInitiativeAndSpells(this, items);
  }
}

/** Totaux et modificateurs de caractéristiques : Origine, Doué, dons à caractéristique choisie (et maîtrise de Résilient). */
function deriveAbilities(system, items) {
  const originData = game.dndCustomAi?.origins?.[system.origin];
  const originBonuses = originData?.abilityBonuses ?? {};
  // Don Doué : +1 Charisme.
  const gracefulChaBonus = hasFeature(items, "Doué") ? 1 : 0;
  // Dons Athlète, Résilient, Marque d'éclat, Résonance (+1) et Éclat absorbé (+2) : bonus à la caractéristique choisie, cumulables.
  const abilityChoiceFeats = items.filter(
    (item) => item.type === "feature" && item.system?.offersAbilityChoice && item.system?.chosenAbility
  );
  for (const key of ABILITY_KEYS) {
    const choiceBonus = abilityChoiceFeats
      .filter((item) => item.system.chosenAbility === key)
      .reduce((total, item) => total + (item.system.abilityChoiceBonus ?? 1), 0);
    const featBonus = (key === "cha" ? gracefulChaBonus : 0) + choiceBonus;
    system.abilities[key].total = system.abilities[key].value + (originBonuses[key] ?? 0) + featBonus;
    // Modificateur exposé pour les formules `@abilities.<clé>.mod`.
    system.abilities[key].mod = abilityModifier(system.abilities[key].total);
  }
  // Résilient accorde aussi la maîtrise de la sauvegarde choisie.
  for (const item of abilityChoiceFeats) {
    if (item.name === "Résilient") system.saves[item.system.chosenAbility].proficient = true;
  }
}

/** Armure portée, bonus de sauvegarde, PV max, CA, vitesse et désavantage de Discrétion. */
function deriveHitPointsAndDefense(system, items) {
  const isEquippedArmor = (item, slot) => item.type === "armor" && item.system.slot === slot && item.system.equipped;
  const equippedArmor = items.find((item) => isEquippedArmor(item, "armor"));
  const equippedShield = items.find((item) => isEquippedArmor(item, "offHand"));
  const equippedAccessories = items.filter((item) => isEquippedArmor(item, "accessory"));
  // Bonus de sauvegarde des armures et accessoires équipés (ex. Cape de protection).
  system.attributes.saveBonus = items
    .filter((item) => item.type === "armor" && item.system.equipped)
    .reduce((total, item) => total + (item.system.saveBonus ?? 0), 0);

  const hitDie = DND_CUSTOM.classHitDice[system.class] ?? 8;
  const conMod = abilityModifier(system.abilities.con.total);
  // Don Tenace : +2 PV max par niveau, avant la réduction d'Épuisement.
  const toughFeatBonus = hasFeature(items, "Tenace") ? 2 * system.attributes.level : 0;
  // Résilience draconique : +1 PV max par niveau.
  const draconicResilienceBonus = hasFeature(items, "Résilience draconique") ? system.attributes.level : 0;
  // Éclat de Tirwen : +1 PV max par niveau.
  const tirwenShardBonus = hasFeature(items, "Éclat de Tirwen") ? system.attributes.level : 0;
  system.attributes.hp.max = exhaustionMaxHp(
    maxHitPoints(hitDie, system.attributes.level, conMod) + toughFeatBonus + draconicResilienceBonus + tirwenShardBonus,
    system.attributes.exhaustion
  );

  const dexMod = abilityModifier(system.abilities.dex.total);
  // Bonus « sans armure » : +Con (Défense sans armure du Barbare) ou +3 (Résilience draconique).
  const unarmoredDefenseBonus =
    (!equippedArmor && hasFeature(items, "Défense sans armure (Barbare)") ? conMod : 0) +
    (!equippedArmor && hasFeature(items, "Résilience draconique") ? 3 : 0);
  system.attributes.ac.value = armorClass(
    dexMod,
    equippedArmor,
    equippedShield,
    equippedAccessories,
    unarmoredDefenseBonus
  );

  const strengthRequired = equippedArmor?.system.strengthRequired ?? 0;
  const isHeavyArmor = equippedArmor?.system.armorType === "heavy";
  const hasArmorOrShield = Boolean(equippedArmor) || Boolean(equippedShield);
  const classBonus = classSpeedBonus(system.class, system.attributes.level, isHeavyArmor, hasArmorOrShield);
  const speedBeforeExhaustion =
    DND_CUSTOM.baseSpeed - speedPenalty(strengthRequired, system.abilities.str.total) + classBonus;
  system.attributes.speed = exhaustionSpeed(speedBeforeExhaustion, system.attributes.exhaustion);

  // Désavantage en Discrétion imposé par l'armure équipée.
  system.stealthDisadvantage = Boolean(equippedArmor?.system.stealthDisadvantage);
}

/** Modificateur et dés d'initiative, puis emplacements de sorts de la classe. */
function deriveInitiativeAndSpells(system, items) {
  const dexMod = abilityModifier(system.abilities.dex.total);
  // Initiative : Dex, +2 Embuscade des ténèbres, +5 don Alerte.
  system.attributes.initiativeMod =
    dexMod + (system.subclass === "gloomStalker" ? 2 : 0) + (hasFeature(items, "Alerte") ? 5 : 0);

  // Nombre de d20 d'initiative (2 = avantage, Instinct sauvage).
  system.attributes.initiativeDice = hasFeature(items, "Instinct sauvage") ? 2 : 1;

  // Recalcule le `max` de chaque palier, `maxLevel` et `isPactMagic`.
  const spellSlots = spellSlotsForClass(system.class, system.attributes.level, game.dndCustomAi?.spellSlotTables);
  for (const level of SPELL_LEVELS) {
    system.spells.slots[level].max = spellSlots.slots[level];
  }
  system.spells.maxLevel = spellSlots.maxSpellLevel;
  system.spells.isPactMagic = spellSlots.isPactMagic;
}

export { ABILITY_KEYS, SKILL_ABILITIES };