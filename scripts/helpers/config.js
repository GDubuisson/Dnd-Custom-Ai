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