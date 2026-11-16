import { DND_CUSTOM } from "./config.js";

/** Modificateur de caractéristique, SRD 5e : floor((score - 10) / 2). */
export function abilityModifier(score) {
  return Math.floor((score - 10) / 2);
}

/** Bonus de maîtrise selon le niveau, SRD 5e : ceil(niveau / 4) + 1 (2 aux niveaux 1-4). */
export function proficiencyBonus(level) {
  return Math.ceil(level / 4) + 1;
}

/** Niveau atteint pour un total d'XP (cf. DND_CUSTOM.xpThresholds), plafonné à 20. */
export function levelForXp(xp) {
  const thresholds = DND_CUSTOM.xpThresholds;
  let level = 1;
  for (let i = thresholds.length - 1; i >= 0; i--) {
    if (xp >= thresholds[i]) {
      level = i + 1;
      break;
    }
  }
  return level;
}

/** Capacité de charge, SRD 5e (règle "Détaillée") : Force x 15 lb (soit x 7,5 kg). */
export function carryingCapacity(strengthScore, unit = "lb") {
  return strengthScore * DND_CUSTOM.carryCapacityPerStrength[unit];
}

/** Poids total transporté : somme(quantité × poids unitaire) des objets physiques. */
export function carriedWeight(items) {
  return items.reduce((total, item) => {
    const weight = item.system?.weight ?? 0;
    const quantity = item.system?.quantity ?? 1;
    return total + weight * quantity;
  }, 0);
}

/** Bonus de capacité de charge (kg) des contenants équipés. */
export function carryingCapacityBonus(items) {
  return items.reduce((total, item) => {
    if (item.type !== "gear" || !item.system.equipped) return total;
    return total + (item.system.capacityBonus ?? 0);
  }, 0);
}

/** Déclencheur affiché de l'Attaque d'opportunité, étendu par le don Sentinelle. */
export function opportunityAttackTrigger(baseTrigger, hasSentinel) {
  if (!hasSentinel) return baseTrigger;
  return "Une créature que vous voyez quitte votre portée d'attaque au corps à corps — "
    + "désormais valable même si elle se désengage, et vous pouvez aussi réagir quand une "
    + "créature à 1,50 m de vous attaque une cible autre que vous (Sentinelle : la cible "
    + "touchée voit sa vitesse tomber à 0 jusqu'à la fin du tour).";
}

/** Indique si la réaction du round est encore disponible. */
export function canUseReaction(system) {
  return system.combat?.reactionAvailable ?? true;
}

/**
 * Bonus total d'un test de compétence (caractéristique + maîtrise).
 * `jackOfAllTrades` ajoute la moitié de la maîtrise aux compétences non maîtrisées.
 */
export function skillModifier(system, skillKey, proficiencyBonusValue, jackOfAllTrades = false) {
  const skill = system.skills[skillKey];
  if (!skill) return 0;
  const mod = abilityModifier(system.abilities[skill.ability].total);
  if (skill.proficient) return mod + proficiencyBonusValue;
  return mod + (jackOfAllTrades ? Math.floor(proficiencyBonusValue / 2) : 0);
}

/**
 * Modificateur de compétence d'un test opposé, pour un personnage ou un PNJ.
 * @param {object} system - `actor.system` du personnage ou du PNJ
 * @param {string} skillKey
 * @param {string} ability - caractéristique liée (`SKILL_ABILITIES[skillKey]`)
 */
export function opposedCheckModifier(system, skillKey, ability) {
  const abilityData = system.abilities[ability];
  if (!("total" in abilityData)) return abilityData.mod;
  return skillModifier(system, skillKey, proficiencyBonus(system.attributes.level));
}

/** Indique si `items` contient une Capacité nommée exactement `name`. */
export function hasFeature(items, name) {
  return items.some((item) => item.type === "feature" && item.name === name);
}

/**
 * Langue que `language` exige déjà de connaître (ex. le sümpfer exige l'altenmarkois) et que
 * `items` ne contient pas ; `null` si l'ajout est permis.
 */
export function missingRequiredLanguage(language, items) {
  const required = language.system?.requiredLanguage;
  if (language.type !== "language" || !required) return null;
  return items.some((item) => item.type === "language" && item.name === required) ? null : required;
}

/** Bonus d'un test avec outil : caractéristique + maîtrise toujours appliquée + bonus de l'objet. */
export function toolCheckModifier(system, skillKey, proficiencyBonusValue, itemBonus = 0) {
  const skill = system.skills[skillKey];
  if (!skill) return 0;
  const mod = abilityModifier(system.abilities[skill.ability].total);
  return mod + proficiencyBonusValue + itemBonus;
}

/** Richesse totale exprimée en équivalent Pièces de Cuivre. */
export function currencyTotalInCopper(currency) {
  return Object.entries(currency).reduce((total, [denomination, amount]) => {
    return total + amount * (DND_CUSTOM.currencyToCopper[denomination] ?? 0);
  }, 0);
}

export function formatModifier(mod) {
  return mod >= 0 ? `+${mod}` : `${mod}`;
}

/** ` (label)` à accoler à un libellé, ou chaîne vide si `label` est vide. */
export function parenthesized(label) {
  return label ? ` (${label})` : "";
}

/** Libellés formatés (attaque, dégâts) d'un profil d'attaque de PNJ ; `damageLabel` vide sans dé. */
export function formatAttackLabels(attack, abilityMod) {
  return {
    attackBonusLabel: formatModifier(abilityMod + attack.bonus),
    damageLabel: attack.damage.dice ? `${attack.damage.dice}${formatModifier(abilityMod + attack.damage.bonus)}` : ""
  };
}

/** Perception passive, SRD 5e : 10 + mod Sagesse + bonus de maîtrise si Perception maîtrisée. */
export function passivePerception(wisMod, perceptionProficient, proficiencyBonusValue) {
  return 10 + wisMod + (perceptionProficient ? proficiencyBonusValue : 0);
}

/** DD de sauvegarde des sorts, SRD 5e : 8 + bonus de maîtrise + mod de la caractéristique d'incantation. */
export function spellSaveDC(proficiencyBonusValue, spellcastingAbilityMod) {
  return 8 + proficiencyBonusValue + spellcastingAbilityMod;
}

/**
 * Modificateur de sauvegarde d'une cible (mod. + maîtrise + bonus d'équipement), ou bonus direct pour un PNJ.
 * @param {object} targetSystem - `actor.system` de la cible
 * @param {string} ability - caractéristique de la sauvegarde
 */
export function targetSaveModifier(targetSystem, ability) {
  const abilityData = targetSystem.abilities[ability];
  if (!("total" in abilityData)) return abilityData.mod;
  const mod = abilityModifier(abilityData.total);
  const profBonus = targetSystem.saves[ability].proficient ? proficiencyBonus(targetSystem.attributes.level) : 0;
  return mod + profBonus + (targetSystem.attributes.saveBonus ?? 0);
}

/** Bonus d'attaque des sorts, SRD 5e : bonus de maîtrise + mod de la caractéristique d'incantation. */
export function spellAttackBonus(proficiencyBonusValue, spellcastingAbilityMod) {
  return proficiencyBonusValue + spellcastingAbilityMod;
}

/** Paliers de sorts 1 à 9 (les tours de magie sont illimités). */
export const SPELL_LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 9];

/** Emplacements de sorts tous à 0. */
export function emptySpellSlots() {
  return Object.fromEntries(SPELL_LEVELS.map((level) => [level, 0]));
}

/**
 * Emplacements de sorts par palier pour une classe et un niveau (table pleine, demi-lanceur ou Pacte).
 * @returns {{slots: object, maxSpellLevel: number, isPactMagic: boolean}}
 */
export function spellSlotsForClass(className, level, tables) {
  if (!tables || !DND_CUSTOM.spellcastingClasses.includes(className)) {
    return { slots: emptySpellSlots(), maxSpellLevel: 0, isPactMagic: false };
  }

  if (className === "warlock") {
    const pact = tables.warlockPact[level];
    const slots = emptySpellSlots();
    if (pact) slots[pact.level] = pact.slots;
    return { slots, maxSpellLevel: pact?.level ?? 0, isPactMagic: true };
  }

  const table = className === "paladin" ? tables.halfCaster : tables.fullCaster;
  const row = table?.[level];
  const slots = emptySpellSlots();
  let maxSpellLevel = 0;
  if (row) {
    row.forEach((count, index) => {
      const spellLevel = index + 1;
      slots[spellLevel] = count;
      if (count > 0) maxSpellLevel = spellLevel;
    });
  }
  return { slots, maxSpellLevel, isPactMagic: false };
}

/** Update remettant chaque palier d'emplacement de sort à son maximum. */
export function spellSlotFillUpdates(actor) {
  const slots = actor.system.spells.slots;
  return Object.fromEntries(SPELL_LEVELS.map((level) => [`system.spells.slots.${level}.value`, slots[level].max]));
}

/** Pourcentage de PV restants (0-100) pour la barre de vie. */
export function hitPointsPercent(hp) {
  return Math.max(0, Math.min(100, Math.round((hp.value / (hp.max || 1)) * 100)));
}

/** PV max (méthode moyenne) : dé max + CON au niveau 1, puis dé/2 + 1 + CON par niveau (mini 1). */
export function maxHitPoints(hitDie, level, conMod) {
  let total = hitDie + conMod;
  for (let lvl = 2; lvl <= level; lvl++) {
    total += Math.max(1, Math.floor(hitDie / 2) + 1 + conMod);
  }
  return Math.max(1, total);
}

/** Bonus de Dex à la CA selon l'armure : illimité (légère), max +2 (intermédiaire), aucun (lourde). */
function dexBonusForArmorType(armorType, dexMod) {
  if (armorType === "medium") return Math.min(dexMod, 2);
  if (armorType === "heavy") return 0;
  return dexMod;
}

/**
 * Classe d'Armure : 10 + Dex (+ `unarmoredBonus`) sans armure, sinon CA de l'armure + Dex plafonnée,
 * plus bouclier et accessoires équipés (sauf accessoires `unarmoredOnly` si armure ou bouclier).
 */
export function armorClass(dexMod, equippedArmor, equippedShield, equippedAccessories = [], unarmoredBonus = 0) {
  const base = equippedArmor
    ? equippedArmor.system.baseAC + dexBonusForArmorType(equippedArmor.system.armorType, dexMod)
    : 10 + dexMod + unarmoredBonus;
  const shieldBonus = equippedShield ? equippedShield.system.baseAC : 0;
  const armored = Boolean(equippedArmor || equippedShield);
  const accessoriesBonus = equippedAccessories
    .filter((item) => !(item.system.unarmoredOnly && armored))
    .reduce((total, item) => total + item.system.baseAC, 0);
  return base + shieldBonus + accessoriesBonus;
}

/** Bonus de CA d'une seule pièce d'armure, de bouclier ou d'accessoire. */
export function armorContribution(armorSystem, dexMod) {
  if (armorSystem.slot === "armor") {
    return armorSystem.baseAC + dexBonusForArmorType(armorSystem.armorType, dexMod);
  }
  return armorSystem.baseAC;
}

/** Malus de vitesse (-10 pieds) si la Force est inférieure à celle requise par l'armure. */
export function speedPenalty(strengthRequired, strengthTotal) {
  return strengthRequired > 0 && strengthTotal < strengthRequired ? 10 : 0;
}

/** Bonus de vitesse de classe : Célérité du Barbare, Déplacement sans armure du Moine. */
export function classSpeedBonus(className, level, isHeavyArmor, hasArmorOrShield) {
  if (className === "barbarian" && level >= 5 && !isHeavyArmor) return 10;
  if (className === "monk" && level >= 2 && !hasArmorOrShield) {
    if (level >= 18) return 30;
    if (level >= 14) return 25;
    if (level >= 10) return 20;
    if (level >= 6) return 15;
    return 10;
  }
  return 0;
}

/** Vitesse sous Épuisement : moitié dès le niveau 2, nulle dès le niveau 5. */
export function exhaustionSpeed(speed, exhaustionLevel) {
  if (exhaustionLevel >= 5) return 0;
  if (exhaustionLevel >= 2) return Math.floor(speed / 2);
  return speed;
}

/** PV max sous Épuisement : moitié dès le niveau 4. */
export function exhaustionMaxHp(maxHp, exhaustionLevel) {
  return exhaustionLevel >= 4 ? Math.max(1, Math.floor(maxHp / 2)) : maxHp;
}

/**
 * Emplacements occupés par une arme ou armure équipée (les deux mains pour une arme à deux mains).
 * @returns {string[]}
 */
export function equipmentSlots(type, system) {
  if (type === "weapon") {
    if (system.properties?.handedness === "twoHanded") return ["mainHand", "offHand"];
    return [system.slot];
  }
  if (type === "armor") return [system.slot];
  return [];
}

/** Indique si l'arme peut aller en main secondaire (arme Légère). */
export function isOffHandEligible(weaponSystem) {
  return weaponSystem.properties?.handedness !== "twoHanded" && Boolean(weaponSystem.properties?.light);
}

/** Indique si la classe maîtrise la catégorie d'arme ; vrai par défaut sans classe. */
export function isProficientWithWeapon(className, weaponType) {
  const categories = DND_CUSTOM.classWeaponProficiencies[className];
  return categories ? categories.includes(weaponType) : true;
}

/**
 * Modificateurs d'une arme : Dex à distance, meilleur For/Dex si Finesse, For sinon, plus son bonus magique.
 * @returns {{abilityMod: number, damageMod: number, attackBonus: number}}
 */
export function weaponAttackDamage(weaponSystem, abilities, proficiencyBonusValue, isProficient = true) {
  const isRanged = weaponSystem.weaponType.startsWith("ranged");
  const strMod = abilityModifier(abilities.str.total);
  const dexMod = abilityModifier(abilities.dex.total);
  const meleeMod = weaponSystem.properties.finesse ? Math.max(strMod, dexMod) : strMod;
  const abilityMod = isRanged ? dexMod : meleeMod;
  const enhancement = weaponSystem.enhancement ?? 0;
  return {
    abilityMod,
    damageMod: abilityMod + enhancement,
    attackBonus: abilityMod + (isProficient ? proficiencyBonusValue : 0) + enhancement
  };
}