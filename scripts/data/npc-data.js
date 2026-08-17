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
        // Contrairement à CharacterData (vitesse dérivée d'une formule interne en pieds SRD,
        // convertie en mètres seulement à l'affichage via le helper formatSpeed), la vitesse
        // d'un PNJ est un champ saisi directement par le MJ sans formule : stockée et affichée
        // en mètres pour rester cohérente avec le reste de la fiche (retour de test — un PNJ
        // affichait "30", valeur en pieds SRD, au lieu de l'équivalent 9 m attendu ici).
        speed: new NumberField({ required: true, integer: true, min: 0, initial: 9 })
      }),
      // XP rapporté : pré-rempli depuis la table FI -> XP (cf. DND_CUSTOM.challengeRatingXp,
      // hook preUpdateActor dans dnd-custom-ai.js) quand le MJ change l'indice de dangerosité,
      // reste ensuite librement modifiable à la main.
      xpReward: new NumberField({ required: true, integer: true, min: 0, initial: 0 }),
      // Profil d'attaque simplifié (retour de test — un PNJ ne pouvait pas attaquer du tout) :
      // UN seul profil par PNJ, sur le modèle des stat-blocks SRD 5e ("Bite. Melee Weapon
      // Attack: +4 to hit... Hit: 1d6+2 piercing damage") — pas un système d'armes/inventaire
      // complet comme CharacterData/WeaponData, cohérent avec le reste de NpcData (tout est déjà
      // un bonus direct saisi par le MJ, jamais dérivé). `ability` : au choix du MJ (Force ou
      // Dextérité), pilote à la fois le bonus d'attaque ET de dégâts (SRD 5e, même caractéristique
      // pour les deux). `bonus`/`damage.bonus` : bonus fixes SUPPLÉMENTAIRES au-delà du
      // modificateur de caractéristique (ex. bonus de maîtrise déjà inclus dans un bloc SRD).
      attack: new SchemaField({
        name: new StringField({ required: false, blank: true, initial: "" }),
        ability: new StringField({ required: true, initial: "str", choices: ["str", "dex"] }),
        bonus: new NumberField({ required: true, integer: true, initial: 0 }),
        damage: new SchemaField({
          dice: new StringField({ required: false, blank: true, initial: "" }),
          bonus: new NumberField({ required: true, integer: true, initial: 0 }),
          type: new StringField({
            required: false,
            blank: true,
            initial: "",
            choices: Object.keys(DND_CUSTOM.damageTypes)
          })
        })
      }),
      specialAbilities: new HTMLField({ required: false, blank: true, initial: "" }),
      particularity: new HTMLField({ required: false, blank: true, initial: "" })
    };
  }

  /** Modificateur d'Initiative : donnée dérivée non persistée (le bonus de Dextérité est déjà
   *  la valeur finale pour un PNJ, cf. npcAbilityField), exposée pour la formule d'initiative
   *  du Combat Tracker Foundry (`"initiative": "1d20 + @attributes.initiativeMod"` dans
   *  system.json — même convention que CharacterData). */
  prepareDerivedData() {
    this.attributes.initiativeMod = this.abilities.dex.mod;
  }
}