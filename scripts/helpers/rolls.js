/** Indique si `actor` est Combattant d'un combat existant. */
function isActorInCombat(actor) {
  return Boolean(game.combat?.combatants.some((combatant) => combatant.actor?.id === actor.id));
}

/** Dé de d20 : 2d20kh1 (avantage seul), 2d20kl1 (désavantage seul) ou 1d20 (aucun ou les deux). */
export function d20Die(advantage, disadvantage) {
  if (advantage && !disadvantage) return "2d20kh1";
  if (disadvantage && !advantage) return "2d20kl1";
  return "1d20";
}

/** Flags de message marquant un jet généré par le système (`sheetRoll`), fusionnés avec `extra`. */
export function sheetRollFlags(extra = {}) {
  return { "dnd-custom-ai": { ...extra, sheetRoll: true } };
}

/** Critique ou échec critique sur le dé naturel, seulement en combat ; le 1 naturel prime sur un critique forcé. */
function criticalOutcome(roll, actor, { criticalRules, forceCriticalHit, criticalThreshold }) {
  if (!(criticalRules || forceCriticalHit) || !isActorInCombat(actor)) return { isCriticalHit: false, isCriticalFumble: false };
  const naturalFace = roll.dice[0]?.results.find((result) => result.active)?.result;
  const isCriticalFumble = naturalFace === 1;
  return { isCriticalHit: !isCriticalFumble && (naturalFace >= criticalThreshold || forceCriticalHit), isCriticalFumble };
}

/** Libellé du jet : avantage/désavantage, critique, puis Touché/Raté contre la CA de chaque cible. */
function rollCheckLabel(flavor, roll, { advantage, disadvantage, compareToTargetAc }, { isCriticalHit, isCriticalFumble }) {
  const suffix = (key) => ` (${game.i18n.localize(key)})`;
  let label = flavor;
  if (advantage && !disadvantage) label += suffix("DND_CUSTOM.Roll.Advantage");
  if (disadvantage && !advantage) label += suffix("DND_CUSTOM.Roll.Disadvantage");
  if (isCriticalHit) label += suffix("DND_CUSTOM.Roll.CriticalHit");
  else if (isCriticalFumble) label += suffix("DND_CUSTOM.Roll.CriticalFumble");
  if (!compareToTargetAc) return label;

  for (const token of game.user.targets) {
    const ac = token.actor?.system?.attributes?.ac?.value;
    if (!Number.isFinite(ac)) continue;
    const hit = isCriticalHit || (!isCriticalFumble && roll.total >= ac);
    const resultKey = hit ? "DND_CUSTOM.Roll.AttackHit" : "DND_CUSTOM.Roll.AttackMiss";
    label += `<br>${game.i18n.format(resultKey, { target: token.name, ac })}`;
  }
  return label;
}

/**
 * Jet de d20 posté en chat (test, sauvegarde, attaque) : avantage/désavantage, Touché/Raté contre la CA,
 * critiques en combat et flags de relance (Chanceux, Indomptable, inspiration).
 */
export async function rollCheck({
  actor,
  formula,
  flavor,
  advantage = false,
  disadvantage = false,
  compareToTargetAc = false,
  criticalRules = false,
  forceCriticalHit = false,
  criticalThreshold = 20,
  savingThrow = false,
  inspirationEligible = false
}) {
  const die = d20Die(advantage, disadvantage);
  const roll = new Roll(`${die}${formula}`);
  await roll.evaluate();

  const critical = criticalOutcome(roll, actor, { criticalRules, forceCriticalHit, criticalThreshold });
  const { isCriticalHit, isCriticalFumble } = critical;
  const label = rollCheckLabel(flavor, roll, { advantage, disadvantage, compareToTargetAc }, critical);

  // Sur un critique, affiche seulement le dé naturel.
  const messageRoll = isCriticalHit || isCriticalFumble ? Roll.fromTerms([roll.terms[0]]) : roll;
  const flags = sheetRollFlags({
    ...(isCriticalHit ? { criticalHit: true } : {}),
    ...(isCriticalFumble ? { criticalFumble: true } : {}),
    // Accent visuel des jets d'attaque.
    ...(compareToTargetAc ? { attackRoll: true } : {}),
    // Jet relançable (Chanceux) : formule et acteur mémorisés.
    luckRoll: true,
    luckFormula: `${die}${formula}`,
    luckActorId: actor.id,
    // Jet éligible au point d'inspiration.
    ...(inspirationEligible ? { inspirationEligible: true, checkFlavor: flavor } : {}),
    // Jet de sauvegarde éligible à Indomptable.
    ...(savingThrow ? { savingThrowRoll: true } : {})
  });
  await messageRoll.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor: label, flags });
  return { roll, isCriticalHit, isCriticalFumble };
}

/**
 * Jet de dégâts posté en chat avec bouton « Appliquer les dégâts ».
 * Un critique multiplie les dés par `criticalMultiplier` (3 avec Critique brutal), jamais le modificateur.
 */
export async function rollDamage({
  actor,
  dice,
  formula,
  flavor,
  critical = false,
  criticalMultiplier = 2,
  damageType = "",
  isSpellDamage = false,
  spellName = "",
  isMagicalSource = false
}) {
  const roll = new Roll(`${dice}${formula}`);
  if (critical) roll.alter(criticalMultiplier, 0);
  await roll.evaluate();
  const label = critical ? `${flavor} (${game.i18n.localize("DND_CUSTOM.Roll.CriticalDamage")})` : flavor;
  // Flags lus par « Appliquer les dégâts » : type, origine sort, nom du sort et source magique.
  await roll.toMessage({
    speaker: ChatMessage.getSpeaker({ actor }),
    flavor: label,
    flags: sheetRollFlags({
      damageRoll: true,
      damageType,
      ...(critical ? { criticalHit: true } : {}),
      ...(isSpellDamage ? { isSpellDamage: true } : {}),
      ...(spellName ? { spellName } : {}),
      ...(isMagicalSource ? { isMagicalSource: true } : {})
    })
  });
  return roll;
}

/** Jet de soin d'un sort posté en chat avec bouton « Appliquer le soin ». */
export async function rollHeal({ actor, dice, formula, flavor }) {
  const roll = new Roll(`${dice}${formula}`);
  await roll.evaluate();
  await roll.toMessage({
    speaker: ChatMessage.getSpeaker({ actor }),
    flavor,
    flags: sheetRollFlags({ healRoll: true })
  });
  return roll;
}
