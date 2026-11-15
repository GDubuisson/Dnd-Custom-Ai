import { DND_CUSTOM } from "../helpers/config.js";
import { ABILITY_KEYS } from "./character-data.js";
import { damageAffinitySchema, schemaFromKeys } from "./shared-schema.js";

const { SchemaField, NumberField, StringField, HTMLField, BooleanField, ArrayField } = foundry.data.fields;

/** Caractéristique de PNJ : bonus direct, servant aussi de sauvegarde. */
function npcAbilityField() {
  return new SchemaField({
    mod: new NumberField({ required: true, integer: true, initial: 0 })
  });
}

/** Fiche d'ennemi/PNJ générique : stats simplifiées, distincte de CharacterData. */
export class NpcData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      creatureType: new StringField({
        required: true,
        initial: "humanoid",
        choices: Object.keys(DND_CUSTOM.creatureTypes)
      }),
      challengeRating: new StringField({
        required: true,
        initial: "0",
        choices: DND_CUSTOM.challengeRatings
      }),
      size: new StringField({
        required: true,
        initial: "m",
        choices: Object.keys(DND_CUSTOM.sizes)
      }),
      abilities: new SchemaField(schemaFromKeys(ABILITY_KEYS, () => npcAbilityField())),
      attributes: new SchemaField({
        hp: new SchemaField({
          value: new NumberField({ required: true, integer: true, min: 0, initial: 10 }),
          max: new NumberField({ required: true, integer: true, min: 0, initial: 10 }),
          // PV temporaires, absorbés en premier (ex. Forme sauvage de combat).
          temp: new NumberField({ required: true, integer: true, min: 0, initial: 0 })
        }),
        ac: new SchemaField({
          value: new NumberField({ required: true, integer: true, min: 0, initial: 10 })
        }),
        // Vitesse saisie directement en mètres.
        speed: new NumberField({ required: true, integer: true, min: 0, initial: 9 })
      }),
      // XP rapporté, pré-rempli selon le FI puis modifiable.
      xpReward: new NumberField({ required: true, integer: true, min: 0, initial: 0 }),
      // Profils d'attaque, chacun avec son jet : `ability` (For/Dex) pilote attaque et dégâts,
      // `bonus` et `damage.bonus` s'ajoutent au modificateur.
      attacks: new ArrayField(
        new SchemaField({
          name: new StringField({ required: false, blank: true, initial: "" }),
          ability: new StringField({ required: true, initial: "str", choices: ["str", "dex"] }),
          bonus: new NumberField({ required: true, integer: true, initial: 0 }),
          // Attaque magique : ignore les résistances physiques non magiques.
          magic: new BooleanField({ required: true, initial: false }),
          damage: new SchemaField({
            dice: new StringField({ required: false, blank: true, initial: "" }),
            bonus: new NumberField({ required: true, integer: true, initial: 0 }),
            type: new StringField({
              required: false,
              blank: true,
              initial: "",
              choices: Object.keys(DND_CUSTOM.damageTypes)
            })
          }),
          // Dégâts secondaires optionnels, sans modificateur de caractéristique.
          secondaryDamage: new SchemaField({
            dice: new StringField({ required: false, blank: true, initial: "" }),
            type: new StringField({
              required: false,
              blank: true,
              initial: "",
              choices: Object.keys(DND_CUSTOM.damageTypes)
            })
          })
        }),
        // Vide par défaut : un tableau pré-rempli fait échouer `Actor.create`.
        { required: true, initial: [] }
      ),
      // Résistances, immunités et vulnérabilités aux dégâts.
      ...damageAffinitySchema(),
      specialAbilities: new HTMLField({ required: false, blank: true, initial: "" }),
      particularity: new HTMLField({ required: false, blank: true, initial: "" })
    };
  }

  /** Expose le modificateur et le dé d'initiative utilisés par la formule d'initiative partagée. */
  prepareDerivedData() {
    this.attributes.initiativeMod = this.abilities.dex.mod;
    this.attributes.initiativeDice = 1;
  }
}