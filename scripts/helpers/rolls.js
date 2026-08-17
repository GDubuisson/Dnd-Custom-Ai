/** Un combattant est considéré "en combat" seulement s'il est effectivement Combattant d'un
 *  combat existant (pas juste "une scène a un combat quelque part") — retour de test : les
 *  coups/échecs critiques (1/20 naturel) ne doivent s'appliquer QUE pendant un combat, jamais
 *  sur un jet de sauvegarde hors combat (poison bu à l'auberge, etc.). */
function isActorInCombat(actor) {
  return Boolean(game.combat?.combatants.some((combatant) => combatant.actor?.id === actor.id));
}

/** Jet de d20 (test de caractéristique, sauvegarde, compétence, attaque) posté dans le chat.
 *  Avantage/désavantage : `2d20kh1`/`2d20kl1` (SRD 5e) au lieu d'un simple `1d20` ; les deux
 *  ensemble s'annulent (retombe sur `1d20`), conformément à la règle. `formula` est le
 *  modificateur signé à ajouter (ex. "+3", "-1"), réutilisant `formatModifier` de rules.js.
 *  `compareToTargetAc` (jets d'attaque uniquement, cf. #onRollWeaponAttack/#onCastSpell dans
 *  actor-sheet.js) : compare automatiquement le total obtenu à la CA de chaque token
 *  actuellement ciblé par le joueur qui lance (`game.user.targets`) et ajoute Touche/Rate à la
 *  suite du jet dans le même message — retour de test. Aucune cible sélectionnée : rien
 *  n'est ajouté, pas d'erreur, le jet reste "manuel" (au MJ de juger).
 *
 *  `criticalRules` (jets d'attaque et de sauvegarde uniquement — pas les tests de
 *  caractéristique/compétence/outil, cf. retour de test) : un 1 naturel est TOUJOURS un échec
 *  critique et un 20 naturel TOUJOURS une réussite critique, quels que soient les bonus, mais
 *  SEULEMENT si l'Actor qui lance est actuellement Combattant d'un combat en cours (`Roll.dice[0]
 *  .results.find(r => r.active)` lit le dé réellement RETENU en cas d'avantage/désavantage —
 *  un 1 naturel écarté par l'avantage ne compte pas, comportement RAW). Pour une attaque avec
 *  cible(s) sélectionnée(s), un coup critique touche automatiquement (même CA très haute) et un
 *  échec critique rate automatiquement (même CA très basse). Pour une sauvegarde, ce système ne
 *  compare déjà aucun jet à une CD (le MJ juge à l'œil) : seul le libellé de chat est ajouté,
 *  au MJ d'appliquer la règle. Retourne `isCriticalHit` pour que l'appelant puisse doubler les
 *  dés du jet de dégâts suivant (cf. rollDamage ci-dessous). */
export async function rollCheck({
  actor,
  formula,
  flavor,
  advantage = false,
  disadvantage = false,
  compareToTargetAc = false,
  criticalRules = false
}) {
  const useAdvantage = advantage && !disadvantage;
  const useDisadvantage = disadvantage && !advantage;
  const die = useAdvantage ? "2d20kh1" : useDisadvantage ? "2d20kl1" : "1d20";

  const roll = new Roll(`${die}${formula}`);
  await roll.evaluate();

  let label = flavor;
  if (useAdvantage) label += ` (${game.i18n.localize("DND_CUSTOM.Roll.Advantage")})`;
  if (useDisadvantage) label += ` (${game.i18n.localize("DND_CUSTOM.Roll.Disadvantage")})`;

  let isCriticalHit = false;
  let isCriticalFumble = false;
  if (criticalRules && isActorInCombat(actor)) {
    const naturalFace = roll.dice[0]?.results.find((result) => result.active)?.result;
    isCriticalHit = naturalFace === 20;
    isCriticalFumble = naturalFace === 1;
    if (isCriticalHit) label += ` (${game.i18n.localize("DND_CUSTOM.Roll.CriticalHit")})`;
    else if (isCriticalFumble) label += ` (${game.i18n.localize("DND_CUSTOM.Roll.CriticalFumble")})`;
  }

  if (compareToTargetAc) {
    for (const token of game.user.targets) {
      const ac = token.actor?.system?.attributes?.ac?.value;
      if (!Number.isFinite(ac)) continue;
      const hit = isCriticalHit ? true : isCriticalFumble ? false : roll.total >= ac;
      const resultKey = hit ? "DND_CUSTOM.Roll.AttackHit" : "DND_CUSTOM.Roll.AttackMiss";
      label += `<br>${game.i18n.format(resultKey, { target: token.name, ac })}`;
    }
  }

  // Retour de test : sur un échec/coup critique, ne pas afficher le modificateur dans le
  // résultat — seul le dé naturel compte pour la règle (déjà vrai plus haut, `hit`
  // forcé indépendamment du total), le message de chat doit refléter ça visuellement plutôt que
  // d'afficher un total (dé + modificateur) qui n'a plus d'incidence sur le résultat.
  // `Roll.fromTerms` reconstruit un jet à partir du seul premier terme déjà évalué (le(s) d20,
  // `roll.terms[0]`) SANS relancer les dés — même résultat physique, juste sans le(s) terme(s)
  // de modificateur affiché(s).
  const messageRoll = isCriticalHit || isCriticalFumble ? Roll.fromTerms([roll.terms[0]]) : roll;
  // Retour de test (lot 3, point 8) : au-delà du libellé texte ci-dessus, un coup/échec
  // critique doit aussi se voir sur la carte de jet elle-même — ces deux flags sont repérés par
  // le hook renderChatMessageHTML (dnd-custom-ai.js) pour poser une bordure/halo + icône dédiés
  // sur `.dice-roll`, jamais la couleur seule (accessibilité).
  const flags = { "dnd-custom-ai": {} };
  if (isCriticalHit) flags["dnd-custom-ai"].criticalHit = true;
  if (isCriticalFumble) flags["dnd-custom-ai"].criticalFumble = true;
  await messageRoll.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor: label, flags });
  return { roll, isCriticalHit, isCriticalFumble };
}

/** Jet de dégâts (arme, sort...) : pas d'avantage/désavantage (ne s'applique qu'aux jets de
 *  d20, SRD 5e), juste le(s) dé(s) de dégâts + modificateur signé. Marqué par un flag
 *  (`flags["dnd-custom-ai"].damageRoll`) repéré par le hook `renderChatMessageHTML` (cf.
 *  dnd-custom-ai.js) pour ajouter un bouton "Appliquer les dégâts" sur sa carte de chat.
 *
 *  `critical` (coup critique, cf. rollCheck > isCriticalHit) : double le nombre de dés de
 *  dégâts, JAMAIS le modificateur (SRD 5e — seuls les dés doublent). `Roll#alter(2, 0)` est
 *  l'API native de Foundry pour ça : elle ne touche qu'aux DiceTerm, `multiplyNumeric` reste à
 *  `false` par défaut donc les termes numériques (le modificateur) ne sont jamais multipliés —
 *  gère aussi correctement une formule à plusieurs types de dés (ex. arme magique
 *  "1d8+1d4"), contrairement à une manipulation de chaîne de caractères. DOIT être appelé avant
 *  `evaluate()` (altérer un jet déjà résolu n'a pas de sens côté Foundry). */
export async function rollDamage({ actor, dice, formula, flavor, critical = false }) {
  const roll = new Roll(`${dice}${formula}`);
  if (critical) roll.alter(2, 0);
  await roll.evaluate();
  const label = critical ? `${flavor} (${game.i18n.localize("DND_CUSTOM.Roll.CriticalDamage")})` : flavor;
  // criticalHit ici aussi (même flag que rollCheck ci-dessus) : le jet de dégâts doublé profite
  // du même effet visuel que le jet d'attaque qui l'a déclenché (retour de test, lot 3 point 8).
  await roll.toMessage({
    speaker: ChatMessage.getSpeaker({ actor }),
    flavor: label,
    flags: { "dnd-custom-ai": { damageRoll: true, ...(critical ? { criticalHit: true } : {}) } }
  });
  return roll;
}

/** Jet de soin d'un sort (ex. Mot de guérison, Soin des blessures) : dé(s) + modificateur signé.
 *  Contrairement à `rollDamage` ci-dessus, un soin de sort SRD 5e ajoute bien le modificateur de
 *  caractéristique d'incantation (l'appelant passe `formatModifier(spellAbilityMod)` en
 *  `formula`, cf. #onCastSpell dans actor-sheet.js) — pas de variante critique, aucune règle SRD
 *  ne double les dés d'un soin. Marqué par un flag (`flags["dnd-custom-ai"].healRoll`) repéré
 *  par le hook `renderChatMessageHTML` (cf. dnd-custom-ai.js) pour ajouter un bouton "Appliquer
 *  le soin" sur sa carte de chat, même mécanique que `damageRoll` mais en PV positifs. */
export async function rollHeal({ actor, dice, formula, flavor }) {
  const roll = new Roll(`${dice}${formula}`);
  await roll.evaluate();
  await roll.toMessage({
    speaker: ChatMessage.getSpeaker({ actor }),
    flavor,
    flags: { "dnd-custom-ai": { healRoll: true } }
  });
  return roll;
}
