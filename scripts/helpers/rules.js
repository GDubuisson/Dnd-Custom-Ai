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

/** Le don Sentinelle (SRD 5e, world-items/feats.json) modifie le déclencheur de la Capacité
 *  universelle "Attaque d'opportunité" (fonctionne même contre le désengagement, se déclenche
 *  aussi quand une créature proche attaque quelqu'un d'autre que vous) : recalculé ici à
 *  l'affichage si le personnage possède les deux Capacités, jamais persisté sur l'Item
 *  "Attaque d'opportunité" lui-même (cf. actor-sheet.js > context.features) — reste à jour
 *  automatiquement si Sentinelle est ajoutée/retirée, sans logique de "annulation" à maintenir. */
export function opportunityAttackTrigger(baseTrigger, hasSentinel) {
  if (!hasSentinel) return baseTrigger;
  return "Une créature que vous voyez quitte votre portée d'attaque au corps à corps — "
    + "désormais valable même si elle se désengage, et vous pouvez aussi réagir quand une "
    + "créature à 1,50 m de vous attaque une cible autre que vous (Sentinelle : la cible "
    + "touchée voit sa vitesse tomber à 0 jusqu'à la fin du tour).";
}

/** Économie d'action de combat, SRD 5e : une réaction n'est utilisable que si elle n'a pas déjà
 *  été consommée ce round-ci (cf. system.combat.reactionAvailable, CharacterData ; régénérée au
 *  début de son propre tour par le hook updateCombat, dnd-custom-ai.js). */
export function canUseReaction(system) {
  return system.combat?.reactionAvailable ?? true;
}

/** Bonus total d'un test de compétence : modificateur de la caractéristique liée + bonus
 *  de maîtrise si la compétence est maîtrisée (même formule que l'onglet Statistiques,
 *  cf. actor-sheet.js > context.skills). `jackOfAllTrades` (Capacité "Aptitudes multiples" du
 *  Barde, SRD 5e) ajoute la moitié du bonus de maîtrise (arrondi à l'inférieur) aux
 *  compétences NON maîtrisées, jamais cumulé avec la maîtrise elle-même. */
export function skillModifier(system, skillKey, proficiencyBonusValue, jackOfAllTrades = false) {
  const skill = system.skills[skillKey];
  if (!skill) return 0;
  const mod = abilityModifier(system.abilities[skill.ability].total);
  if (skill.proficient) return mod + proficiencyBonusValue;
  return mod + (jackOfAllTrades ? Math.floor(proficiencyBonusValue / 2) : 0);
}

/** Le personnage possède-t-il une Capacité (Item type "feature") d'un nom exact donné ? Sert à
 *  déclencher automatiquement les quelques Capacités passives dont l'effet est mécanique et
 *  sans ambiguïté (cf. character-data.js > Défense sans armure du Barbare, actor-sheet.js >
 *  Aptitudes multiples du Barde, Incantation rituelle du Clerc) — pour que le joueur/MJ n'ait
 *  pas à s'en souvenir/l'appliquer à la main. Les Capacités dont l'effet dépend d'un choix du
 *  joueur (Domaine divin, Métamagie, Invocations occultes...) restent volontairement du texte
 *  descriptif, non automatisées. */
export function hasFeature(items, name) {
  return items.some((item) => item.type === "feature" && item.name === name);
}

/** Bonus total d'un test effectué avec un outil (ToolData#useEffect, cf. ITEMS.md) : modificateur
 *  de la caractéristique liée à la compétence visée + bonus de maîtrise TOUJOURS appliqué (un
 *  outil confère sa propre maîtrise, indépendante de celle de la compétence elle-même, SRD 5e —
 *  contrairement à skillModifier ci-dessus) + bonus fixe éventuel de l'objet. */
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

/** Perception passive, SRD 5e : 10 + mod Sagesse + bonus de maîtrise si Perception maîtrisée. */
export function passivePerception(wisMod, perceptionProficient, proficiencyBonusValue) {
  return 10 + wisMod + (perceptionProficient ? proficiencyBonusValue : 0);
}

/** DD de sauvegarde des sorts, SRD 5e : 8 + bonus de maîtrise + mod de la caractéristique d'incantation. */
export function spellSaveDC(proficiencyBonusValue, spellcastingAbilityMod) {
  return 8 + proficiencyBonusValue + spellcastingAbilityMod;
}

/** Modificateur de sauvegarde d'une CIBLE pour une caractéristique donnée (mod. + bonus de
 *  maîtrise si la cible est maîtrisée de cette sauvegarde), SRD 5e — sert à l'auto-jet de
 *  sauvegarde d'un sort à sauvegarde (cf. SpellData#save, item-data.js ; #onCastSpell,
 *  actor-sheet.js), même niveau d'automatisation que compareToTargetAc pour un jet d'attaque :
 *  une simple lecture des stats déjà exposées de la cible, jamais une interruption de son
 *  client. `targetSystem` = `actor.system` de la cible (pas l'Actor entier), pour rester
 *  testable sans mock complet d'un Document Foundry. */
export function targetSaveModifier(targetSystem, ability) {
  const mod = abilityModifier(targetSystem.abilities[ability].total);
  const profBonus = targetSystem.saves[ability].proficient ? proficiencyBonus(targetSystem.attributes.level) : 0;
  return mod + profBonus;
}

/** Bonus d'attaque des sorts, SRD 5e : bonus de maîtrise + mod de la caractéristique d'incantation. */
export function spellAttackBonus(proficiencyBonusValue, spellcastingAbilityMod) {
  return proficiencyBonusValue + spellcastingAbilityMod;
}

/** Paliers de sorts SRD 5e (1 à 9, hors tours de magie qui restent gratuits/illimités). Partagé
 *  entre le DataModel (CharacterData#spells.slots), rules.js et les tests. */
export const SPELL_LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 9];

/** Emplacements de sorts vides (tous paliers à 0), forme de base renvoyée par
 *  spellSlotsForClass ci-dessous pour une classe non lanceuse/niveau sans table. */
export function emptySpellSlots() {
  return Object.fromEntries(SPELL_LEVELS.map((level) => [level, 0]));
}

/** Emplacements de sorts par niveau (1 à 9), SRD 5e, dérivés de la table complète
 *  (cf. scripts/data/spell-slots.json, chargée une fois au démarrage dans
 *  game.dndCustomAi.spellSlotTables) : `slots[n]` = nombre d'emplacements du palier n à ce
 *  niveau de personnage, `maxSpellLevel` = plus haut palier accessible (dernier non nul),
 *  utilisé pour limiter les Sorts octroyés automatiquement à la classe/au niveau (cf.
 *  helpers/class-content.js). Toutes les classes lanceuses utilisent la table "pleine" sauf le
 *  Paladin (demi-lanceur, `halfCaster`) et l'Occultiste (Magie de Pacte, `warlockPact`) :
 *  emplacements limités, un seul palier actif à la fois (celui de `pact.level`), qui monte avec
 *  le niveau — `isPactMagic` signale ce cas particulier (récupéré au repos court ET long,
 *  contrairement aux autres classes, cf. DndCustomActorSheet#onRestShort). Renvoie des
 *  emplacements tous à 0 (`isPactMagic: false`) pour une classe non lanceuse ou sans table. */
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

/** Objet d'update `system.spells.slots.<n>.value` -> max, un par palier (1-9), pour topper au
 *  maximum les emplacements de sorts actuellement dérivés de `actor.system.spells.slots` (déjà
 *  recalculés par CharacterData#prepareDerivedData au moment de l'appel). Partagé entre repos
 *  court/long (DndCustomActorSheet#onRestShort/Long), montée de niveau (#onLevelUp) et création
 *  de personnage (CharacterCreationWizard) : mêmes emplacements à remplir, seul le moment
 *  d'appel change. */
export function spellSlotFillUpdates(actor) {
  const slots = actor.system.spells.slots;
  return Object.fromEntries(SPELL_LEVELS.map((level) => [`system.spells.slots.${level}.value`, slots[level].max]));
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
 *  + bonus plat des accessoires équipés (anneau/amulette de protection, etc.), le cas échéant.
 *  `unarmoredBonus` (0 par défaut) : bonus supplémentaire à la formule "sans armure" uniquement
 *  (ex. modificateur de Constitution pour la Défense sans armure du Barbare, cf.
 *  character-data.js) — sans effet si une armure est équipée, comme le veut cette Capacité. */
export function armorClass(dexMod, equippedArmor, equippedShield, equippedAccessories = [], unarmoredBonus = 0) {
  const base = equippedArmor
    ? equippedArmor.system.baseAC + dexBonusForArmorType(equippedArmor.system.armorType, dexMod)
    : 10 + dexMod + unarmoredBonus;
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

/** Un personnage est-il maîtrisé de la catégorie d'arme (weaponType) équipée, selon sa
 *  classe (cf. DND_CUSTOM.classWeaponProficiencies) ? Classe vide/inconnue (PNJ, personnage
 *  pas encore configuré) : considéré maîtrisé par défaut, pour ne pas pénaliser avant qu'une
 *  classe soit choisie. */
export function isProficientWithWeapon(className, weaponType) {
  const categories = DND_CUSTOM.classWeaponProficiencies[className];
  return categories ? categories.includes(weaponType) : true;
}

/** Modificateur de caractéristique et bonus d'attaque d'une arme équipée, SRD 5e : Dextérité
 *  pour les armes à distance, meilleur de Force/Dextérité si Finesse, Force sinon. Bonus de
 *  maîtrise appliqué uniquement si `isProficient` (cf. isProficientWithWeapon ci-dessus). */
export function weaponAttackDamage(weaponSystem, abilities, proficiencyBonusValue, isProficient = true) {
  const isRanged = weaponSystem.weaponType.startsWith("ranged");
  const strMod = abilityModifier(abilities.str.total);
  const dexMod = abilityModifier(abilities.dex.total);
  const abilityMod = isRanged
    ? dexMod
    : weaponSystem.properties.finesse
      ? Math.max(strMod, dexMod)
      : strMod;
  return { abilityMod, attackBonus: abilityMod + (isProficient ? proficiencyBonusValue : 0) };
}