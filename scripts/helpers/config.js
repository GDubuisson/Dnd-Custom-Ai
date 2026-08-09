export const DND_CUSTOM = {};

DND_CUSTOM.abilities = {
  str: "DND_CUSTOM.Abilities.str",
  dex: "DND_CUSTOM.Abilities.dex",
  con: "DND_CUSTOM.Abilities.con",
  int: "DND_CUSTOM.Abilities.int",
  wis: "DND_CUSTOM.Abilities.wis",
  cha: "DND_CUSTOM.Abilities.cha"
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

/** Classes D&D 5e (SRD, 12 classes officielles), utilisées par la fiche de personnage. */
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

/** Classes considérées comme lanceuses de sorts : l'onglet "Capacités" devient "Sorts". */
DND_CUSTOM.spellcastingClasses = ["bard", "cleric", "druid", "paladin", "sorcerer", "warlock", "wizard"];

/** Dé de vie par classe, SRD 5e. Utilisé pour le calcul automatique des PV max. */
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

/** Caractéristique d'incantation par classe lanceuse de sorts, SRD 5e. Utilisée pour le DD
 *  de sauvegarde et le bonus d'attaque des sorts. */
DND_CUSTOM.spellcastingAbility = {
  bard: "cha",
  cleric: "wis",
  druid: "wis",
  paladin: "cha",
  sorcerer: "cha",
  warlock: "cha",
  wizard: "int"
};

/** Vitesse de base (en pieds) : les origines de ce système sont des cultures/régions,
 *  pas des espèces, donc pas de variation de vitesse par origine pour l'instant. */
DND_CUSTOM.baseSpeed = 30;

/** Types d'armure SRD 5e, déterminant le plafond de bonus de Dex sur la CA
 *  (cf. scripts/helpers/rules.js > armorClass). */
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

/** Types de dégâts physiques SRD 5e. */
DND_CUSTOM.damageTypes = {
  bludgeoning: "DND_CUSTOM.Item.DamageTypes.bludgeoning",
  piercing: "DND_CUSTOM.Item.DamageTypes.piercing",
  slashing: "DND_CUSTOM.Item.DamageTypes.slashing"
};

/** Écoles de magie SRD 5e (8 écoles officielles). */
DND_CUSTOM.spellSchools = {
  abjuration: "DND_CUSTOM.Item.SpellSchools.abjuration",
  conjuration: "DND_CUSTOM.Item.SpellSchools.conjuration",
  divination: "DND_CUSTOM.Item.SpellSchools.divination",
  enchantment: "DND_CUSTOM.Item.SpellSchools.enchantment",
  evocation: "DND_CUSTOM.Item.SpellSchools.evocation",
  illusion: "DND_CUSTOM.Item.SpellSchools.illusion",
  necromancy: "DND_CUSTOM.Item.SpellSchools.necromancy",
  transmutation: "DND_CUSTOM.Item.SpellSchools.transmutation"
};

/** Une main / Deux mains (SRD 5e), propriété de base de toute arme. */
DND_CUSTOM.weaponHandedness = {
  oneHanded: "DND_CUSTOM.Item.WeaponHandedness.oneHanded",
  twoHanded: "DND_CUSTOM.Item.WeaponHandedness.twoHanded"
};

/** Valeur d'une pièce en équivalent Pièces de Cuivre (PC). 1 PP = 50 PO ; 1 PO = 10 PA = 100 PC. */
DND_CUSTOM.currencyToCopper = {
  pc: 1,
  pa: 10,
  po: 100,
  pp: 5000
};

/** Capacité de charge D&D 5e standard : Force x 15 lb (soit x 7.5 kg). */
DND_CUSTOM.carryCapacityPerStrength = {
  lb: 15,
  kg: 7.5
};

/** Types de créature SRD 5e (14 types officiels), utilisés par la fiche d'ennemi/PNJ. */
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

/** Tailles SRD 5e (6 catégories officielles), utilisées par la fiche d'ennemi/PNJ. */
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

/** Points d'expérience rapportés par FI, SRD 5e (table officielle) : pré-remplit
 *  `xpReward` quand le MJ change l'indice de dangerosité (cf. dnd-custom-ai.js > hook
 *  preUpdateActor), la valeur reste ensuite modifiable à la main. */
DND_CUSTOM.challengeRatingXp = {
  "0": 10, "1/8": 25, "1/4": 50, "1/2": 100,
  "1": 200, "2": 450, "3": 700, "4": 1100, "5": 1800,
  "6": 2300, "7": 2900, "8": 3900, "9": 5000, "10": 5900,
  "11": 7200, "12": 8400, "13": 10000, "14": 11500, "15": 13000,
  "16": 15000, "17": 18000, "18": 20000, "19": 22000, "20": 25000,
  "21": 33000, "22": 41000, "23": 50000, "24": 62000, "25": 75000,
  "26": 90000, "27": 105000, "28": 120000, "29": 135000, "30": 155000
};

/** XP total cumulé requis pour atteindre chaque niveau, SRD 5e (table "Character
 *  Advancement" officielle, niveaux 1 à 20 — index 0 = niveau 1). Utilisé pour détecter
 *  qu'une montée de niveau est disponible (cf. rules.js > levelForXp). */
DND_CUSTOM.xpThresholds = [
  0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000,
  85000, 100000, 120000, 140000, 165000, 195000, 225000, 265000, 305000, 355000
];