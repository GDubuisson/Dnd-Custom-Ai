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
        // Choix "Amélioration de caractéristiques ou Don" dus mais pas encore résolus (SRD 5e,
        // cf. DND_CUSTOM.abilityScoreImprovementLevels) : incrémenté à chaque niveau concerné
        // atteint, décrémenté seulement quand un choix est réellement appliqué (Amélioration OU
        // Don accepté) — jamais quand la fenêtre est fermée sans choisir (retour de test :
        // fermer sans choisir faisait perdre le choix pour toujours). Tant que > 0, la fenêtre
        // est reproposée à chaque montée de niveau suivante ET un bouton de rattrapage manuel
        // reste affiché sur la fiche (cf. DndCustomActorSheet#onLevelUp/#onResolvePendingAsi).
        pendingAsiChoices: new NumberField({ required: true, integer: true, min: 0, initial: 0 }),
        // Niveaux d'Exhaustion SRD 5e (0-6) : effets appliqués dans prepareDerivedData
        // (vitesse dès le niveau 2, PV max dès le niveau 4) ; désavantage aux tests/
        // sauvegardes/attaques géré au moment du jet (cf. actor-sheet.js).
        exhaustion: new NumberField({ required: true, integer: true, min: 0, max: 6, initial: 0 }),
        // Règle maison (absente du SRD, demande explicite testeur — retour ANOMALIES_ACTIVES.md,
        // "ne pas laisser abuser des repos courts") : nombre de repos courts pris depuis le
        // dernier repos long. À partir du 4e (celui-ci inclus), chaque repos court supplémentaire
        // ajoute 1 point d'Épuisement (cf. #onRestShort, actor-sheet.js) — le bénéfice normal du
        // repos court (soin de moitié des PV max) reste lui inchangé, quel que soit ce compteur.
        // Remis à zéro uniquement au repos long, jamais par le repos court lui-même.
        shortRestCount: new NumberField({ required: true, integer: true, min: 0, initial: 0 }),
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
      // Emplacements de sorts par niveau (1-9), SRD 5e (cf. spellSlotsForClass, rules.js) : un
      // SchemaField par palier plutôt qu'un pool unique — `max` de chaque palier est entièrement
      // dérivé (classe + niveau, cf. prepareDerivedData) comme PV max/CA/Vitesse ; `value`
      // (charges restantes du palier) est la seule valeur persistée, décrémentée en lançant un
      // sort de ce palier (ou d'un palier inférieur surclassé, cf. actor-sheet.js
      // #onCastSpell/chooseSpellSlotLevel) et restaurée à `max` au repos long (au repos court
      // aussi pour l'Occultiste, Magie de Pacte).
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
        // Nom (texte libre, pas une référence d'Item) du sort actuellement concentré, SRD 5e
        // "un seul sort à la fois" : lancer un nouveau sort à concentration remplace celui-ci
        // (cf. DndCustomActorSheet#onCastSpell) ; un échec de jet de sauvegarde de
        // Constitution après des dégâts subis le vide (cf. dnd-custom-ai.js).
        concentratingOn: new StringField({ required: false, blank: true, initial: "" })
      }),
      // Économie d'action de combat, SRD 5e (cf. FeatureData/SpellData#activation) : une seule
      // réaction utilisable par round, régénérée au début de son propre tour tant qu'un combat
      // Foundry est actif (cf. hooks updateCombat/deleteCombat, dnd-custom-ai.js). Pas de suivi
      // pour l'action/l'action bonus — hors scope, le système ne verrouille pas le tour lui-même.
      combat: new SchemaField({
        reactionAvailable: new BooleanField({ required: true, initial: true }),
        // Rounds restants de Rage (SRD 5e : jusqu'à 10 rounds/1 minute), cf. RAGE_DURATION_ROUNDS
        // et hooks createActiveEffect/updateCombat, dnd-custom-ai.js — 0 = pas de suivi en cours
        // (Rage inactive, ou activée hors combat). Ne modélise QUE la limite de durée, pas la fin
        // anticipée SRD ("un tour sans attaque ni dégât subi"), même parti pris que reactionAvailable
        // ci-dessus.
        rageRoundsRemaining: new NumberField({ required: true, integer: true, min: 0, initial: 0 }),
        // Dernier round de Combat effectivement traité par le décompte de Rage (cf. updateCombat,
        // dnd-custom-ai.js) : rend le décompte idempotent, indépendant du nombre de fois où
        // Foundry redéclenche "updateCombat" avec `round` dans les changements SANS que sa valeur
        // n'ait réellement progressé (ex. plusieurs mises à jour internes lors du démarrage d'un
        // combat) — seul un round strictement supérieur à cette valeur fait avancer le décompte.
        rageLastRound: new NumberField({ required: true, integer: true, min: 0, initial: 0 }),
        // Choix ponctuel et définitif de l'esprit totem (Voie du Cœur sauvage, Barbare — cf.
        // FeatureData#grantsChoice = "totemSpirit", "Aspect de la bête" dans features.json) :
        // vide tant que non choisi (bouton "Choisir" affiché, #onChooseFeatureOption,
        // actor-sheet.js), jamais réinitialisé une fois posé.
        totemSpirit: new StringField({ required: true, blank: true, initial: "", choices: ["bear", "eagle", "wolf"] })
      }),
      biography: new HTMLField({ required: false, blank: true, initial: "" }),
      notes: new HTMLField({ required: false, blank: true, initial: "" })
    };
  }

  /** PV max, CA et Vitesse sont entièrement dérivés (classe/niveau/CON, Dex + armure/
   *  bouclier/accessoires équipés, constante de base) : jamais des valeurs saisies, ni
   *  par le joueur ni par le MJ. Recalculés à chaque préparation de l'Actor, donc toujours à jour. */
  prepareDerivedData() {
    const items = this.parent?.items ?? [];
    const originData = game.dndCustomAi?.origins?.[this.origin];
    const originBonuses = originData?.abilityBonuses ?? {};
    // Don "Doué" (SRD 5e, world-items/feats.json) : +1 Charisme fixe, appliqué automatiquement
    // dès que le personnage possède le don, même principe que le bonus d'Origine ci-dessus (pas
    // de plafond à 20 modélisé, cohérent avec le bonus d'Origine qui n'en applique pas non plus).
    const gracefulChaBonus = hasFeature(items, "Doué") ? 1 : 0;
    // Dons "Athlète"/"Résilient" (FeatureData#offersAbilityChoice/chosenAbility, réglés sur la
    // fiche du don lui-même par le MJ, cf. feature-sheet.hbs) : +1 sur la caractéristique
    // choisie, appliqué automatiquement dès que le choix est réglé. Un même personnage peut
    // posséder les deux (choix indépendants, contrairement à `grantsChoice` qui est ponctuel par
    // Actor) — `.filter()` + `.length` cumule correctement si, par exemple, les deux dons visent
    // la même caractéristique.
    const abilityChoiceFeats = items.filter(
      (item) => item.type === "feature" && item.system?.offersAbilityChoice && item.system?.chosenAbility
    );
    for (const key of ABILITY_KEYS) {
      const featBonus = (key === "cha" ? gracefulChaBonus : 0) + abilityChoiceFeats.filter((item) => item.system.chosenAbility === key).length;
      this.abilities[key].total = this.abilities[key].value + (originBonuses[key] ?? 0) + featBonus;
    }
    // Don "Résilient" seul (parmi les deux ci-dessus) accorde aussi la maîtrise du jet de
    // sauvegarde de la caractéristique choisie (SRD 5e) — ne retire jamais une maîtrise déjà
    // acquise par ailleurs (classe, MJ...), seulement `true` si le don la donne.
    for (const item of abilityChoiceFeats) {
      if (item.name === "Résilient") this.saves[item.system.chosenAbility].proficient = true;
    }

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
    // Don "Tenace" (SRD 5e) : +2 PV max par niveau, recalculé à chaque niveau (pas seulement au
    // niveau d'acquisition — la formule "2×niveau" retombe exactement sur le texte SRD "+2 au
    // niveau d'acquisition, +2 de plus à chaque niveau gagné ensuite" sans avoir à suivre à part
    // le niveau où le don a été pris). Ajouté AVANT le halving d'Exhaustion (exhaustionMaxHp
    // ci-dessous) : l'Exhaustion divise par deux le maximum de PV dans son ensemble, bonus de
    // don inclus, pas seulement les PV de base.
    const toughFeatBonus = hasFeature(items, "Tenace") ? 2 * this.attributes.level : 0;
    this.attributes.hp.max = exhaustionMaxHp(
      maxHitPoints(hitDie, this.attributes.level, conMod) + toughFeatBonus,
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
    // (`"initiative": "1d20 + @attributes.initiativeMod"` dans system.json). Traqueur des
    // ténèbres (sous-classe Rôdeur, "Embuscade des ténèbres") : +2 supplémentaire, appliqué
    // automatiquement dès la sous-classe choisie (disponible seulement à partir du niveau
    // d'obtention SRD de toute façon, cf. DND_CUSTOM.subclassLevel).
    // Don "Alerte" (SRD 5e) : +5 aux jets d'Initiative, appliqué automatiquement — les deux
    // autres clauses du don (jamais surpris, pas d'avantage contre soi du fait d'être inaperçu)
    // restent hors modèle (pas de suivi de "surprise"/visibilité dans ce système), à arbitrer.
    this.attributes.initiativeMod =
      dexMod + (this.subclass === "gloomStalker" ? 2 : 0) + (hasFeature(items, "Alerte") ? 5 : 0);

    // Emplacements de sorts par niveau (cf. schéma ci-dessus) : `value` n'est jamais touché ici,
    // seul `max` de chaque palier est recalculé à chaque préparation. `maxLevel` (plus haut
    // niveau de sort accessible) et `isPactMagic` (Occultiste, Magie de Pacte) ne sont pas
    // persistés (même convention que stealthDisadvantage/initiativeMod ci-dessus) : `maxLevel`
    // sert à limiter les Sorts octroyés automatiquement à la classe/au niveau (cf.
    // helpers/class-content.js), `isPactMagic` à distinguer l'affichage/la récupération au repos
    // court (cf. actor-sheet.js).
    const spellSlots = spellSlotsForClass(this.class, this.attributes.level, game.dndCustomAi?.spellSlotTables);
    for (const level of SPELL_LEVELS) {
      this.spells.slots[level].max = spellSlots.slots[level];
    }
    this.spells.maxLevel = spellSlots.maxSpellLevel;
    this.spells.isPactMagic = spellSlots.isPactMagic;
  }
}

export { ABILITY_KEYS, SKILL_ABILITIES };