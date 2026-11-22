import { SKILL_ABILITIES, ABILITY_KEYS } from "./character-data.js";
import { currencySchema, damageAffinitySchema } from "./shared-schema.js";
import { DND_CUSTOM } from "../helpers/config.js";

const { SchemaField, NumberField, StringField, BooleanField, HTMLField, SetField, ArrayField } = foundry.data.fields;

/** Toutes les clés de sous-classe, contrainte `choices` de FeatureData#subclass. */
const ALL_SUBCLASS_KEYS = Object.values(DND_CUSTOM.subclasses).flatMap((bySubclass) => Object.keys(bySubclass));

/** Poids (kg), quantité et état équipé, communs à tous les Items physiques. */
function equippableItemFields() {
  return {
    weight: new NumberField({ required: true, min: 0, initial: 0 }),
    quantity: new NumberField({ required: true, integer: true, min: 0, initial: 1 }),
    equipped: new BooleanField({ required: true, initial: false })
  };
}

/** Champs communs aux armes, armures et objets : physiques + description HTML. */
function physicalItemSchema() {
  return {
    ...equippableItemFields(),
    description: new HTMLField({ required: false, blank: true, initial: "" })
  };
}

/** Sous-schéma de portée (m), pour les propriétés Portée et Lancer. */
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
      // Dégâts à deux mains, si la propriété Polyvalente est active.
      damageVersatile: new SchemaField({
        dice: new StringField({ required: false, blank: true, initial: "" })
      }),
      // Dégâts secondaires optionnels (ex. feu), sans modificateur, résolus dans un message distinct.
      secondaryDamage: new SchemaField({
        dice: new StringField({ required: false, blank: true, initial: "" }),
        type: new StringField({
          required: false,
          blank: true,
          initial: "",
          choices: Object.keys(DND_CUSTOM.damageTypes)
        })
      }),
      slot: new StringField({
        required: true,
        initial: "mainHand",
        choices: ["mainHand", "offHand"]
      }),
      // Arme magique : ignore les résistances physiques « contre les attaques non magiques ».
      magic: new BooleanField({ required: true, initial: false }),
      // Bonus magique (+1 à +3) aux jets d'attaque et de dégâts.
      enhancement: new NumberField({ required: true, integer: true, min: 0, max: 3, initial: 0 }),
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
        // Portée de tir ou de lancer, selon weaponType / properties.thrown.
        range: rangeSchema(),
        special: new StringField({ required: false, blank: true, initial: "" })
      }),
      // Affinités aux dégâts accordées au porteur tant que l'arme est équipée.
      ...damageAffinitySchema()
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
      }),
      // Bonus à tous les jets de sauvegarde du porteur, si l'objet est équipé (ex. Cape de protection).
      saveBonus: new NumberField({ required: true, integer: true, min: 0, initial: 0 }),
      // Bonus de CA ignoré si le porteur a une armure ou un bouclier équipé (ex. Bracelets de défense).
      unarmoredOnly: new BooleanField({ required: true, initial: false }),
      // Affinités aux dégâts propres à l'armure, actives si elle est équipée.
      ...damageAffinitySchema()
    };
  }
}

/** Objet générique (contenant, consommable…), qui peut être équipé et/ou utilisé. */
export class GearData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      ...physicalItemSchema(),
      price: currencySchema(),
      // Bonus de capacité de charge (kg) quand l'objet est équipé.
      capacityBonus: new NumberField({ required: true, min: 0, initial: 0 }),
      use: new SchemaField({
        type: new StringField({ required: true, initial: "none", choices: ["none", "light", "heal"] }),
        // Lumière : rayon vif + rayon faible additionnel.
        light: new SchemaField({
          bright: new NumberField({ required: true, min: 0, initial: 0 }),
          dim: new NumberField({ required: true, min: 0, initial: 0 })
        }),
        // Soin : healDice + healBase + bonus de la compétence healSkill (vide = aucun bonus).
        healDice: new StringField({ required: false, blank: true, initial: "" }),
        healBase: new NumberField({ required: true, integer: true, min: 0, initial: 1 }),
        healSkill: new StringField({
          required: false,
          blank: true,
          initial: "medicine",
          choices: Object.keys(SKILL_ABILITIES)
        }),
        // Objet consommé à chaque utilisation (une unité de quantité).
        consumable: new BooleanField({ required: true, initial: false })
      }),
      // Objet lumineux actuellement allumé.
      lit: new BooleanField({ required: true, initial: false })
    };
  }
}

/** Capacité (de classe, d'Origine, de don…), avec jet éventuel. */
export class FeatureData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      // Clé de classe stable ; vide pour une Capacité universelle.
      class: new StringField({ required: false, blank: true, initial: "", choices: Object.keys(DND_CUSTOM.classes) }),
      // Clé de sous-classe stable ; vide pour une Capacité de classe de base.
      subclass: new StringField({ required: false, blank: true, initial: "", choices: ALL_SUBCLASS_KEYS }),
      // Octroyée à toutes les classes au niveau requis.
      universal: new BooleanField({ required: true, initial: false }),
      level: new NumberField({ required: true, integer: true, min: 1, initial: 1 }),
      description: new HTMLField({ required: false, blank: true, initial: "" }),
      // Type d'action nécessaire ; « reaction » active le suivi de réaction.
      activation: new StringField({
        required: true,
        initial: "action",
        choices: ["action", "bonusAction", "reaction", "free"]
      }),
      // Déclencheur de la réaction, affiché en aide au joueur.
      reactionTrigger: new StringField({ required: false, blank: true, initial: "" }),
      requiresRoll: new BooleanField({ required: true, initial: false }),
      rollFormula: new StringField({ required: false, blank: true, initial: "" }),
      // Le jet est un soin : bouton « Appliquer le soin ».
      healsTarget: new BooleanField({ required: true, initial: false }),
      // Le jet réduit les dégâts subis : bouton « Appliquer la réduction ».
      reducesDamage: new BooleanField({ required: true, initial: false }),
      // Le jet inflige des dégâts : bouton « Appliquer les dégâts ».
      dealsDamage: new BooleanField({ required: true, initial: false }),
      // Sauvegarde imposée à chaque cible contre le DD du personnage ; vide = aucune.
      savingThrow: new StringField({ required: false, blank: true, initial: "", choices: ABILITY_KEYS }),
      // Caractéristique du DD si elle diffère de celle d'incantation (ex. Sagesse du Moine).
      saveDCAbility: new StringField({ required: false, blank: true, initial: "", choices: ABILITY_KEYS }),
      // État appliqué à la cible sur échec de la sauvegarde.
      appliesCondition: new StringField({
        required: false,
        blank: true,
        initial: "",
        choices: DND_CUSTOM.conditions.map((condition) => condition.id)
      }),
      // Types de créature affectés ; vide = tous.
      requiresCreatureTypes: new SetField(new StringField({ choices: Object.keys(DND_CUSTOM.creatureTypes) }), {
        required: true,
        initial: []
      }),
      // État posé sur chaque cible, sans jet.
      grantsCondition: new StringField({
        required: false,
        blank: true,
        initial: "",
        choices: DND_CUSTOM.conditions.map((condition) => condition.id)
      }),
      // Test opposé : Athlétisme contre le meilleur Athlétisme/Acrobaties de la cible.
      // Agripper pose « Agrippé » ; Bousculer pose « À terre » ou rappelle le recul.
      opposedCheckType: new StringField({
        required: false,
        blank: true,
        initial: "",
        choices: ["grapple", "shove"]
      }),
      // Total de niveaux d'emplacements récupérés au premier repos court du jour (`rollFormula`).
      recoversSpellSlots: new BooleanField({ required: true, initial: false }),
      // État requis sur l'Actor pour utiliser la Capacité ; vide = aucun.
      requiresState: new StringField({
        required: false,
        blank: true,
        initial: "",
        choices: DND_CUSTOM.conditions.map((condition) => condition.id)
      }),
      source: new StringField({ required: false, blank: true, initial: "" }),
      // Utilisations limitées (`max` 0 = illimité), rechargées selon `recharge`.
      uses: new SchemaField({
        max: new NumberField({ required: true, integer: true, min: 0, initial: 0 }),
        value: new NumberField({ required: true, integer: true, min: 0, initial: 0 }),
        recharge: new StringField({
          required: true,
          initial: "longRest",
          choices: ["shortRest", "longRest"]
        })
      }),
      // `uses.max` égal au niveau du personnage (ex. Ki, Sorcellerie innée).
      scalesWithLevel: new BooleanField({ required: true, initial: false }),
      // Nom de la Capacité réservoir dont une charge est consommée.
      costsResource: new StringField({ required: false, blank: true, initial: "" }),
      // Champ de `system.combat` qui stocke le choix définitif proposé (ex. "totemSpirit").
      grantsChoice: new StringField({
        required: false,
        blank: true,
        initial: "",
        choices: ["totemSpirit", "draconicResistanceType", "huntersDefense", "favoredEnemyType"]
      }),
      // Affiche le bouton « Invoquer le compagnon » (une seule fois).
      summonsCompanion: new BooleanField({ required: true, initial: false }),
      // Affiche le bouton « Prendre forme » de la Forme sauvage.
      entersWildShape: new BooleanField({ required: true, initial: false }),
      // Noms des Sorts octroyés avec la Capacité.
      grantsSpells: new SetField(new StringField({ blank: false }), { required: true, initial: [] }),
      // Propose une manœuvre à chaque charge dépensée.
      offersManeuverChoice: new BooleanField({ required: true, initial: false }),
      // Technique de la Main ouverte : effet choisi à chaque usage, puis sauvegarde de Dex de chaque cible.
      offersOpenHandTechnique: new BooleanField({ required: true, initial: false }),
      // Don proposant une caractéristique à améliorer (choix stocké sur le don).
      offersAbilityChoice: new BooleanField({ required: true, initial: false }),
      // Caractéristique choisie, lue par CharacterData.
      chosenAbility: new StringField({ required: false, blank: true, initial: "", choices: ABILITY_KEYS }),
      // Montant ajouté à la caractéristique choisie (+1 pour Athlète, +2 pour un Éclat absorbé).
      abilityChoiceBonus: new NumberField({ required: true, integer: true, min: 1, max: 2, initial: 1 }),
      // Don prenable plusieurs fois : un nouveau glisser crée un exemplaire de plus (Éclat absorbé).
      repeatable: new BooleanField({ required: true, initial: false }),
      // Magie d'initié : choix d'une classe, de 2 tours de magie et d'1 sort de niveau 1.
      offersSpellChoice: new BooleanField({ required: true, initial: false }),
      // Classe choisie (Magie d'initié).
      chosenSpellClass: new StringField({ required: false, blank: true, initial: "", choices: DND_CUSTOM.spellcastingClasses }),
      // Tours de magie choisis (Magie d'initié).
      chosenCantrips: new ArrayField(new StringField({ blank: false }), { required: true, initial: [] }),
      // Sort de niveau 1 choisi, lançable gratuitement une fois par repos long via `uses`.
      chosenLevelOneSpell: new StringField({ required: false, blank: true, initial: "" }),
      // Exclue de l'octroi automatique (pool d'options à glisser manuellement).
      manualOnly: new BooleanField({ required: true, initial: false }),
      // Nom du Sort dont les dégâts reçoivent un bonus (Salve implacable).
      boostsSpellDamage: new StringField({ required: false, blank: true, initial: "" }),
      // Caractéristique dont le modificateur s'ajoute (cf. boostsSpellDamage).
      boostsSpellDamageAbility: new StringField({ required: false, blank: true, initial: "", choices: ABILITY_KEYS })
    };
  }

  /** Recalcule `uses.max` au niveau du propriétaire pour une réserve à progression (Item embarqué seulement). */
  prepareDerivedData() {
    const level = this.parent?.actor?.system?.attributes?.level;
    if (this.scalesWithLevel && level) this.uses.max = level;
  }
}

/** Outil : accorde un bonus à une compétence lorsqu'il est utilisé. */
export class ToolData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      price: currencySchema(),
      ...equippableItemFields(),
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

/** Sort (niveau 0 = tour de magie) ; `details` regroupe temps d'incantation, portée et durée. */
export class SpellData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      // Classes ayant accès au sort (clés stables).
      classes: new SetField(new StringField({ choices: Object.keys(DND_CUSTOM.classes) })),
      level: new NumberField({ required: true, integer: true, min: 0, max: 9, initial: 1 }),
      details: new StringField({ required: false, blank: true, initial: "" }),
      // Type d'action nécessaire pour lancer le sort.
      activation: new StringField({
        required: true,
        initial: "action",
        choices: ["action", "bonusAction", "reaction", "free"]
      }),
      reactionTrigger: new StringField({ required: false, blank: true, initial: "" }),
      concentration: new BooleanField({ required: true, initial: false }),
      ritual: new BooleanField({ required: true, initial: false }),
      // Sort à jet d'attaque, suivi d'un jet de dégâts.
      attack: new BooleanField({ required: true, initial: false }),
      // Sauvegarde de chaque cible : `ability` vide = aucune, `halfOnSave` = moitié des dégâts sur réussite,
      // `appliesCondition` = état posé sur échec.
      save: new SchemaField({
        ability: new StringField({ required: false, blank: true, initial: "", choices: ABILITY_KEYS }),
        halfOnSave: new BooleanField({ required: true, initial: false }),
        appliesCondition: new StringField({
          required: false,
          blank: true,
          initial: "",
          choices: DND_CUSTOM.conditions.map((condition) => condition.id)
        })
      }),
      damage: new SchemaField({
        dice: new StringField({ required: false, blank: true, initial: "" }),
        type: new StringField({ required: false, blank: true, initial: "" })
      }),
      // Soin : dés + modificateur d'incantation, bouton « Appliquer le soin ».
      heal: new SchemaField({
        dice: new StringField({ required: false, blank: true, initial: "" })
      }),
      // Lumière émise par les tokens du lanceur (`dim` additionnel à `bright`).
      light: new SchemaField({
        bright: new NumberField({ required: true, min: 0, initial: 0 }),
        dim: new NumberField({ required: true, min: 0, initial: 0 })
      }),
      // État posé sur chaque cible au lancer, sans jet.
      grantsCondition: new StringField({
        required: false,
        blank: true,
        initial: "",
        choices: DND_CUSTOM.conditions.map((condition) => condition.id)
      }),
      description: new HTMLField({ required: false, blank: true, initial: "" })
    };
  }
}

/** Langue connue : catégorie commune, d'Origine, spéciale, ou langue d'un peuple (ne s'apprend pas). */
export class LanguageData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      category: new StringField({
        required: true,
        initial: "special",
        choices: ["common", "origin", "special", "people"]
      }),
      // Langue à connaître déjà pour pouvoir apprendre celle-ci (nom exact) ; vide = aucune.
      requiredLanguage: new StringField({ required: false, blank: true, initial: "" }),
      description: new HTMLField({ required: false, blank: true, initial: "" })
    };
  }
}
