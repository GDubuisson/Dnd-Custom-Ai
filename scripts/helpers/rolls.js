/** Un combattant est considéré "en combat" seulement s'il est effectivement Combattant d'un
 *  combat existant (pas juste "une scène a un combat quelque part") — retour de test : les
 *  coups/échecs critiques (1/20 naturel) ne doivent s'appliquer QUE pendant un combat, jamais
 *  sur un jet de sauvegarde hors combat (poison bu à l'auberge, etc.). */
function isActorInCombat(actor) {
  return Boolean(game.combat?.combatants.some((combatant) => combatant.actor?.id === actor.id));
}

/** Fusionne `sheetRoll: true` dans les flags `dnd-custom-ai` d'un message de jet, quels que
 *  soient les autres flags déjà posés par l'appelant (`damageRoll`, `healRoll`, `luckRoll`...).
 *  Marque TOUT jet généré par ce système (bouton de fiche, relance automatique d'un don, jet de
 *  concentration...) — jamais un jet tapé à la main (`/r`) — pour lui donner un style de carte
 *  de chat distinct (demande explicite de l'utilisateur, 2026-09-04). Repéré par le hook
 *  `renderChatMessageHTML` (dnd-custom-ai.js), stylé en CSS via `.dnd-sheet-roll` (hors du bloc
 *  `.dnd-custom-ai` : les cartes de chat vivent dans la barre latérale, jamais dans la fiche). */
export function sheetRollFlags(extra = {}) {
  return { "dnd-custom-ai": { ...extra, sheetRoll: true } };
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
 *  dés du jet de dégâts suivant (cf. rollDamage ci-dessous).
 *
 *  `forceCriticalHit` (jets d'attaque uniquement) : coup critique automatique indépendamment du
 *  dé naturel obtenu — ex. Assassin (Roublard, cf. world-items/features.json > "Assassinat")
 *  contre une cible marquée "Surprise" (DND_CUSTOM.conditions dans config.js). Toujours soumis à
 *  la même garde `isActorInCombat` que `criticalRules` : pas de critique automatique hors
 *  combat. N'annule jamais un échec critique naturel (1 naturel reste un échec critique même si
 *  `forceCriticalHit` est vrai — l'un ou l'autre, jamais les deux en même temps en pratique
 *  puisque `forceCriticalHit` dépend d'un état de la cible, pas du dé).
 *
 *  `criticalThreshold` (jets d'attaque uniquement, défaut 20) : seuil à partir duquel le dé
 *  naturel compte comme critique — ex. Critique amélioré (Champion, Guerrier, SRD 5e : critique
 *  sur 19-20 au lieu de 20 seul). Calculé par l'appelant (actor-sheet.js > hasFeature), jamais ici
 *  (même principe que le don Chanceux ci-dessous : ce helper générique reste ignorant des noms de
 *  Capacités précis). Un 1 naturel reste toujours un échec critique, quel que soit le seuil.
 *
 *  `inspirationEligible` (jets de caractéristique/compétence UNIQUEMENT, posé seulement par
 *  #onRollAbility/#onRollSkill dans actor-sheet.js — jamais par une sauvegarde ou une attaque) :
 *  règle maison "points d'inspiration" (PI), ressource libre accordée manuellement par le MJ
 *  (system.attributes.inspirationPoints, CharacterData uniquement). Contrairement à Chanceux/
 *  Indomptable ci-dessous (qui gardent le message d'origine et postent une relance à la suite), le
 *  hook dédié (dnd-custom-ai.js) SUPPRIME le message d'origine du chat et remplace son résultat,
 *  conformément à la demande explicite de l'utilisateur — jamais les deux visibles en même temps. */
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
  if ((criticalRules || forceCriticalHit) && isActorInCombat(actor)) {
    const naturalFace = roll.dice[0]?.results.find((result) => result.active)?.result;
    // Un 1 naturel reste toujours un échec critique en premier, avant même de considérer
    // forceCriticalHit : un jet raté au dé ne devient jamais un coup critique automatique.
    isCriticalFumble = naturalFace === 1;
    isCriticalHit = !isCriticalFumble && (naturalFace >= criticalThreshold || forceCriticalHit);
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
  const flags = sheetRollFlags();
  if (isCriticalHit) flags["dnd-custom-ai"].criticalHit = true;
  if (isCriticalFumble) flags["dnd-custom-ai"].criticalFumble = true;
  // Accent visuel par type de jet (cf. .dnd-roll-attack, dnd-custom-ai.css) : `compareToTargetAc`
  // n'est jamais vrai en dehors d'un vrai jet d'attaque (arme/sort, cf. docstring ci-dessus),
  // signal déjà fiable — pas besoin d'un paramètre dédié.
  if (compareToTargetAc) flags["dnd-custom-ai"].attackRoll = true;
  // Don "Chanceux" (SRD 5e) : tout jet de d20 passant par rollCheck (test de caractéristique/
  // compétence, sauvegarde, attaque) est un jet potentiellement "relançable" contre un point de
  // chance — la formule exacte est reprise telle quelle pour la relance (même die 1d20/2d20kh1/
  // 2d20kl1 si avantage/désavantage était déjà en jeu). Le hook renderChatMessageHTML
  // (dnd-custom-ai.js) décide seul si un bouton doit apparaître (l'acteur possède le don ET il
  // lui reste des charges) — rolls.js reste volontairement ignorant de ce don, aucun import de
  // hasFeature ici, pour ne pas coupler un helper de jet générique à un don précis.
  flags["dnd-custom-ai"].luckRoll = true;
  flags["dnd-custom-ai"].luckFormula = `${die}${formula}`;
  flags["dnd-custom-ai"].luckActorId = actor.id;
  // Points d'inspiration (voir docstring ci-dessus) : réutilise luckFormula/luckActorId déjà
  // posés juste au-dessus (même formule, même acteur) — seul ce flag supplémentaire change de
  // famille de jets éligibles. `flavor` original conservé tel quel (sans le suffixe Avantage/
  // Désavantage déjà inclus dans `label`) pour que le hook puisse composer son propre libellé de
  // relance sans dépendre du texte déjà construit ci-dessus.
  if (inspirationEligible) {
    flags["dnd-custom-ai"].inspirationEligible = true;
    flags["dnd-custom-ai"].checkFlavor = flavor;
  }
  // Capacité "Indomptable" (Guerrier 9, SRD 5e) : relance complète d'un jet de SAUVEGARDE raté,
  // nouveau résultat obligatoire (contrairement à Chanceux/Chance du Fiélon ci-dessus, qui gardent
  // le meilleur des deux) — `savingThrow` distingue ce cas des tests/jets d'attaque, jamais posé
  // par #onRollAbility/#onRollSkill/les jets d'attaque. Même flag `luckActorId`/`luckFormula` que
  // Chanceux (relance la même formule), lu par un hook dédié (dnd-custom-ai.js), volontairement
  // ignorant lui aussi du nom de Capacité précis.
  if (savingThrow) flags["dnd-custom-ai"].savingThrowRoll = true;
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
 *  `evaluate()` (altérer un jet déjà résolu n'a pas de sens côté Foundry).
 *
 *  `criticalMultiplier` (défaut 2, ignoré si `critical` est faux) : Critique brutal (Barbare 9,
 *  SRD 5e — "un dé de dégâts SUPPLÉMENTAIRE" en plus du doublement normal) passe 3 depuis
 *  l'appelant (#onRollWeaponDamage, actor-sheet.js) — approximation assumée pour une formule à
 *  plusieurs types de dés (ex. "1d8+1d4") : chaque terme de dé reçoit +1 exemplaire plutôt qu'un
 *  seul dé supplémentaire au total, cas rare en pratique (l'immense majorité des armes n'ont
 *  qu'un seul type de dé). Ce helper générique reste ignorant du nom "Critique brutal" lui-même,
 *  même principe que `criticalThreshold` ci-dessus. */
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
  // criticalHit ici aussi (même flag que rollCheck ci-dessus) : le jet de dégâts doublé profite
  // du même effet visuel que le jet d'attaque qui l'a déclenché (retour de test, lot 3 point 8).
  // `damageType` (clé brute DND_CUSTOM.damageTypes, ex. "fire" — chantier "8 sous-classes déjà à
  // ≥1 mécanique", 2026-08-23) : posé en flag pour que le bouton "Appliquer les dégâts" (hook
  // renderChatMessageHTML, dnd-custom-ai.js > applyDamageToTargets) puisse résoudre une
  // résistance éventuelle propre à CHAQUE cible ciblée (ex. Résilience draconique). Vide = type
  // non renseigné à la source (ex. Capacité `dealsDamage`) : jamais de résistance appliquée.
  // `isSpellDamage` (Voile des anciens, Paladin Anciens — Niveau C, 2026-08-24) : vrai UNIQUEMENT
  // pour un jet posé par #onRollSpellDamage (actor-sheet.js), jamais pour une arme/Capacité —
  // seul moyen pour isResistantToDamageType (dnd-custom-ai.js) de savoir qu'un dégât vient d'un
  // SORT plutôt que d'une source précise, indépendamment de son `damageType`.
  // `spellName` (chantier "prérequis Évasion/Tour de magie renforcé", Niveau C, 2026-08-24) :
  // nom EXACT du Sort, posé uniquement par #onRollSpellDamage — permet à applyDamageToTargets
  // (dnd-custom-ai.js) de vérifier que le résultat de sauvegarde stocké sur la cible
  // (`pendingSpellSaveOutcome`, posé par #onCastSpell) correspond bien à CE sort précis avant
  // d'en réduire les dégâts, plutôt que d'appliquer aveuglément le dernier résultat connu.
  // `isMagicalSource` (chantier "types de dégâts", Phase 1, 2026-08-24) : vrai pour un sort
  // (toujours magique au SRD, posé par #onRollSpellDamage), ou selon WeaponData#magic/
  // NpcData#attack.magic pour une arme/attaque de PNJ — contourne la résistance/immunité
  // GÉNÉRIQUE (pas celle câblée en dur) aux 3 types de dégâts physiques, cf.
  // damageTypeMultiplier (dnd-custom-ai.js).
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
    flags: sheetRollFlags({ healRoll: true })
  });
  return roll;
}
