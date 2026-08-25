import { DND_CUSTOM } from "../helpers/config.js";
import { ABILITY_KEYS } from "./character-data.js";
import { damageAffinitySchema } from "./shared-schema.js";

const { SchemaField, NumberField, StringField, HTMLField, BooleanField, SetField, ArrayField } = foundry.data.fields;

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
          max: new NumberField({ required: true, integer: true, min: 0, initial: 10 }),
          // Points de vie temporaires (même champ que CharacterData#hp.temp, absorbés en
          // premier par `applyDamageToTargets`, dnd-custom-ai.js) — quasi toujours à 0 pour un
          // PNJ ordinaire, sert à "Forme sauvage de combat" (Cercle de la Lune, Druide 2) : la
          // réserve de PV d'un Actor "wildShapeForm" (même NpcData) sert de 2e réserve pendant
          // la transformation, cf. #onEnterWildShape (actor-sheet.js).
          temp: new NumberField({ required: true, integer: true, min: 0, initial: 0 })
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
      // Profils d'attaque simplifiés (retour de test — un PNJ ne pouvait pas attaquer du tout ;
      // liste depuis le chantier "mécaniques jamais modélisées" point 4/6, 2026-08-25, cadré avec
      // l'utilisateur — un vrai bloc de statistiques SRD 5e a souvent plusieurs attaques
      // distinctes, ex. "Morsure. ... Griffe. ..."). PLUSIEURS profils par PNJ désormais (`attacks`,
      // remplace l'ancien `attack` unique — cf. `ensureNpcAttacksArray`, dnd-custom-ai.js, pour la
      // migration des PNJ déjà créés), chacun sur le modèle des stat-blocks SRD 5e ("Bite. Melee
      // Weapon Attack: +4 to hit... Hit: 1d6+2 piercing damage") — pas un système d'armes/
      // inventaire complet comme CharacterData/WeaponData, cohérent avec le reste de NpcData (tout
      // est déjà un bonus direct saisi par le MJ, jamais dérivé). `ability` : au choix du MJ (Force
      // ou Dextérité), pilote à la fois le bonus d'attaque ET de dégâts (SRD 5e, même
      // caractéristique pour les deux). `bonus`/`damage.bonus` : bonus fixes SUPPLÉMENTAIRES au-delà
      // du modificateur de caractéristique (ex. bonus de maîtrise déjà inclus dans un bloc SRD).
      // Chaque attaque garde son propre jet (bouton dédié), résolue individuellement par le MJ —
      // fidèle au SRD (jets d'attaque séparés pour "Morsure"/"Griffe", jamais un seul jet combiné).
      attacks: new ArrayField(
        new SchemaField({
          name: new StringField({ required: false, blank: true, initial: "" }),
          ability: new StringField({ required: true, initial: "str", choices: ["str", "dex"] }),
          bonus: new NumberField({ required: true, integer: true, initial: 0 }),
          // Chantier "types de dégâts" (Phase 1, 2026-08-24) : même contournement de résistance
          // physique "non magique" qu'une arme de PJ (WeaponData#magic, item-data.js) — une
          // attaque de PNJ peut elle aussi être magique (ex. une créature dont les attaques
          // naturelles sont explicitement magiques au SRD).
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
          // Chantier "types de dégâts" (Phase 3, 2026-08-24) : dégâts BONUS d'une attaque aux
          // propriétés magiques (ex. une morsure qui inflige perforant + poison), optionnels
          // (`dice` vide = pas de composant secondaire) — même principe que WeaponData#
          // secondaryDamage (item-data.js), jamais de modificateur de caractéristique ajouté.
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
        // `initial: []` (PAS `[{}]`) — retour de test : un tableau par défaut contenant un
        // objet non-vide a fait échouer silencieusement `Actor.create` pour tout PNJ neuf sans
        // `system.attacks` explicite dans les données de création (cause exacte non élucidée,
        // aucune erreur serveur ; `[]` s'est révélé fiable, cohérent avec les autres champs
        // `ArrayField`/`SetField` de ce système, ex. `requiresCreatureTypes`, item-data.js). Un
        // PNJ neuf démarre donc SANS aucune attaque configurée — bouton "Ajouter une attaque"
        // (#onAddNpcAttack, npc-sheet.js) pour en poser une première, cohérent avec la
        // philosophie "vide par défaut" déjà suivie ailleurs dans ce système.
        { required: true, initial: [] }
      ),
      // Chantier "types de dégâts" (Phase 1, 2026-08-24) : cf. damageAffinitySchema
      // (shared-schema.js) pour le détail — champ générique partagé avec CharacterData.
      ...damageAffinitySchema(),
      specialAbilities: new HTMLField({ required: false, blank: true, initial: "" }),
      particularity: new HTMLField({ required: false, blank: true, initial: "" })
    };
  }

  /** Modificateur d'Initiative : donnée dérivée non persistée (le bonus de Dextérité est déjà
   *  la valeur finale pour un PNJ, cf. npcAbilityField), exposée pour la formule d'initiative
   *  du Combat Tracker Foundry (cf. system.json > "initiative" — même convention que
   *  CharacterData). `initiativeDice` toujours à 1 ici (jamais de "Instinct sauvage" sur un
   *  PNJ) : requis pour que la formule partagée (`@attributes.initiativeDice`) reste valide
   *  quel que soit le type d'Actor Combattant. */
  prepareDerivedData() {
    this.attributes.initiativeMod = this.abilities.dex.mod;
    this.attributes.initiativeDice = 1;
  }
}