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

/** Vitesse de base (en pieds) : les origines de ce système sont des cultures/régions,
 *  pas des espèces, donc pas de variation de vitesse par origine pour l'instant. */
DND_CUSTOM.baseSpeed = 30;

/** Catégories d'armure SRD 5e, déterminant le plafond de bonus de Dex sur la CA. */
DND_CUSTOM.armorCategories = ["light", "medium", "heavy"];

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