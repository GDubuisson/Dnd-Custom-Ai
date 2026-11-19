export const DND_CUSTOM = {};

DND_CUSTOM.abilities = {
  str: "DND_CUSTOM.Abilities.str",
  dex: "DND_CUSTOM.Abilities.dex",
  con: "DND_CUSTOM.Abilities.con",
  int: "DND_CUSTOM.Abilities.int",
  wis: "DND_CUSTOM.Abilities.wis",
  cha: "DND_CUSTOM.Abilities.cha"
};

/** Abréviations localisées des caractéristiques (FOR, DEX…). */
DND_CUSTOM.abilitiesShort = {
  str: "DND_CUSTOM.Abilities.Short.str",
  dex: "DND_CUSTOM.Abilities.Short.dex",
  con: "DND_CUSTOM.Abilities.Short.con",
  int: "DND_CUSTOM.Abilities.Short.int",
  wis: "DND_CUSTOM.Abilities.Short.wis",
  cha: "DND_CUSTOM.Abilities.Short.cha"
};

DND_CUSTOM.skills = {
  acrobatics: "DND_CUSTOM.Skills.acrobatics",
  animalHandling: "DND_CUSTOM.Skills.animalHandling",
  arcana: "DND_CUSTOM.Skills.arcana",
  athletics: "DND_CUSTOM.Skills.athletics",
  deception: "DND_CUSTOM.Skills.deception",
  history: "DND_CUSTOM.Skills.history",
  insight: "DND_CUSTOM.Skills.insight",
  intimidation: "DND_CUSTOM.Skills.intimidation",
  investigation: "DND_CUSTOM.Skills.investigation",
  medicine: "DND_CUSTOM.Skills.medicine",
  nature: "DND_CUSTOM.Skills.nature",
  perception: "DND_CUSTOM.Skills.perception",
  performance: "DND_CUSTOM.Skills.performance",
  persuasion: "DND_CUSTOM.Skills.persuasion",
  religion: "DND_CUSTOM.Skills.religion",
  sleightOfHand: "DND_CUSTOM.Skills.sleightOfHand",
  stealth: "DND_CUSTOM.Skills.stealth",
  survival: "DND_CUSTOM.Skills.survival"
};

/** Les 12 classes SRD. */
DND_CUSTOM.classes = {
  barbarian: "DND_CUSTOM.Classes.barbarian",
  bard: "DND_CUSTOM.Classes.bard",
  cleric: "DND_CUSTOM.Classes.cleric",
  druid: "DND_CUSTOM.Classes.druid",
  fighter: "DND_CUSTOM.Classes.fighter",
  monk: "DND_CUSTOM.Classes.monk",
  paladin: "DND_CUSTOM.Classes.paladin",
  ranger: "DND_CUSTOM.Classes.ranger",
  rogue: "DND_CUSTOM.Classes.rogue",
  sorcerer: "DND_CUSTOM.Classes.sorcerer",
  warlock: "DND_CUSTOM.Classes.warlock",
  wizard: "DND_CUSTOM.Classes.wizard"
};

/** Classes lanceuses de sorts : l'onglet « Capacités » devient « Sorts ». */
DND_CUSTOM.spellcastingClasses = ["bard", "cleric", "druid", "paladin", "sorcerer", "warlock", "wizard"];

/** Icône FontAwesome de l'en-tête d'ambiance de chaque classe. */
DND_CUSTOM.classFlavorIcon = {
  barbarian: "fa-fire",
  bard: "fa-music",
  cleric: "fa-sun",
  druid: "fa-paw",
  fighter: "fa-shield-halved",
  monk: "fa-hand-fist",
  paladin: "fa-cross",
  ranger: "fa-crosshairs",
  rogue: "fa-mask",
  sorcerer: "fa-wand-magic-sparkles",
  warlock: "fa-skull",
  wizard: "fa-hat-wizard"
};

/** Sous-classes par classe : clé de classe -> clé de sous-classe -> clé de localisation. */
DND_CUSTOM.subclasses = {
  barbarian: {
    berserker: "DND_CUSTOM.Subclasses.barbarian.berserker",
    wildheart: "DND_CUSTOM.Subclasses.barbarian.wildheart",
    wildMagic: "DND_CUSTOM.Subclasses.barbarian.wildMagic"
  },
  bard: {
    lore: "DND_CUSTOM.Subclasses.bard.lore",
    swords: "DND_CUSTOM.Subclasses.bard.swords",
    valour: "DND_CUSTOM.Subclasses.bard.valour"
  },
  cleric: {
    life: "DND_CUSTOM.Subclasses.cleric.life",
    light: "DND_CUSTOM.Subclasses.cleric.light",
    trickery: "DND_CUSTOM.Subclasses.cleric.trickery"
  },
  druid: {
    land: "DND_CUSTOM.Subclasses.druid.land",
    moon: "DND_CUSTOM.Subclasses.druid.moon",
    spores: "DND_CUSTOM.Subclasses.druid.spores"
  },
  fighter: {
    champion: "DND_CUSTOM.Subclasses.fighter.champion",
    battleMaster: "DND_CUSTOM.Subclasses.fighter.battleMaster",
    eldritchKnight: "DND_CUSTOM.Subclasses.fighter.eldritchKnight"
  },
  monk: {
    openHand: "DND_CUSTOM.Subclasses.monk.openHand",
    shadow: "DND_CUSTOM.Subclasses.monk.shadow",
    fourElements: "DND_CUSTOM.Subclasses.monk.fourElements"
  },
  paladin: {
    devotion: "DND_CUSTOM.Subclasses.paladin.devotion",
    ancients: "DND_CUSTOM.Subclasses.paladin.ancients",
    vengeance: "DND_CUSTOM.Subclasses.paladin.vengeance"
  },
  ranger: {
    hunter: "DND_CUSTOM.Subclasses.ranger.hunter",
    beastmaster: "DND_CUSTOM.Subclasses.ranger.beastmaster",
    gloomStalker: "DND_CUSTOM.Subclasses.ranger.gloomStalker"
  },
  rogue: {
    thief: "DND_CUSTOM.Subclasses.rogue.thief",
    swashbuckler: "DND_CUSTOM.Subclasses.rogue.swashbuckler",
    assassin: "DND_CUSTOM.Subclasses.rogue.assassin"
  },
  sorcerer: {
    draconic: "DND_CUSTOM.Subclasses.sorcerer.draconic",
    wildSorcery: "DND_CUSTOM.Subclasses.sorcerer.wildSorcery",
    stormSorcery: "DND_CUSTOM.Subclasses.sorcerer.stormSorcery"
  },
  warlock: {
    fiend: "DND_CUSTOM.Subclasses.warlock.fiend",
    greatOldOne: "DND_CUSTOM.Subclasses.warlock.greatOldOne",
    archfey: "DND_CUSTOM.Subclasses.warlock.archfey"
  },
  wizard: {
    evocation: "DND_CUSTOM.Subclasses.wizard.evocation",
    necromancy: "DND_CUSTOM.Subclasses.wizard.necromancy",
    illusion: "DND_CUSTOM.Subclasses.wizard.illusion"
  }
};

/** Niveau auquel chaque classe choisit sa sous-classe. */
DND_CUSTOM.subclassLevel = {
  barbarian: 3,
  bard: 3,
  cleric: 1,
  druid: 2,
  fighter: 3,
  monk: 3,
  paladin: 3,
  ranger: 3,
  rogue: 3,
  sorcerer: 1,
  warlock: 1,
  wizard: 2
};

/** Esprits totems d'Aspect de la bête (Barbare), choix définitif. */
DND_CUSTOM.totemSpirits = {
  bear: "DND_CUSTOM.TotemSpirits.bear",
  eagle: "DND_CUSTOM.TotemSpirits.eagle",
  wolf: "DND_CUSTOM.TotemSpirits.wolf"
};

/** Manœuvres du Maître de guerre, choisies à chaque dé dépensé. */
DND_CUSTOM.maneuvers = {
  precise: "DND_CUSTOM.Maneuvers.precise",
  push: "DND_CUSTOM.Maneuvers.push",
  feint: "DND_CUSTOM.Maneuvers.feint"
};

/** Formes sauvages proposées : nom du PNJ du compendium « adversaires » et niveau de Druide minimum. */
DND_CUSTOM.wildShapeForms = [
  { name: "Rat", minLevel: 2 },
  { name: "Corbeau", minLevel: 2 },
  { name: "Loup", minLevel: 2 },
  { name: "Sanglier", minLevel: 2 },
  { name: "Serpent venimeux", minLevel: 2 },
  { name: "Panthère", minLevel: 2 },
  { name: "Crocodile", minLevel: 4 },
  { name: "Ours brun", minLevel: 8 }
];

/** Effets de Technique de la Main ouverte (Moine), choisis à chaque utilisation. */
DND_CUSTOM.openHandEffects = {
  prone: "DND_CUSTOM.OpenHandEffects.prone",
  pushed: "DND_CUSTOM.OpenHandEffects.pushed",
  noReaction: "DND_CUSTOM.OpenHandEffects.noReaction"
};

/** Effets de Bousculer, choisis avant le test opposé. */
DND_CUSTOM.shoveEffects = {
  prone: "DND_CUSTOM.ShoveEffects.prone",
  pushed: "DND_CUSTOM.ShoveEffects.pushed"
};

/** Dé de vie par classe, pour le calcul des PV max. */
DND_CUSTOM.classHitDice = {
  barbarian: 12,
  bard: 8,
  cleric: 8,
  druid: 8,
  fighter: 10,
  monk: 8,
  paladin: 10,
  ranger: 10,
  rogue: 8,
  sorcerer: 6,
  warlock: 8,
  wizard: 6
};

/** Nombre de compétences à choisir à la création, par classe. */
DND_CUSTOM.classSkillChoices = {
  barbarian: 2,
  bard: 3,
  cleric: 2,
  druid: 2,
  fighter: 2,
  monk: 2,
  paladin: 2,
  ranger: 3,
  rogue: 4,
  sorcerer: 2,
  warlock: 2,
  wizard: 2
};

/** Sauvegardes maîtrisées par classe. */
DND_CUSTOM.classSavingThrows = {
  barbarian: ["str", "con"],
  bard: ["dex", "cha"],
  cleric: ["wis", "cha"],
  druid: ["int", "wis"],
  fighter: ["str", "con"],
  monk: ["str", "dex"],
  paladin: ["wis", "cha"],
  ranger: ["str", "dex"],
  rogue: ["dex", "int"],
  sorcerer: ["con", "cha"],
  warlock: ["wis", "cha"],
  wizard: ["int", "wis"]
};

/** Catégories d'armes maîtrisées par classe. */
DND_CUSTOM.classWeaponProficiencies = {
  barbarian: ["meleeSimple", "rangedSimple", "meleeMartial", "rangedMartial"],
  bard: ["meleeSimple", "rangedSimple"],
  cleric: ["meleeSimple", "rangedSimple"],
  druid: ["meleeSimple", "rangedSimple"],
  fighter: ["meleeSimple", "rangedSimple", "meleeMartial", "rangedMartial"],
  monk: ["meleeSimple", "rangedSimple"],
  paladin: ["meleeSimple", "rangedSimple", "meleeMartial", "rangedMartial"],
  ranger: ["meleeSimple", "rangedSimple", "meleeMartial", "rangedMartial"],
  rogue: ["meleeSimple", "rangedSimple"],
  sorcerer: ["meleeSimple", "rangedSimple"],
  warlock: ["meleeSimple", "rangedSimple"],
  wizard: ["meleeSimple", "rangedSimple"]
};

/** Caractéristique d'incantation par classe lanceuse. */
DND_CUSTOM.spellcastingAbility = {
  bard: "cha",
  cleric: "wis",
  druid: "wis",
  paladin: "cha",
  sorcerer: "cha",
  warlock: "cha",
  wizard: "int"
};

/** États du système (SRD + bascules homebrew), installés dans CONFIG.statusEffects à l'init. */
DND_CUSTOM.conditions = [
  { id: "blinded", name: "DND_CUSTOM.Conditions.blinded", img: "icons/svg/blind.svg" },
  { id: "charmed", name: "DND_CUSTOM.Conditions.charmed", img: "icons/svg/aura.svg" },
  { id: "deafened", name: "DND_CUSTOM.Conditions.deafened", img: "icons/svg/deaf.svg" },
  { id: "frightened", name: "DND_CUSTOM.Conditions.frightened", img: "icons/svg/terror.svg" },
  { id: "grappled", name: "DND_CUSTOM.Conditions.grappled", img: "icons/svg/net.svg" },
  { id: "incapacitated", name: "DND_CUSTOM.Conditions.incapacitated", img: "icons/svg/daze.svg" },
  { id: "invisible", name: "DND_CUSTOM.Conditions.invisible", img: "icons/svg/invisible.svg" },
  { id: "paralyzed", name: "DND_CUSTOM.Conditions.paralyzed", img: "icons/svg/paralysis.svg" },
  { id: "petrified", name: "DND_CUSTOM.Conditions.petrified", img: "icons/svg/statue.svg" },
  { id: "poisoned", name: "DND_CUSTOM.Conditions.poisoned", img: "icons/svg/poison.svg" },
  { id: "prone", name: "DND_CUSTOM.Conditions.prone", img: "icons/svg/falling.svg" },
  { id: "restrained", name: "DND_CUSTOM.Conditions.restrained", img: "icons/svg/net.svg" },
  { id: "stunned", name: "DND_CUSTOM.Conditions.stunned", img: "icons/svg/daze.svg" },
  { id: "unconscious", name: "DND_CUSTOM.Conditions.unconscious", img: "icons/svg/unconscious.svg" },
  // Marque un personnage mort sur son token.
  { id: "dead", name: "DND_CUSTOM.Conditions.dead", img: "icons/svg/skull.svg" },
  // En Rage : active les Capacités qui l'exigent.
  { id: "raging", name: "DND_CUSTOM.Conditions.raging", img: "systems/dnd-custom-ai/assets/icons/features/Rage.png" },
  // Surpris : posé par le MJ, permet le critique automatique d'Assassinat.
  { id: "surprised", name: "DND_CUSTOM.Conditions.surprised", img: "icons/svg/eye.svg" },
  // En Forme sauvage : active les Capacités qui l'exigent.
  { id: "wildShape", name: "DND_CUSTOM.Conditions.wildShape", img: "systems/dnd-custom-ai/assets/icons/features/Forme-sauvage.png" },
  // Traqué : cible de Traque implacable (Serment de Vengeance).
  { id: "hunted", name: "DND_CUSTOM.Conditions.hunted", img: "icons/svg/target.svg" },
  // Béni : +1d4 aux jets d'attaque et de sauvegarde.
  { id: "blessed", name: "DND_CUSTOM.Conditions.blessed", img: "icons/svg/angel.svg" },
  // Guidé : +1d4 aux tests de caractéristique et de compétence.
  { id: "guided", name: "DND_CUSTOM.Conditions.guided", img: "icons/svg/light.svg" },
  // Liberté de mouvement : immunité à Entravé.
  { id: "freedomOfMovement", name: "DND_CUSTOM.Conditions.freedomOfMovement", img: "icons/svg/wing.svg" },
  // Protection contre le mal et le bien : immunité à Charmé et Effrayé.
  { id: "protectedFromEvilGood", name: "DND_CUSTOM.Conditions.protectedFromEvilGood", img: "icons/svg/holy-shield.svg" },
  // Voile des anciens : résistance aux dégâts des sorts à 3 m du Paladin.
  { id: "ancientsVeil", name: "DND_CUSTOM.Conditions.ancientsVeil", img: "icons/svg/mage-shield.svg" }
];

/** Types d'activation des Capacités et Sorts ; seule la réaction est suivie. */
DND_CUSTOM.activationTypes = {
  action: "DND_CUSTOM.Item.ActivationTypes.action",
  bonusAction: "DND_CUSTOM.Item.ActivationTypes.bonusAction",
  reaction: "DND_CUSTOM.Item.ActivationTypes.reaction",
  free: "DND_CUSTOM.Item.ActivationTypes.free"
};

/** Vitesse de base en pieds, identique pour toutes les Origines. */
DND_CUSTOM.baseSpeed = 30;

/** Types d'armure, qui plafonnent le bonus de Dex à la CA. */
DND_CUSTOM.armorTypes = {
  light: "DND_CUSTOM.Item.ArmorTypes.light",
  medium: "DND_CUSTOM.Item.ArmorTypes.medium",
  heavy: "DND_CUSTOM.Item.ArmorTypes.heavy"
};

/** Catégories d'armes SRD 5e (courante/de guerre, corps-à-corps/à distance). */
DND_CUSTOM.weaponTypes = {
  meleeSimple: "DND_CUSTOM.Item.WeaponTypes.meleeSimple",
  meleeMartial: "DND_CUSTOM.Item.WeaponTypes.meleeMartial",
  rangedSimple: "DND_CUSTOM.Item.WeaponTypes.rangedSimple",
  rangedMartial: "DND_CUSTOM.Item.WeaponTypes.rangedMartial"
};

/** Types de dégâts SRD : 3 physiques (armes) puis 10 élémentaires et énergétiques. */
DND_CUSTOM.damageTypes = {
  bludgeoning: "DND_CUSTOM.Item.DamageTypes.bludgeoning",
  piercing: "DND_CUSTOM.Item.DamageTypes.piercing",
  slashing: "DND_CUSTOM.Item.DamageTypes.slashing",
  acid: "DND_CUSTOM.Item.DamageTypes.acid",
  cold: "DND_CUSTOM.Item.DamageTypes.cold",
  fire: "DND_CUSTOM.Item.DamageTypes.fire",
  force: "DND_CUSTOM.Item.DamageTypes.force",
  lightning: "DND_CUSTOM.Item.DamageTypes.lightning",
  necrotic: "DND_CUSTOM.Item.DamageTypes.necrotic",
  poison: "DND_CUSTOM.Item.DamageTypes.poison",
  psychic: "DND_CUSTOM.Item.DamageTypes.psychic",
  radiant: "DND_CUSTOM.Item.DamageTypes.radiant",
  thunder: "DND_CUSTOM.Item.DamageTypes.thunder"
};

/** Types de dégâts proposés pour Résilience draconique. */
DND_CUSTOM.draconicResistanceTypes = {
  acid: DND_CUSTOM.damageTypes.acid,
  cold: DND_CUSTOM.damageTypes.cold,
  fire: DND_CUSTOM.damageTypes.fire,
  lightning: DND_CUSTOM.damageTypes.lightning,
  poison: DND_CUSTOM.damageTypes.poison
};

/** Options de Tactiques défensives (Chasseur, Rôdeur), choix définitif. */
DND_CUSTOM.huntersDefenses = {
  mobile: "DND_CUSTOM.HuntersDefenses.mobile",
  multiattackDefense: "DND_CUSTOM.HuntersDefenses.multiattackDefense",
  steadfast: "DND_CUSTOM.HuntersDefenses.steadfast"
};

/** Une main / deux mains. */
DND_CUSTOM.weaponHandedness = {
  oneHanded: "DND_CUSTOM.Item.WeaponHandedness.oneHanded",
  twoHanded: "DND_CUSTOM.Item.WeaponHandedness.twoHanded"
};

/** Emplacements d'équipement d'une arme ou d'une armure (fiche d'Item et dialogue d'équipement). */
DND_CUSTOM.weaponSlotOptions = {
  mainHand: "DND_CUSTOM.Equipment.MainHand",
  offHand: "DND_CUSTOM.Equipment.OffHand"
};

DND_CUSTOM.armorSlotOptions = {
  armor: "DND_CUSTOM.Equipment.Armor",
  offHand: "DND_CUSTOM.Equipment.OffHand",
  accessory: "DND_CUSTOM.Equipment.Accessories"
};

/** Catégories de langues : commune, d'Origine (octroyées à la création) et spéciales. */
DND_CUSTOM.languageCategories = {
  common: "DND_CUSTOM.Item.LanguageCategories.common",
  origin: "DND_CUSTOM.Item.LanguageCategories.origin",
  special: "DND_CUSTOM.Item.LanguageCategories.special"
};

/** Régions du monde : rangement des objets régionaux et historiques, pages des Chroniques des objets. */
DND_CUSTOM.regions = {
  fleuraine: "DND_CUSTOM.Regions.fleuraine",
  altenmark: "DND_CUSTOM.Regions.altenmark",
  lucentia: "DND_CUSTOM.Regions.lucentia",
  ravenmoor: "DND_CUSTOM.Regions.ravenmoor",
  valdera: "DND_CUSTOM.Regions.valdera",
  azhar: "DND_CUSTOM.Regions.azhar",
  saintSiege: "DND_CUSTOM.Regions.saintSiege",
  // Objets liés aux secrets du doc MJ : dossier et page des Chroniques à part, jamais à partager.
  secrets: "DND_CUSTOM.Regions.secrets"
};

/**
 * Phases de campagne du bestiaire, selon le nombre de pierres brisées : dossiers de premier niveau
 * du compendium « adversaires » (réservé au MJ). Le surnaturel n'y est pas absent, il n'est pas encore revenu.
 */
DND_CUSTOM.bestiaryPhases = {
  0: "DND_CUSTOM.Bestiary.Phases.0",
  1: "DND_CUSTOM.Bestiary.Phases.1",
  2: "DND_CUSTOM.Bestiary.Phases.2",
  3: "DND_CUSTOM.Bestiary.Phases.3"
};

/** Milieux du bestiaire (flag `habitat`) : sous-dossiers d'une phase, sauf sites et milieux autonomes. */
DND_CUSTOM.bestiaryHabitats = {
  common: "DND_CUSTOM.Bestiary.Habitats.common",
  fleuraine: "DND_CUSTOM.Regions.fleuraine",
  altenmark: "DND_CUSTOM.Regions.altenmark",
  lucentia: "DND_CUSTOM.Regions.lucentia",
  ravenmoor: "DND_CUSTOM.Regions.ravenmoor",
  valdera: "DND_CUSTOM.Regions.valdera",
  azhar: "DND_CUSTOM.Regions.azhar",
  coast: "DND_CUSTOM.Bestiary.Habitats.coast",
  // Le large : la magie y survit, seul surnaturel possible dès la phase 0.
  abyss: "DND_CUSTOM.Bestiary.Habitats.abyss",
  siteLogne: "DND_CUSTOM.Bestiary.Habitats.siteLogne",
  siteSumpfenmark: "DND_CUSTOM.Bestiary.Habitats.siteSumpfenmark",
  siteKis: "DND_CUSTOM.Bestiary.Habitats.siteKis",
  // Premier grand méchant de la campagne : sa bande (phase 0) et ses paliers après chaque pierre absorbée.
  ulrichBand: "DND_CUSTOM.Bestiary.Habitats.ulrichBand"
};

/**
 * Sites de pierre : l'ordre et l'auteur des ruptures dépendent de la table, ils forment donc chacun un
 * dossier de premier niveau, découpé en avant/après la rupture (flag `phase` 0 ou 1+).
 */
DND_CUSTOM.bestiarySiteHabitats = ["siteLogne", "siteSumpfenmark", "siteKis"];

/** Milieux rangés dans un seul dossier de premier niveau, hors phases (paliers lisibles dans les noms). */
DND_CUSTOM.bestiaryStandaloneHabitats = ["ulrichBand"];

/** Sous-dossiers d'un site de pierre. */
DND_CUSTOM.bestiaryRupture = {
  before: "DND_CUSTOM.Bestiary.Rupture.before",
  after: "DND_CUSTOM.Bestiary.Rupture.after"
};

/** Habitats où le surnaturel existe dès la phase 0 (le large de la Mer intérieure). */
DND_CUSTOM.bestiaryMagicHabitats = ["abyss"];

/** Valeur d'une pièce en équivalent Pièces de Cuivre (PC). 1 PP = 50 PO ; 1 PO = 10 PA = 100 PC. */
DND_CUSTOM.currencyToCopper = {
  pc: 1,
  pa: 10,
  po: 100,
  pp: 5000
};

/** Capacité de charge par point de Force : 15 lb (7,5 kg). */
DND_CUSTOM.carryCapacityPerStrength = {
  lb: 15,
  kg: 7.5
};

/** Les 14 types de créature SRD. */
DND_CUSTOM.creatureTypes = {
  aberration: "DND_CUSTOM.CreatureTypes.aberration",
  beast: "DND_CUSTOM.CreatureTypes.beast",
  celestial: "DND_CUSTOM.CreatureTypes.celestial",
  construct: "DND_CUSTOM.CreatureTypes.construct",
  dragon: "DND_CUSTOM.CreatureTypes.dragon",
  elemental: "DND_CUSTOM.CreatureTypes.elemental",
  fey: "DND_CUSTOM.CreatureTypes.fey",
  fiend: "DND_CUSTOM.CreatureTypes.fiend",
  giant: "DND_CUSTOM.CreatureTypes.giant",
  humanoid: "DND_CUSTOM.CreatureTypes.humanoid",
  monstrosity: "DND_CUSTOM.CreatureTypes.monstrosity",
  ooze: "DND_CUSTOM.CreatureTypes.ooze",
  plant: "DND_CUSTOM.CreatureTypes.plant",
  undead: "DND_CUSTOM.CreatureTypes.undead"
};

/** Les 6 tailles SRD. */
DND_CUSTOM.sizes = {
  tp: "DND_CUSTOM.Sizes.tp",
  p: "DND_CUSTOM.Sizes.p",
  m: "DND_CUSTOM.Sizes.m",
  g: "DND_CUSTOM.Sizes.g",
  tg: "DND_CUSTOM.Sizes.tg",
  gig: "DND_CUSTOM.Sizes.gig"
};

/** Indice de dangerosité (FI) SRD 5e : fractions sous 1, puis paliers entiers de 1 à 30. */
DND_CUSTOM.challengeRatings = [
  "0", "1/8", "1/4", "1/2",
  "1", "2", "3", "4", "5", "6", "7", "8", "9", "10",
  "11", "12", "13", "14", "15", "16", "17", "18", "19", "20",
  "21", "22", "23", "24", "25", "26", "27", "28", "29", "30"
];

/** XP rapporté par FI, qui pré-remplit `xpReward`. */
DND_CUSTOM.challengeRatingXp = {
  "0": 10, "1/8": 25, "1/4": 50, "1/2": 100,
  "1": 200, "2": 450, "3": 700, "4": 1100, "5": 1800,
  "6": 2300, "7": 2900, "8": 3900, "9": 5000, "10": 5900,
  "11": 7200, "12": 8400, "13": 10000, "14": 11500, "15": 13000,
  "16": 15000, "17": 18000, "18": 20000, "19": 22000, "20": 25000,
  "21": 33000, "22": 41000, "23": 50000, "24": 62000, "25": 75000,
  "26": 90000, "27": 105000, "28": 120000, "29": 135000, "30": 155000
};

/** XP cumulé requis par niveau (index 0 = niveau 1). */
DND_CUSTOM.xpThresholds = [
  0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000,
  85000, 100000, 120000, 140000, 165000, 195000, 225000, 265000, 305000, 355000
];

/** Niveaux offrant une Amélioration de caractéristiques. */
DND_CUSTOM.abilityScoreImprovementLevels = [4, 8, 12, 16, 19];

/** Équipement de départ par classe (noms d'Items de weapons.json / armors.json) ; arme toujours maîtrisée. */
DND_CUSTOM.classStartingEquipment = {
  barbarian: { weapon: "Grande hache", armor: null },
  bard: { weapon: "Dague", armor: "Cuir" },
  cleric: { weapon: "Masse d'armes", armor: "Écailles" },
  druid: { weapon: "Faucille", armor: "Peau" },
  fighter: { weapon: "Épée longue", armor: "Cotte de mailles" },
  monk: { weapon: "Bâton", armor: null },
  paladin: { weapon: "Épée longue", armor: "Cotte de mailles" },
  ranger: { weapon: "Arc long", armor: "Cuir clouté" },
  rogue: { weapon: "Dague", armor: "Cuir" },
  sorcerer: { weapon: "Dague", armor: null },
  warlock: { weapon: "Dague", armor: "Cuir" },
  wizard: { weapon: "Dague", armor: null }
};