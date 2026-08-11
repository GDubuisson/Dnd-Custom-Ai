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

/** Objet générique (composant, objet de quête, contenant, consommable...) : pas
 *  d'emplacement d'équipement dédié (cf. weapon/armor), mais peut tout de même être
 *  "équipé" (ex. un sac porté) et/ou "utilisé" (ex. allumer une torche, utiliser une
 *  trousse de soins) — cf. ITEMS.md > Item Objet. */
export class GearData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      weight: new NumberField({ required: true, min: 0, initial: 0 }),
      quantity: new NumberField({ required: true, integer: true, min: 0, initial: 1 }),
      price: currencySchema(),
      equipped: new BooleanField({ required: true, initial: false }),
      // Bonus de capacité de charge (kg) apporté à l'Actor lorsque cet objet est équipé
      // (ex. un sac à dos) — cf. rules.js > carryingCapacityBonus.
      capacityBonus: new NumberField({ required: true, min: 0, initial: 0 }),
      use: new SchemaField({
        type: new StringField({ required: true, initial: "none", choices: ["none", "light", "heal"] }),
        // "light" : rayon de lumière vive, + rayon de lumière faible SUPPLÉMENTAIRE au-delà
        // (formulation SRD, ex. "vive 6 m + faible 6 m suppl.") ; converti en rayon total
        // pour le token au moment de l'utilisation (cf. actor-sheet.js > #onUseItem).
        light: new SchemaField({
          bright: new NumberField({ required: true, min: 0, initial: 0 }),
          dim: new NumberField({ required: true, min: 0, initial: 0 })
        }),
        // "heal" : PV rendus = healBase + bonus du test de compétence healSkill (cf. rules.js
        // > skillModifier), ex. Trousse de soins = 1 + Bonus de Médecine.
        healBase: new NumberField({ required: true, integer: true, min: 0, initial: 1 }),
        healSkill: new StringField({
          required: false,
          blank: true,
          initial: "medicine",
          choices: Object.keys(SKILL_ABILITIES)
        })
      }),
      // État courant (objet allumé ou non) pour use.type === "light" ; pure donnée d'état
      // d'instance, pas de configuration (cf. #onUseItem).
      lit: new BooleanField({ required: true, initial: false }),
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
      source: new StringField({ required: false, blank: true, initial: "" }),
      // Utilisations limitées (ex. Rage, Second souffle) : `max` à 0 = pas de suivi (capacité
      // toujours disponible, comportement précédent). `value` restaure à `max` au repos
      // court ou long selon `recharge` (cf. DndCustomActorSheet#onRestShort/#onRestLong).
      uses: new SchemaField({
        max: new NumberField({ required: true, integer: true, min: 0, initial: 0 }),
        value: new NumberField({ required: true, integer: true, min: 0, initial: 0 }),
        recharge: new StringField({
          required: true,
          initial: "longRest",
          choices: ["shortRest", "longRest"]
        })
      })
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
      quantity: new NumberField({ required: true, integer: true, min: 0, initial: 1 }),
      equipped: new BooleanField({ required: true, initial: false }),
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

/** Sort (SRD 5e, système de sorts simplifié) : niveau 0 = tour de magie. Pas de formule de
 *  dégâts/DD dédiée — reste dans la description comme pour les Capacités (cf. FeatureData) ;
 *  le bonus d'attaque/DD des sorts déjà affiché sur la fiche (CharacterData/actor-sheet.js >
 *  context.spellcasting) s'applique à tout sort lancé. École de magie et composantes (V/S/M)
 *  retirées du schéma (retour de test — champs purement décoratifs, aucune règle ne s'appuyait
 *  dessus) ; temps d'incantation/portée/durée fusionnés en un seul champ `details` texte libre
 *  (ex. "1 action, 18 m, Instantanée") plutôt que trois champs séparés. */
export class SpellData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      // Classes pouvant apprendre ce sort (SRD 5e, liste de sorts par classe) : texte libre à
      // séparer par virgule, plusieurs classes possibles par sort (ex. "Ensorceleur, Magicien")
      // — même convention que FeatureData.class (libellé localisé, ex. "Magicien"), mais au
      // pluriel puisqu'un sort n'est pas exclusif à une classe contrairement à une Capacité.
      // Utilisé par grantClassContent (helpers/class-content.js) pour l'attribution automatique
      // à la création du personnage et à la montée de niveau.
      classes: new StringField({ required: false, blank: true, initial: "" }),
      level: new NumberField({ required: true, integer: true, min: 0, max: 9, initial: 1 }),
      details: new StringField({ required: false, blank: true, initial: "" }),
      concentration: new BooleanField({ required: true, initial: false }),
      ritual: new BooleanField({ required: true, initial: false }),
      // Sort préparé (Clerc/Druide/Magicien/Paladin) — purement informatif pour les classes à
      // sorts "connus" (Barde/Ensorceleur/Occultiste), où tout sort connu est disponible.
      prepared: new BooleanField({ required: true, initial: false }),
      description: new HTMLField({ required: false, blank: true, initial: "" })
    };
  }
}

/** Langue connue par un personnage : simple étiquette + catégorie, sans aucune mécanique de
 *  jet (contrairement aux Capacités, dont "Druidique" faisait auparavant partie à tort — une
 *  langue n'a pas de classe/niveau/charges). Trois catégories : "common" (la langue commune,
 *  connue par tous), "origin" (langue propre à l'une des 6 Origines, cf. la clé `language` de
 *  scripts/data/origins.json — la Commune et la langue d'Origine sont octroyées automatiquement
 *  à la création du personnage, cf. helpers/class-content.js > grantLanguages), "special"
 *  (langue secrète/de métier, ex. Argot des rues, Druidique — jamais octroyée automatiquement,
 *  à glisser sur la fiche depuis le compendium Langues au cas par cas). */
export class LanguageData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      category: new StringField({
        required: true,
        initial: "special",
        choices: ["common", "origin", "special"]
      }),
      description: new HTMLField({ required: false, blank: true, initial: "" })
    };
  }
}
