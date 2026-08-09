/** Jet de d20 (test de caractéristique, sauvegarde, compétence, attaque) posté dans le chat.
 *  Avantage/désavantage : `2d20kh1`/`2d20kl1` (SRD 5e) au lieu d'un simple `1d20` ; les deux
 *  ensemble s'annulent (retombe sur `1d20`), conformément à la règle. `formula` est le
 *  modificateur signé à ajouter (ex. "+3", "-1"), réutilisant `formatModifier` de rules.js. */
export async function rollCheck({ actor, formula, flavor, advantage = false, disadvantage = false }) {
  const useAdvantage = advantage && !disadvantage;
  const useDisadvantage = disadvantage && !advantage;
  const die = useAdvantage ? "2d20kh1" : useDisadvantage ? "2d20kl1" : "1d20";

  const roll = new Roll(`${die}${formula}`);
  await roll.evaluate();

  let label = flavor;
  if (useAdvantage) label += ` (${game.i18n.localize("DND_CUSTOM.Roll.Advantage")})`;
  if (useDisadvantage) label += ` (${game.i18n.localize("DND_CUSTOM.Roll.Disadvantage")})`;

  await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor: label });
  return roll;
}

/** Jet de dégâts (arme, sort...) : pas d'avantage/désavantage (ne s'applique qu'aux jets de
 *  d20, SRD 5e), juste le(s) dé(s) de dégâts + modificateur signé. */
export async function rollDamage({ actor, dice, formula, flavor }) {
  const roll = new Roll(`${dice}${formula}`);
  await roll.evaluate();
  await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor });
  return roll;
}
