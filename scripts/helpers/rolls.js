/** Jet de d20 (test de caractéristique, sauvegarde, compétence, attaque) posté dans le chat.
 *  Avantage/désavantage : `2d20kh1`/`2d20kl1` (SRD 5e) au lieu d'un simple `1d20` ; les deux
 *  ensemble s'annulent (retombe sur `1d20`), conformément à la règle. `formula` est le
 *  modificateur signé à ajouter (ex. "+3", "-1"), réutilisant `formatModifier` de rules.js.
 *  `compareToTargetAc` (jets d'attaque uniquement, cf. #onRollWeaponAttack/#onCastSpell dans
 *  actor-sheet.js) : compare automatiquement le total obtenu à la CA de chaque token
 *  actuellement ciblé par le joueur qui lance (`game.user.targets`) et ajoute Touche/Rate à la
 *  suite du jet dans le même message — retour de test. Aucune cible sélectionnée : rien
 *  n'est ajouté, pas d'erreur, le jet reste "manuel" (au MJ de juger). */
export async function rollCheck({
  actor,
  formula,
  flavor,
  advantage = false,
  disadvantage = false,
  compareToTargetAc = false
}) {
  const useAdvantage = advantage && !disadvantage;
  const useDisadvantage = disadvantage && !advantage;
  const die = useAdvantage ? "2d20kh1" : useDisadvantage ? "2d20kl1" : "1d20";

  const roll = new Roll(`${die}${formula}`);
  await roll.evaluate();

  let label = flavor;
  if (useAdvantage) label += ` (${game.i18n.localize("DND_CUSTOM.Roll.Advantage")})`;
  if (useDisadvantage) label += ` (${game.i18n.localize("DND_CUSTOM.Roll.Disadvantage")})`;

  if (compareToTargetAc) {
    for (const token of game.user.targets) {
      const ac = token.actor?.system?.attributes?.ac?.value;
      if (!Number.isFinite(ac)) continue;
      const hit = roll.total >= ac;
      const resultKey = hit ? "DND_CUSTOM.Roll.AttackHit" : "DND_CUSTOM.Roll.AttackMiss";
      label += `<br>${game.i18n.format(resultKey, { target: token.name, ac })}`;
    }
  }

  await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor: label });
  return roll;
}

/** Jet de dégâts (arme, sort...) : pas d'avantage/désavantage (ne s'applique qu'aux jets de
 *  d20, SRD 5e), juste le(s) dé(s) de dégâts + modificateur signé. Marqué par un flag
 *  (`flags["dnd-custom-ai"].damageRoll`) repéré par le hook `renderChatMessageHTML` (cf.
 *  dnd-custom-ai.js) pour ajouter un bouton "Appliquer les dégâts" sur sa carte de chat. */
export async function rollDamage({ actor, dice, formula, flavor }) {
  const roll = new Roll(`${dice}${formula}`);
  await roll.evaluate();
  await roll.toMessage({
    speaker: ChatMessage.getSpeaker({ actor }),
    flavor,
    flags: { "dnd-custom-ai": { damageRoll: true } }
  });
  return roll;
}
