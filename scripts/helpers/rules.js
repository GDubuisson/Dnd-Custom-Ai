import { DND_CUSTOM } from "./config.js";

/** Modificateur de caractéristique, SRD 5e : floor((score - 10) / 2). */
export function abilityModifier(score) {
  return Math.floor((score - 10) / 2);
}

/** Bonus de maîtrise selon le niveau, SRD 5e : ceil(niveau / 4) + 1 (2 aux niveaux 1-4). */
export function proficiencyBonus(level) {
  return Math.ceil(level / 4) + 1;
}

/** Niveau correspondant à un total d'XP cumulé, SRD 5e (table "Character Advancement", cf.
 *  DND_CUSTOM.xpThresholds) : le plus haut niveau dont le seuil est atteint, plafonné à 20. */
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

/** Poids total transporté : somme(quantité x poids unitaire) sur tous les objets physiques de l'Actor. */
export function carriedWeight(items) {
  return items.reduce((total, item) => {
    const weight = item.system?.weight ?? 0;
    const quantity = item.system?.quantity ?? 1;
    return total + weight * quantity;
  }, 0);
}

/** Bonus de capacité de charge (kg) apporté par les contenants (sacs...) équipés,
 *  s'ajoutant à la capacité de base (cf. carryingCapacity). */
export function carryingCapacityBonus(items) {
  return items.reduce((total, item) => {
    if (item.type !== "gear" || !item.system.equipped) return total;
    return total + (item.system.capacityBonus ?? 0);
  }, 0);
}

/** Bonus total d'un test de compétence : modificateur de la caractéristique liée + bonus
 *  de maîtrise si la compétence est maîtrisée (même formule que l'onglet Statistiques,
 *  cf. actor-sheet.js > context.skills). */
export function skillModifier(system, skillKey, proficiencyBonusValue) {
  const skill = system.skills[skillKey];
  if (!skill) return 0;
  const mod = abilityModifier(system.abilities[skill.ability].total);
  return mod + (skill.proficient ? proficiencyBonusValue : 0);
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

/** Emplacements de sorts max par niveau (1 à 9) selon la classe et le niveau, SRD 5e (cf.
 *  scripts/data/spell-slots.json, chargé une fois au démarrage dans
 *  game.dndCustomAi.spellSlotTables). Toutes les classes lanceuses utilisent la table
 *  "pleine" sauf le Paladin (demi-lanceur) et l'Occultiste (Magie de Pacte : emplacements
 *  limités, un seul palier actif à la fois, quel que soit le niveau du sort lancé). */
export function spellSlotsForClass(className, level, tables) {
  const max = Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => [n, 0]));
  if (!tables) return max;

  if (className === "warlock") {
    const pact = tables.warlockPact[level];
    if (pact) max[pact.level] = pact.slots;
    return max;
  }

  const table = className === "paladin" ? tables.halfCaster : tables.fullCaster;
  const row = table?.[level];
  if (row) row.forEach((count, index) => (max[index + 1] = count));
  return max;
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

/** Bonus de CA apporté par UNE pièce d'armure/bouclier/accessoire prise isolément (à afficher
 *  sur sa ligne d'inventaire ou son emplacement d'équipement) : armure du corps → CA de base +
 *  bonus de Dex plafonné selon son type (même règle que armorClass) ; bouclier/accessoire →
 *  bonus plat (leur `baseAC` s'additionne tel quel, pas de composante Dex). */
export function armorContribution(armorSystem, dexMod) {
  if (armorSystem.slot === "armor") {
    return armorSystem.baseAC + dexBonusForArmorType(armorSystem.armorType, dexMod);
  }
  return armorSystem.baseAC;
}

/** Malus de vitesse SRD 5e si la Force du personnage est inférieure à la Force minimale
 *  requise par l'armure équipée : -10 pieds (-3 m), sinon aucun malus. */
export function speedPenalty(strengthRequired, strengthTotal) {
  return strengthRequired > 0 && strengthTotal < strengthRequired ? 10 : 0;
}

/** Bonus de vitesse de classe, SRD 5e (même convention numérique que speedPenalty/baseSpeed
 *  ci-dessus, cf. leurs commentaires). Barbare "Célérité" (niveau 5+) : +10, sauf armure
 *  lourde. Moine "Déplacement sans armure" (niveau 2+, paliers 6/10/14/18) : +10 à +30,
 *  seulement sans armure ni bouclier équipé. */
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

/** Effet de l'Exhaustion sur la vitesse, SRD 5e (table complète, niveau 6 = mort géré
 *  séparément) : vitesse divisée par deux dès le niveau 2, nulle dès le niveau 5. Appliqué
 *  après les autres malus de vitesse (armure...). */
export function exhaustionSpeed(speed, exhaustionLevel) {
  if (exhaustionLevel >= 5) return 0;
  if (exhaustionLevel >= 2) return Math.floor(speed / 2);
  return speed;
}

/** Effet de l'Exhaustion sur les PV max, SRD 5e : PV max divisés par deux dès le niveau 4. */
export function exhaustionMaxHp(maxHp, exhaustionLevel) {
  return exhaustionLevel >= 4 ? Math.max(1, Math.floor(maxHp / 2)) : maxHp;
}

/** Emplacement(s) d'équipement occupé(s) par une arme/armure une fois équipée : une arme à
 *  deux mains occupe TOUJOURS Main principale + Main secondaire (SRD 5e, "nécessite les deux
 *  mains"), quel que soit son champ `slot` (ignoré dans ce cas) ; sinon un seul emplacement,
 *  celui choisi (`slot`). Utilisé à la fois pour répartir l'équipement sur l'onglet
 *  "Équipement" et pour empêcher d'équiper deux objets sur le même emplacement (cf.
 *  dnd-custom-ai.js > hook `preUpdateItem`). `system` accepte un DataModel réel ou un objet
 *  partiel `{ slot, properties: { handedness } }` (état "après changement" pas encore
 *  persisté).
 * @param {"weapon"|"armor"} type
 * @param {object} system
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

/** Une arme ne peut être équipée en Main secondaire que si elle est Légère (SRD 5e, combat à
 *  deux armes : l'attaque de bonus avec l'arme de la main secondaire exige une arme Légère).
 *  Une arme à deux mains n'est de toute façon jamais éligible (elle occupe les deux mains,
 *  cf. equipmentSlots) ; ce garde-fou concerne les armes à une main non-Légères (ex. Rapière,
 *  Épée longue) qui ne doivent pas pouvoir être choisies comme arme de main secondaire. */
export function isOffHandEligible(weaponSystem) {
  return weaponSystem.properties?.handedness !== "twoHanded" && Boolean(weaponSystem.properties?.light);
}

/** Modificateur de caractéristique et bonus d'attaque d'une arme équipée, SRD 5e : Dextérité
 *  pour les armes à distance, meilleur de Force/Dextérité si Finesse, Force sinon. Bonus de
 *  maîtrise toujours appliqué : ce système simplifié ne suit pas de liste de maîtrises
 *  d'armes par classe, tout personnage est considéré maîtrisé de toute arme équipée. */
export function weaponAttackDamage(weaponSystem, abilities, proficiencyBonusValue) {
  const isRanged = weaponSystem.weaponType.startsWith("ranged");
  const strMod = abilityModifier(abilities.str.total);
  const dexMod = abilityModifier(abilities.dex.total);
  const abilityMod = isRanged
    ? dexMod
    : weaponSystem.properties.finesse
      ? Math.max(strMod, dexMod)
      : strMod;
  return { abilityMod, attackBonus: abilityMod + proficiencyBonusValue };
}