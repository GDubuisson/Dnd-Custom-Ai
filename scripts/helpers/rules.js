import { DND_CUSTOM } from "./config.js";

/** Modificateur de caractéristique, SRD 5e : floor((score - 10) / 2). */
export function abilityModifier(score) {
  return Math.floor((score - 10) / 2);
}

/** Bonus de maîtrise selon le niveau, SRD 5e : ceil(niveau / 4) + 1 (2 aux niveaux 1-4). */
export function proficiencyBonus(level) {
  return Math.ceil(level / 4) + 1;
}

/** Capacité de charge, SRD 5e (règle "Détaillée") : Force x 15 lb (soit x 7,5 kg). */
export function carryingCapacity(strengthScore, unit = "lb") {
  return strengthScore * DND_CUSTOM.carryCapacityPerStrength[unit];
}

/** Poids total transporté : somme(quantité x poids unitaire) sur tous les objets physiques de l'Actor. */
export function carriedWeight(items) {
  return items.reduce((total, item) => {
    const weight = item.system?.weight ?? 0;
    const quantity = item.system?.quantity ?? 1;
    return total + weight * quantity;
  }, 0);
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

/** Perception passive, SRD 5e : 10 + mod Sagesse + bonus de maîtrise si Perception maîtrisée. */
export function passivePerception(wisMod, perceptionProficient, proficiencyBonusValue) {
  return 10 + wisMod + (perceptionProficient ? proficiencyBonusValue : 0);
}

/** DD de sauvegarde des sorts, SRD 5e : 8 + bonus de maîtrise + mod de la caractéristique d'incantation. */
export function spellSaveDC(proficiencyBonusValue, spellcastingAbilityMod) {
  return 8 + proficiencyBonusValue + spellcastingAbilityMod;
}

/** Bonus d'attaque des sorts, SRD 5e : bonus de maîtrise + mod de la caractéristique d'incantation. */
export function spellAttackBonus(proficiencyBonusValue, spellcastingAbilityMod) {
  return proficiencyBonusValue + spellcastingAbilityMod;
}

/** PV max, SRD 5e (méthode "moyenne") : dé de vie max + CON au niveau 1, puis
 *  floor(dé/2) + 1 + CON par niveau suivant (mini 1 par niveau, mini 1 au total). */
export function maxHitPoints(hitDie, level, conMod) {
  let total = hitDie + conMod;
  for (let lvl = 2; lvl <= level; lvl++) {
    total += Math.max(1, Math.floor(hitDie / 2) + 1 + conMod);
  }
  return Math.max(1, total);
}

/** Bonus de Dex sur la CA selon le type d'armure, SRD 5e : illimité (légère),
 *  plafonné à +2 (intermédiaire), aucun (lourde, même si le modificateur est négatif). */
function dexBonusForArmorType(armorType, dexMod) {
  if (armorType === "medium") return Math.min(dexMod, 2);
  if (armorType === "heavy") return 0;
  return dexMod;
}

/** Classe d'Armure, SRD 5e : 10 + Dex sans armure ; sinon CA de base de l'armure +
 *  bonus de Dex plafonné selon son type, + bonus plat du bouclier équipé le cas échéant,
 *  + bonus plat des accessoires équipés (anneau/amulette de protection, etc.), le cas échéant. */
export function armorClass(dexMod, equippedArmor, equippedShield, equippedAccessories = []) {
  const base = equippedArmor
    ? equippedArmor.system.baseAC + dexBonusForArmorType(equippedArmor.system.armorType, dexMod)
    : 10 + dexMod;
  const shieldBonus = equippedShield ? equippedShield.system.baseAC : 0;
  const accessoriesBonus = equippedAccessories.reduce((total, item) => total + item.system.baseAC, 0);
  return base + shieldBonus + accessoriesBonus;
}

/** Malus de vitesse SRD 5e si la Force du personnage est inférieure à la Force minimale
 *  requise par l'armure équipée : -10 pieds (-3 m), sinon aucun malus. */
export function speedPenalty(strengthRequired, strengthTotal) {
  return strengthRequired > 0 && strengthTotal < strengthRequired ? 10 : 0;
}