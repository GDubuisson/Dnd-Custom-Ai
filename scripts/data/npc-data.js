import { DND_CUSTOM } from "../helpers/config.js";
import { ABILITY_KEYS } from "./character-data.js";

const { SchemaField, NumberField, StringField, HTMLField } = foundry.data.fields;

/** Statistique simplifiée d'ennemi/PNJ : un bonus direct (pas de score) ; la sauvegarde vaut ce même bonus. */
function npcAbilityField() {
  return new SchemaField({
    mod: new NumberField({ required: true, integer: true, initial: 0 })
  });
}

function schemaFromKeys(keys, fieldFactory) {
  return Object.fromEntries(keys.map((key) => [key, fieldFactory(key)]));
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
          max: new NumberField({ required: true, integer: true, min: 0, initial: 10 })
        }),
        ac: new SchemaField({
          value: new NumberField({ required: true, integer: true, min: 0, initial: 10 })
        }),
        speed: new NumberField({ required: true, integer: true, min: 0, initial: 30 })
      }),
      // XP rapporté : pré-rempli depuis la table FI -> XP (cf. DND_CUSTOM.challengeRatingXp,
      // hook preUpdateActor dans dnd-custom-ai.js) quand le MJ change l'indice de dangerosité,
      // reste ensuite librement modifiable à la main.
      xpReward: new NumberField({ required: true, integer: true, min: 0, initial: 0 }),
      specialAbilities: new HTMLField({ required: false, blank: true, initial: "" }),
      particularity: new HTMLField({ required: false, blank: true, initial: "" })
    };
  }
}