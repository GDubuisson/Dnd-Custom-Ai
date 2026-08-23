import { SKILL_ABILITIES, ABILITY_KEYS } from "./character-data.js";
import { currencySchema } from "./shared-schema.js";
import { DND_CUSTOM } from "../helpers/config.js";

const { SchemaField, NumberField, StringField, BooleanField, HTMLField, SetField, ArrayField } = foundry.data.fields;

/** Union de toutes les clés de sous-classe (ex. "champion"), toutes classes confondues — sert de
 *  contrainte `choices` pour FeatureData#subclass ci-dessous. Aplati une seule fois au chargement
 *  du module plutôt qu'à chaque définition de schéma. */
const ALL_SUBCLASS_KEYS = Object.values(DND_CUSTOM.subclasses).flatMap((bySubclass) => Object.keys(bySubclass));

/** Champs communs aux armes/armures : objets physiques qui peuvent être équipés dans un
 *  emplacement de la fiche de personnage (cf. onglet "Équipement"). Poids toujours en kg
 *  (cf. ClaudeFiles/CONCEPTION_FONCTIONNELLE.md > types d'Item). */
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
      // Clé de classe stable (ex. "fighter", cf. DND_CUSTOM.classes, config.js) — PAS un
      // libellé localisé/traduit : la comparaison à `actor.system.class` (grantClassContent,
      // helpers/class-content.js) doit rester correcte quelle que soit la langue active du
      // monde. Vide pour une Capacité universelle (system.universal, ex. Attaque d'opportunité).
      class: new StringField({ required: false, blank: true, initial: "", choices: Object.keys(DND_CUSTOM.classes) }),
      // Clé de sous-classe stable (ex. "champion", cf. DND_CUSTOM.subclasses, config.js) — même
      // principe que `class` ci-dessus : vide pour une Capacité de classe de base, renseignée
      // pour une Capacité propre à une sous-classe précise. grantClassContent ne l'octroie
      // qu'une fois actor.system.subclass (déjà une clé, jamais un libellé) égal à cette valeur.
      subclass: new StringField({ required: false, blank: true, initial: "", choices: ALL_SUBCLASS_KEYS }),
      // Capacité universelle (ex. Attaque d'opportunité) : octroyée à TOUTE classe au niveau
      // requis, `class` restant vide (pas propre à une classe précise) — cf. grantClassContent,
      // helpers/class-content.js, qui l'inclut en plus du filtrage habituel par classe.
      universal: new BooleanField({ required: true, initial: false }),
      level: new NumberField({ required: true, integer: true, min: 1, initial: 1 }),
      description: new HTMLField({ required: false, blank: true, initial: "" }),
      // Type d'action SRD 5e nécessaire pour utiliser cette Capacité (cf. DND_CUSTOM.activationTypes,
      // config.js). "reaction" active le suivi d'économie d'action (cf. system.combat.reactionAvailable,
      // CharacterData ; #consumeReaction, actor-sheet.js) : une seule réaction utilisable par round,
      // régénérée au début de son propre tour (hook updateCombat, dnd-custom-ai.js).
      activation: new StringField({
        required: true,
        initial: "action",
        choices: ["action", "bonusAction", "reaction", "free"]
      }),
      // Texte libre décrivant quand déclencher une Capacité "Réaction" (ex. "Quand une créature
      // que vous voyez à moins de 18 m est touchée par une attaque") — ce système ne détecte/
      // déclenche jamais automatiquement un trigger (hors scope "combat automatisé", cf.
      // SpellData#attack ci-dessous), affiché en aide au joueur sur l'onglet Capacités/Sorts.
      reactionTrigger: new StringField({ required: false, blank: true, initial: "" }),
      requiresRoll: new BooleanField({ required: true, initial: false }),
      rollFormula: new StringField({ required: false, blank: true, initial: "" }),
      // Capacité/don dont le jet (`requiresRoll`/`rollFormula` ci-dessus) est un SOIN à
      // appliquer à une cible (ex. don Guérisseur) plutôt qu'un simple jet informatif posté en
      // chat sans suite (#onRollFeature, actor-sheet.js) : marque le message de chat du même
      // flag `healRoll` que SpellData#heal (cf. rolls.js > rollHeal), ce qui affiche
      // automatiquement le bouton "Appliquer le soin" déjà existant pour les sorts de soin
      // (hook renderChatMessageHTML, dnd-custom-ai.js) — aucune nouvelle logique d'application
      // à écrire, juste réutiliser le pipeline déjà en place. `false` pour l'immense majorité
      // des Capacités/Dons.
      healsTarget: new BooleanField({ required: true, initial: false }),
      // Capacité/don dont le jet (`requiresRoll`/`rollFormula` ci-dessus) RÉDUIT les dégâts
      // subis par une cible plutôt que de simplement les infliger/soigner (ex. Déviation de
      // projectiles, Flamme protectrice) : marque le message de chat d'un flag `damageReduction`
      // dédié (hook renderChatMessageHTML, dnd-custom-ai.js), qui affiche un bouton "Appliquer
      // la réduction" — réutilise directement `applyHealToTargets` (même effet mécanique qu'un
      // soin : ajoute des PV à la cible actuellement ciblée, plafonné au max), seul le libellé
      // du bouton diffère pour rester clair en jeu. `false` pour l'immense majorité des
      // Capacités/Dons.
      reducesDamage: new BooleanField({ required: true, initial: false }),
      // Capacité qui inflige un jet de sauvegarde à CHAQUE cible actuellement ciblée (ex.
      // Canalisation divine "Repousser les morts-vivants", Clerc) — même mécanisme que
      // SpellData#save (rules.js > targetSaveModifier), mais pour une Capacité au lieu d'un
      // Sort : le lanceur ne roule jamais lui-même, seul le DD (spellSaveDC de sa
      // caractéristique d'incantation de classe) compte face au jet propre de chaque cible
      // (#onRollFeatureSave, actor-sheet.js). Vide = pas de jet de sauvegarde, comportement
      // `#onRollFeature` inchangé (l'immense majorité des Capacités).
      savingThrow: new StringField({ required: false, blank: true, initial: "", choices: ABILITY_KEYS }),
      // Condition (cf. DND_CUSTOM.conditions, config.js) appliquée à la cible en cas d'ÉCHEC du
      // jet ci-dessus (ex. "frightened" pour Repousser les morts-vivants) — vide = aucun effet
      // appliqué automatiquement, juste le résultat du jet posté en chat.
      appliesCondition: new StringField({
        required: false,
        blank: true,
        initial: "",
        choices: DND_CUSTOM.conditions.map((condition) => condition.id)
      }),
      // Types de créature requis pour subir l'effet ci-dessus (ex. {"undead"} pour Repousser les
      // morts-vivants, {"fiend","undead"} pour Repousser les impies — SRD 5e, plusieurs
      // Capacités de ce type visent 2 types à la fois) : comparé à `NpcData#creatureType` de la
      // cible, jamais présent sur un PJ (`CharacterData` n'a pas ce champ) donc jamais concerné.
      // Ensemble VIDE = pas de restriction de type (ex. Abjurer un ennemi, Paladin Vengeance,
      // qui vise n'importe quelle créature).
      requiresCreatureTypes: new SetField(new StringField({ choices: Object.keys(DND_CUSTOM.creatureTypes) }), {
        required: true,
        initial: []
      }),
      // Capacité qui récupère automatiquement des emplacements de sorts au premier repos court
      // de la journée (ex. Récupération arcanique du Magicien, Récupération naturelle du
      // Druide de la Terre) : `rollFormula` ci-dessus calcule le total de NIVEAUX récupérables
      // (ex. "ceil(@attributes.level/2)"), consommé par #onRestShort (actor-sheet.js) qui ouvre
      // une fenêtre de répartition entre paliers (cf. chooseSpellSlotRecovery,
      // spell-slot-choice.js) plutôt que par un bouton de jet manuel séparé — retour de test,
      // le texte SRD de ces deux Capacités ("une fois par jour, LORS D'UN REPOS COURT") n'était
      // suivi par aucun code, le bouton précédent restait cliquable à tout moment. `false` pour
      // l'immense majorité des Capacités.
      recoversSpellSlots: new BooleanField({ required: true, initial: false }),
      // Capacité utilisable seulement quand un état particulier (cf. DND_CUSTOM.conditions,
      // config.js) est actif sur l'Actor — ex. Frénésie (Barbare Berserker), qui nécessite
      // d'être En Rage. Retour de test (lot 3, point 5) : grisée par défaut sur l'onglet
      // Capacités, dégrisée automatiquement dès que l'état correspondant devient actif (cf.
      // actor-sheet.js > featureDisabled, handlebars-helpers.js) — pas de contrôle manuel
      // séparé à faire par le joueur, la bascule de l'état (onglet Statistiques) suffit. Vide =
      // pas de restriction (comportement inchangé pour l'immense majorité des Capacités).
      requiresState: new StringField({
        required: false,
        blank: true,
        initial: "",
        choices: DND_CUSTOM.conditions.map((condition) => condition.id)
      }),
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
      }),
      // Réserve de charges (`uses` ci-dessus) dont le MAXIMUM progresse avec le niveau du
      // personnage au lieu de rester fixe (ex. Ki du Moine, Sorcellerie innée de l'Ensorceleur —
      // SRD 5e : dans les deux cas, `max` = niveau du personnage dans cette classe, à partir du
      // niveau d'octroi de la Capacité). Restriction de conception levée le 2026-08-22 (ces deux
      // réserves étaient figées à leur valeur d'octroi) : `uses.max` recalculé automatiquement
      // dans #prepareDerivedData ci-dessous à chaque niveau, sans multiclassage modélisé
      // (`attributes.level` = niveau dans l'unique classe du personnage, cf.
      // CONCEPTION_FONCTIONNELLE.md). `false` pour l'immense majorité des Capacités/Dons, qui
      // gardent un `uses.max` fixe.
      scalesWithLevel: new BooleanField({ required: true, initial: false }),
      // Technique consommant 1 charge d'une AUTRE Capacité "réservoir" à charges partagées
      // (ex. les techniques de Moine — Rafale de coups, Défense patiente... — consomment
      // toutes le même pool "Ki" plutôt que d'avoir chacune leurs propres charges) : nom
      // exact de cette Capacité réservoir sur l'Actor (même convention texte libre que
      // `class`/`subclass` ci-dessus), vide si cette Capacité n'a pas ce genre de coût.
      costsResource: new StringField({ required: false, blank: true, initial: "" }),
      // Capacité qui propose un choix ponctuel et définitif au joueur (ex. "Aspect de la bête",
      // Voie du Cœur sauvage, Barbare — choix d'un esprit totem) : clé du champ correspondant
      // sous `CharacterData#combat` où le choix est persisté une fois fait (ex. "totemSpirit"
      // -> `system.combat.totemSpirit`) — vide pour l'immense majorité des Capacités, qui n'ont
      // pas ce genre de choix. Bouton "Choisir" affiché (onglet Capacités/Sorts, cf.
      // #onChooseFeatureOption, actor-sheet.js) tant que le champ visé est encore vide,
      // disparaît une fois le choix fait (verrouillé, même logique que le choix de sous-classe).
      grantsChoice: new StringField({ required: false, blank: true, initial: "", choices: ["totemSpirit"] }),
      // Capacité qui invoque un compagnon animal (ex. "Compagnon animal", Maître des bêtes,
      // Rôdeur) : bouton "Invoquer le compagnon" affiché (onglet Capacités/Sorts, cf.
      // #onSummonCompanion, actor-sheet.js/helpers/companion.js) une seule fois (flag
      // `beastCompanionCreated` posé sur l'Actor à la création, jamais recréé ensuite même si
      // le compagnon est supprimé). `false` pour l'immense majorité des Capacités.
      summonsCompanion: new BooleanField({ required: true, initial: false }),
      // Incantation mineure de sous-classe (ex. "Incantation mineure", Chevalier occulte,
      // Guerrier) : liste de NOMS de Sorts (texte libre, comme costsResource ci-dessus — ce sont
      // des Sorts nommément désignés par la sous-classe, pas un filtre par classe/niveau)
      // octroyés automatiquement avec cette Capacité, même si la classe n'est pas dans
      // DND_CUSTOM.spellcastingClasses (cf. grantClassContent, helpers/class-content.js). Vide
      // pour l'immense majorité des Capacités.
      grantsSpells: new SetField(new StringField({ blank: false }), { required: true, initial: [] }),
      // Capacité qui propose un choix de manœuvre À CHAQUE utilisation (ex. "Dés de manœuvre",
      // Maître de guerre, Guerrier) : contrairement à grantsChoice (choix ponctuel et définitif
      // une seule fois), ce choix est reposé à chaque charge dépensée — cf. #onUseManeuver,
      // actor-sheet.js, et DND_CUSTOM.maneuvers, config.js. `false` pour l'immense majorité des
      // Capacités.
      offersManeuverChoice: new BooleanField({ required: true, initial: false }),
      // Don qui laisse le joueur choisir UNE caractéristique à améliorer à l'octroi (ex.
      // Athlète : Force ou Dextérité ; Résilient : n'importe laquelle, avec en plus la maîtrise
      // du jet de sauvegarde correspondant) — `false` pour l'immense majorité des Capacités/
      // Dons. Contrairement à `grantsChoice` (choix ponctuel posé sur l'ACTOR, une seule fois
      // par personnage, ex. totemSpirit), ce choix est posé sur ce DON lui-même : un personnage
      // pourrait posséder à la fois Athlète et Résilient, chacun avec son propre choix.
      offersAbilityChoice: new BooleanField({ required: true, initial: false }),
      // Caractéristique choisie (cf. offersAbilityChoice ci-dessus) — réglée sur la fiche de ce
      // don lui-même (réservée au MJ comme le reste de cette fiche, cf. feature-sheet.hbs), lue
      // par CharacterData#prepareDerivedData pour appliquer le bonus automatiquement. Vide tant
      // que non choisi (aucun bonus appliqué).
      chosenAbility: new StringField({ required: false, blank: true, initial: "", choices: ABILITY_KEYS }),
      // Don "Magie d'initié" (SRD 5e) : propose un choix en PLUSIEURS étapes (classe lanceuse,
      // 2 tours de magie et 1 sort de niveau 1 de cette classe) plutôt qu'un simple bonus dérivé
      // — cf. chooseInitiateMagicSpells (helpers/initiate-magic-choice.js) et
      // #onChooseInitiateMagic (actor-sheet.js). Bouton "Choisir" affiché tant que
      // `chosenLevelOneSpell` est vide (même convention que grantsChoice/offersAbilityChoice
      // ci-dessus). `false` pour l'immense majorité des Capacités/Dons.
      offersSpellChoice: new BooleanField({ required: true, initial: false }),
      // Classe choisie (cf. offersSpellChoice) — clé stable (ex. "wizard"), vide tant que non
      // choisie ; sert uniquement d'affichage/traçabilité, la liste réelle proposée au joueur
      // (Barde/Clerc/Druide/Ensorceleur/Occultiste/Magicien, texte du don) est en dur dans
      // initiate-magic-choice.js.
      chosenSpellClass: new StringField({ required: false, blank: true, initial: "", choices: DND_CUSTOM.spellcastingClasses }),
      // Les 2 tours de magie choisis (noms de Sorts, texte libre comme costsResource/
      // grantsSpells ci-dessus) — vide tant que non choisis.
      chosenCantrips: new ArrayField(new StringField({ blank: false }), { required: true, initial: [] }),
      // Le sort de niveau 1 choisi : SRD 5e, lançable une fois GRATUITEMENT (sans dépenser
      // d'emplacement) entre deux repos longs — réutilise directement `uses` ci-dessus (réglé à
      // max:1/recharge:"longRest" au moment du choix) comme charge de ce cast gratuit, consommée
      // par #onCastSpell (actor-sheet.js) qui reconnaît ce Sort par son nom exact. Au-delà de ce
      // premier cast gratuit, le sort redevient un sort normal (décompte un emplacement du
      // personnage comme n'importe quel autre) — approximation assumée pour une classe non
      // jouée par le personnage (multiclassage non modélisé, cf. CONCEPTION_FONCTIONNELLE.md).
      chosenLevelOneSpell: new StringField({ required: false, blank: true, initial: "" }),
      // Capacité piochée dans un grand pool d'options propre à une classe (ex. les Invocations
      // occultes de l'Occultiste, SRD 5e : liste de 30+ pouvoirs dont seul un sous-ensemble est
      // connu à la fois, le nombre progressant avec le niveau) : `class`/`level` restent
      // renseignés normalement (affichage/cohérence, cf. tests/data/consistency.test.js), mais
      // `grantClassContent` (helpers/class-content.js) exclut explicitement toute Capacité
      // `manualOnly` de l'octroi automatique — sinon TOUTES les options du pool seraient
      // octroyées d'un coup à chaque personnage de cette classe dès le niveau atteint, alors que
      // le joueur n'en connaît qu'une poignée à la fois. Même esprit que les langues "special"
      // (jamais auto-octroyées) : à glisser manuellement depuis le compendium Capacités une fois
      // choisie. `false` pour l'immense majorité des Capacités.
      manualOnly: new BooleanField({ required: true, initial: false }),
      // Invocation occulte "Salve implacable" (Agonizing Blast, Occultiste) — SEULE des
      // Invocations occultes mécanisée (2026-08-23) : nom exact du Sort dont les dégâts
      // reçoivent un bonus (texte libre, même convention que costsResource/grantsSpells
      // ci-dessus), lu par #onRollSpellDamage (actor-sheet.js) pour ajouter le modificateur de
      // `boostsSpellDamageAbility` ci-dessous au jet de dégâts de CE Sort précis. Vide pour
      // l'immense majorité des Capacités.
      boostsSpellDamage: new StringField({ required: false, blank: true, initial: "" }),
      // Caractéristique dont le modificateur est ajouté (cf. boostsSpellDamage ci-dessus) —
      // vide tant que boostsSpellDamage est vide.
      boostsSpellDamageAbility: new StringField({ required: false, blank: true, initial: "", choices: ABILITY_KEYS })
    };
  }

  /** Réserve à progression (cf. scalesWithLevel ci-dessus) : `uses.max` recalculé au niveau
   *  actuel du personnage propriétaire, jamais persisté (pure donnée dérivée, comme
   *  CharacterData#abilities.<clé>.mod) — `value` (charges restantes) n'est jamais touché ici,
   *  seul le plafond change. `this.parent` (TypeDataModel#parent) est l'ITEM lui-même, pas
   *  l'Actor — piège rencontré en développant : `this.parent.actor` (Item#actor, natif Foundry)
   *  est l'Actor propriétaire quand cet Item est embarqué sur une fiche, `null`/`undefined`
   *  pour un Item encore dans un compendium/le monde (hors fiche : ne fait rien dans ce cas,
   *  `uses.max` garde sa valeur JSON d'origine). */
  prepareDerivedData() {
    const level = this.parent?.actor?.system?.attributes?.level;
    if (this.scalesWithLevel && level) this.uses.max = level;
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
      // Classes pouvant apprendre ce sort (SRD 5e, liste de sorts par classe) : ensemble de clés
      // de classe stables (ex. {"sorcerer", "wizard"}, cf. DND_CUSTOM.classes, config.js) — même
      // principe que FeatureData.class (clé stable, jamais un libellé localisé/traduit), mais au
      // pluriel puisqu'un sort n'est pas exclusif à une classe contrairement à une Capacité.
      // Utilisé par grantClassContent (helpers/class-content.js) pour l'attribution automatique
      // à la création du personnage et à la montée de niveau.
      classes: new SetField(new StringField({ choices: Object.keys(DND_CUSTOM.classes) })),
      level: new NumberField({ required: true, integer: true, min: 0, max: 9, initial: 1 }),
      details: new StringField({ required: false, blank: true, initial: "" }),
      // Type d'action SRD 5e nécessaire pour lancer ce sort (cf. FeatureData#activation
      // ci-dessus, même choix/même mécanique de suivi de réaction).
      activation: new StringField({
        required: true,
        initial: "action",
        choices: ["action", "bonusAction", "reaction", "free"]
      }),
      reactionTrigger: new StringField({ required: false, blank: true, initial: "" }),
      concentration: new BooleanField({ required: true, initial: false }),
      ritual: new BooleanField({ required: true, initial: false }),
      // Sort nécessitant un jet d'attaque (ex. Trait de feu), sur le même principe que les
      // armes (cf. WeaponData ci-dessus) : le bouton "Lancer" propose alors un jet d'attaque
      // (1d20 + spellAttackBonus, rules.js) puis un jet de dégâts, au lieu de se contenter de
      // décompter une charge et poster la description (cf. #onCastSpell, actor-sheet.js).
      attack: new BooleanField({ required: true, initial: false }),
      // Sort à jet de sauvegarde de la CIBLE (ex. Boule de feu), pas du lanceur — retour de
      // test (ANOMALIES_ACTIVES.md, cadré explicitement avec l'utilisateur le 2026-08-21) :
      // longtemps volontairement exclu comme "combat automatisé", mais le scope réellement
      // exclu (CONCEPTION_FONCTIONNELLE.md) ne couvre que la grille tactique et la réaction en
      // pop-in générique — une simple comparaison déterministe à une valeur statique (le DD) est
      // déjà acceptée pour les jets d'attaque (cf. `attack`/compareToTargetAc, rollCheck dans
      // rolls.js). `#onCastSpell` lance donc 1d20 + modificateur de sauvegarde POUR CHAQUE cible
      // actuellement ciblée (rules.js > targetSaveModifier) et poste le résultat au nom de la
      // cible — jamais une interruption du client de la cible, même niveau d'automatisation que
      // l'attaque. `ability` vide = sort sans sauvegarde (comportement par défaut, l'immense
      // majorité des sorts). `halfOnSave` : dégâts réduits de moitié en cas de réussite (ex.
      // Boule de feu) plutôt qu'aucun effet (ex. Moqueries cruelles) — n'affecte que le texte du
      // résultat affiché, l'application réelle des dégâts (moitié ou plein) reste manuelle via
      // le bouton "Appliquer les dégâts" générique, comme pour une attaque qui touche/rate déjà
      // aujourd'hui (ce bouton n'a jamais tenu compte du résultat Touche/Rate non plus). Mutuel-
      // lement exclusif avec `attack`/`heal` ci-dessous en usage normal (jamais les deux en SRD).
      save: new SchemaField({
        ability: new StringField({ required: false, blank: true, initial: "", choices: ABILITY_KEYS }),
        halfOnSave: new BooleanField({ required: true, initial: false })
      }),
      damage: new SchemaField({
        dice: new StringField({ required: false, blank: true, initial: "" }),
        type: new StringField({ required: false, blank: true, initial: "" })
      }),
      // Sort de soin (ex. Mot de guérison, Soin des blessures) : retour de test, ces sorts
      // décrivaient un soin en dés dans leur description mais ne lançaient réellement aucun dé
      // ni n'appliquaient de PV — `#onCastSpell` (actor-sheet.js) lance ce dé + le modificateur
      // de caractéristique d'incantation (SRD 5e, contrairement aux dégâts d'un sort qui n'ajoutent
      // pas ce modificateur, cf. `attack`/`damage` ci-dessus) via `rollHeal` (rolls.js), puis
      // affiche un bouton "Appliquer le soin" (dnd-custom-ai.js) sur les cibles ciblées — même
      // mécanique que `damage`/`attack`, en PV positifs. Un sort peut cumuler `attack` (jet
      // d'attaque + dégâts) OU `heal` (soin automatique, sans jet d'attaque), jamais les deux en
      // SRD 5e.
      heal: new SchemaField({
        dice: new StringField({ required: false, blank: true, initial: "" })
      }),
      // Sort émettant de la lumière (ex. Lumière) : mêmes unités que GearData#use.light
      // (`dim` = rayon SUPPLÉMENTAIRE au-delà de `bright`, formulation SRD) — allume le(s)
      // token(s) du lanceur au moment du lancer (cf. #onCastSpell, actor-sheet.js). Vide
      // (0/0) pour l'immense majorité des sorts, qui n'ont aucun effet sur la lumière du
      // token. Retour de test : rien ne liait les sorts de lumière (Lumière...) au système de
      // lumière des tokens, contrairement aux objets `gear` équivalents (Torche...).
      light: new SchemaField({
        bright: new NumberField({ required: true, min: 0, initial: 0 }),
        dim: new NumberField({ required: true, min: 0, initial: 0 })
      }),
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
