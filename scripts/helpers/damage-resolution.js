import { tokenCenter, distanceBetweenPoints } from "./tactical-distance.js";
import { hasFeature, abilityModifier, proficiencyBonus, formatModifier } from "./rules.js";
import { requestActorUpdate } from "./actor-relay.js";
import { sheetRollFlags } from "./rolls.js";

const SYSTEM_ID = "dnd-custom-ai";

// Rage (Barbare, SRD 5e — Niveau C, 2026-08-24) + chantier "types de dégâts" (Phase 1,
// 2026-08-24) : les 3 types de dégâts physiques SRD — servent à la fois à la résistance de Rage
// ci-dessous et à la nuance "contre les attaques non magiques" du champ générique
// damageResistances/Immunities/Vulnerabilities (cf. damageTypeMultiplier plus bas).
const PHYSICAL_DAMAGE_TYPES = new Set(["bludgeoning", "piercing", "slashing"]);

// Voile des anciens (Paladin, Serment des Anciens — Niveau C, 2026-08-24) : zone de 3 m autour
// du Paladin ayant activé la bascule "ancientsVeil" (config.js), même mécanisme de portée que
// isProtectedByDevotionAura (helpers/condition-immunity.js) mais pour une résistance aux dégâts
// plutôt qu'une immunité à une condition.
const ANCIENTS_VEIL_METERS = 3;

/** Voile des anciens : `actor` (le Paladin qui a activé la bascule inclus, distance à lui-même
 *  valant toujours 0) est protégé s'il existe un personnage avec l'état "ancientsVeil" actif à
 *  3 m ou moins. Contrairement à Aura de dévotion (bascule passive liée à la possession d'une
 *  Capacité), "ancientsVeil" est une bascule manuelle temporaire — cohérent avec le reste des
 *  conditions homebrew (blessed/guided/raging...), aucun décompte de durée. */
function isProtectedByAncientsVeil(actor) {
  const actorToken = actor.getActiveTokens()[0]?.document;
  if (!actorToken) return false;
  const actorCenter = tokenCenter(actorToken);

  return game.actors.some((paladin) => {
    if (paladin.type !== "character" || !paladin.statuses.has("ancientsVeil")) return false;
    const paladinToken = paladin.getActiveTokens()[0]?.document;
    if (!paladinToken) return false;
    return distanceBetweenPoints(actorCenter, tokenCenter(paladinToken)) <= ANCIENTS_VEIL_METERS;
  });
}

/** Vrai si `actor` possède `field` ("damageResistances"/"damageImmunities"/
 *  "damageVulnerabilities", cf. damageAffinitySchema, shared-schema.js) pour `damageType`.
 *  CharacterData range ce champ sous `system.combat` (comme ses voisins draconicResistanceType/
 *  favoredEnemyType) tandis que NpcData (pas de sous-objet `combat`) le garde à la racine — testé
 *  dans cet ordre plutôt que d'imposer le même emplacement aux deux DataModel. Un PNJ/PJ sans le
 *  champ (Actor non encore préparé, cas théorique) ne plante jamais, `false` par défaut. */
function hasGenericDamageAffinity(actor, damageType, field) {
  const set = actor.system.combat?.[field] ?? actor.system[field];
  return set?.has?.(damageType) ?? false;
}

/** Chantier "types de dégâts" (Phase 4, 2026-08-25) : vrai si `actor` porte une armure ÉQUIPÉE
 *  dont `field` ("damageResistances"/"damageImmunities"/"damageVulnerabilities", cf.
 *  damageAffinitySchema, shared-schema.js — désormais aussi sur ArmorData, item-data.js) contient
 *  `damageType`. Résistance/immunité/vulnérabilité PROPRE à l'objet, indépendante des cases
 *  génériques Personnage/PNJ ci-dessus — pas de nuance "contre les attaques non magiques"
 *  (`isMagicalSource`) ici : contrairement au champ générique qui modélise une résistance
 *  NATURELLE de créature (SRD), une armure qui protège du feu protège du feu quelle que soit la
 *  source de l'attaque, comme les résistances déjà câblées en dur (Rage, Résilience draconique,
 *  Affinité de la tempête). Plusieurs armures équipées en même temps (armure + bouclier) sont
 *  également possibles (emplacements distincts, cf. `slot`) : `some` sur toutes plutôt qu'une
 *  seule armure supposée. */
function hasArmorDamageAffinity(actor, damageType, field) {
  return actor.items.some(
    (item) => item.type === "armor" && item.system.equipped && item.system[field]?.has?.(damageType)
  );
}

/** Multiplicateur final (0 immunité, 0.5 résistance, 1 normal, 2 vulnérabilité) des dégâts de
 *  `damageType` subis par `actor` — combine les résistances déjà câblées en dur par Capacité/
 *  état (Rage, Résilience draconique, Affinité de la tempête, Voile des anciens) et le champ
 *  générique réglable par le MJ (chantier "types de dégâts", Phase 1, 2026-08-24 —
 *  damageResistances/Immunities/Vulnerabilities, cf. damageAffinitySchema, shared-schema.js).
 *
 *  `isSpellDamage` (Voile des anciens) : contrairement aux autres cas, cette résistance ne
 *  dépend d'AUCUN `damageType` précis (le SRD résiste à "les dégâts des sorts" quel que soit
 *  leur type).
 *
 *  `isMagicalSource` (chantier "types de dégâts", Phase 1) : pour les 3 types PHYSIQUES
 *  UNIQUEMENT, une source magique (sort — toujours magique — ou arme/attaque de PNJ dont la case
 *  "Magique" est cochée) contourne le champ GÉNÉRIQUE, fidèle à la nuance SRD "contre les
 *  attaques non magiques" propre aux monstres. Les résistances déjà câblées en dur (Rage
 *  incluse) n'ONT PAS cette nuance au SRD 5e et restent donc TOUJOURS actives quelle que soit
 *  `isMagicalSource` — seul le champ générique en tient compte.
 *
 *  Immunité prioritaire sur tout le reste ; résistance ET vulnérabilité sur le MÊME type
 *  s'annulent (dégâts normaux), règle SRD 5e explicite. */
export function damageTypeMultiplier(actor, damageType, { isSpellDamage = false, isMagicalSource = false } = {}) {
  const genericBypassed = Boolean(damageType && PHYSICAL_DAMAGE_TYPES.has(damageType) && isMagicalSource);

  const immune =
    (!genericBypassed && damageType && hasGenericDamageAffinity(actor, damageType, "damageImmunities")) ||
    Boolean(damageType && hasArmorDamageAffinity(actor, damageType, "damageImmunities"));
  if (immune) return 0;

  const resistant =
    (isSpellDamage && isProtectedByAncientsVeil(actor)) ||
    // Résilience draconique (Ensorceleur, Lignage draconique) : type choisi par le joueur, stocké
    // sur l'Actor (jamais sur un PNJ/une monture dont CharacterData n'a pas ce champ).
    Boolean(damageType && actor.system.combat?.draconicResistanceType === damageType) ||
    // Affinité de la tempête (Ensorceleur, Tempête 1, SRD 5e) : résistance passive fixe (toujours
    // active, pas un choix) aux dégâts de foudre/tonnerre.
    Boolean(
      damageType &&
        (damageType === "lightning" || damageType === "thunder") &&
        hasFeature(actor.items.contents, "Affinité de la tempête")
    ) ||
    // Rage (Barbare, SRD 5e) : résistance aux dégâts contondants/perforants/tranchants tant que
    // "raging" est actif, quel que soit le champ générique.
    Boolean(damageType && PHYSICAL_DAMAGE_TYPES.has(damageType) && actor.statuses?.has("raging")) ||
    Boolean(!genericBypassed && damageType && hasGenericDamageAffinity(actor, damageType, "damageResistances")) ||
    Boolean(damageType && hasArmorDamageAffinity(actor, damageType, "damageResistances"));

  const vulnerable =
    Boolean(!genericBypassed && damageType && hasGenericDamageAffinity(actor, damageType, "damageVulnerabilities")) ||
    Boolean(damageType && hasArmorDamageAffinity(actor, damageType, "damageVulnerabilities"));

  if (resistant && vulnerable) return 1;
  if (resistant) return 0.5;
  if (vulnerable) return 2;
  return 1;
}

// Prérequis Évasion/Tour de magie renforcé (Niveau C, 2026-08-24) : cf. spellSaveDamageMultiplier
// ci-dessous pour le détail des 2 exceptions posées par-dessus la règle SRD par défaut.
const EVASION_FEAT_NAME = "Évasion";
const POTENT_CANTRIP_FEAT_NAME = "Tour de magie renforcé";

/** Fraction (0, 0.5 ou 1) des dégâts d'un sort à sauvegarde réellement subie par `targetActor`,
 *  selon le résultat de SON jet (`outcome.success`), si le sort réduit normalement de moitié en
 *  cas de réussite (`outcome.halfOnSave`) — jusqu'ici jamais appliqué du tout (le bouton
 *  "Appliquer les dégâts" ignorait entièrement le résultat de la sauvegarde, cf.
 *  ClaudeFiles/MECANIQUES_A_AUTOMATISER.md > "Évasion"/"Tour de magie renforcé").
 *
 *  Règle SRD par défaut : réussite → moitié si `halfOnSave`, sinon 0 ; échec → dégâts pleins.
 *
 *  - **Évasion** (Roublard 7) : `targetActor` la possède, sauvegarde de Dextérité, `halfOnSave`
 *    vrai → réussite = AUCUN dégât (au lieu de moitié), échec = moitié (au lieu de plein).
 *  - **Tour de magie renforcé** (Magicien Évocation 6) : `sourceActor` (le lanceur) la possède,
 *    sort de niveau 0 (tour de magie), `halfOnSave` FAUX (le cas par défaut où une réussite
 *    n'inflige normalement AUCUN dégât) → réussite = moitié (au lieu d'aucun) ; échec inchangé.
 *    Les deux exceptions sont mutuellement exclusives par construction (`halfOnSave` opposé),
 *    jamais besoin d'arbitrer un conflit entre elles. */
function spellSaveDamageMultiplier(targetActor, sourceActor, outcome) {
  const { success, halfOnSave, ability, spellLevel } = outcome;
  if (ability === "dex" && halfOnSave && hasFeature(targetActor.items.contents, EVASION_FEAT_NAME)) {
    return success ? 0 : 0.5;
  }
  if (!halfOnSave && spellLevel === 0 && sourceActor && hasFeature(sourceActor.items.contents, POTENT_CANTRIP_FEAT_NAME)) {
    return success ? 0.5 : 1;
  }
  if (success) return halfOnSave ? 0.5 : 0;
  return 1;
}

/** Jet de sauvegarde de Constitution pour maintenir la concentration, SRD 5e : DD = 10 ou
 *  la moitié des dégâts subis (arrondi à l'inférieur), le plus élevé des deux. Échec = perte
 *  immédiate de la concentration en cours. Automatique (pas de bouton) : la DD ne dépend que
 *  des dégâts déjà connus au moment de l'application, pas d'un choix du joueur. */
async function checkConcentration(actor, damageAmount) {
  const spellName = actor.system.spells.concentratingOn;
  const dc = Math.max(10, Math.floor(damageAmount / 2));
  const conMod = abilityModifier(actor.system.abilities.con.total);
  const profBonus = actor.system.saves.con.proficient ? proficiencyBonus(actor.system.attributes.level) : 0;

  const roll = new Roll(`1d20${formatModifier(conMod + profBonus)}`);
  await roll.evaluate();
  const success = roll.total >= dc;

  if (!success) await requestActorUpdate(actor, { "system.spells.concentratingOn": "" });

  await roll.toMessage({
    speaker: ChatMessage.getSpeaker({ actor }),
    flavor: game.i18n.format(success ? "DND_CUSTOM.Chat.ConcentrationSuccess" : "DND_CUSTOM.Chat.ConcentrationFailed", {
      name: actor.name,
      spell: spellName,
      dc
    }),
    flags: sheetRollFlags({ savingThrowRoll: true })
  });
}

/** Applique `amount` de dégâts (`damageType`, `isSpellDamage`/`isMagicalSource` pour la
 *  résistance, cf. damageTypeMultiplier ci-dessus) aux tokens actuellement ciblés par le client
 *  qui appelle (`game.user.targets`) — point d'entrée du bouton "Appliquer les dégâts"
 *  (helpers/chat-message-hooks.js). PV temporaires absorbés en premier (SRD 5e). */
export async function applyDamageToTargets(
  amount,
  sourceActorId,
  damageType = "",
  isSpellDamage = false,
  spellName = "",
  isMagicalSource = false
) {
  const targets = Array.from(game.user.targets);
  if (!targets.length) {
    ui.notifications.warn(game.i18n.localize("DND_CUSTOM.Chat.NoTarget"));
    return;
  }

  const sourceActor = sourceActorId ? game.actors.get(sourceActorId) : null;

  for (const token of targets) {
    const actor = token.actor;
    const hp = actor?.system.attributes?.hp;
    if (!hp) continue;

    // PvP bloqué (retour de test) : un personnage joueur ne peut pas infliger de dégâts à un
    // autre personnage joueur (PNJ/monture non concernés).
    if (sourceActor?.type === "character" && actor.type === "character" && actor.id !== sourceActor.id) {
      ui.notifications.warn(
        game.i18n.format("DND_CUSTOM.Chat.PvpBlocked", { attacker: sourceActor.name, target: actor.name })
      );
      continue;
    }

    // Auto-dégâts (retour de test, ANOMALIES_ACTIVES.md) : un Joueur ne peut plus s'appliquer de
    // dégâts à lui-même en se ciblant lui-même — seul le MJ le peut désormais (poison, chute,
    // piège... déclenchés à sa discrétion), même bouton "Appliquer les dégâts" pour les deux,
    // seule la permission de cliquer change selon qui est connecté.
    if (sourceActor?.type === "character" && actor.type === "character" && actor.id === sourceActor.id && !game.user.isGM) {
      ui.notifications.warn(game.i18n.format("DND_CUSTOM.Chat.SelfDamageBlocked", { name: actor.name }));
      continue;
    }

    // halfOnSave (chantier "prérequis Évasion/Tour de magie renforcé", Niveau C, 2026-08-24) :
    // n'agit QUE sur des dégâts de sort (`isSpellDamage`, jamais une attaque d'arme/PNJ) ET
    // seulement si le flag posé sur CETTE cible par #onCastSpell (`pendingSpellSaveOutcome`)
    // correspond au MÊME sort que ce jet de dégâts (`spellName`, cf. commentaire de rollDamage#
    // spellName, rolls.js) — sinon dégâts pleins, comportement identique à avant ce chantier, et
    // le flag n'est PAS consommé (laissé disponible pour le jet de dégâts qui lui correspond
    // vraiment, s'il arrive plus tard). Toujours consommé (unset) dès qu'utilisé, qu'il s'agisse
    // d'une réussite/d'un échec — jamais réutilisable pour un dégât ultérieur.
    const pendingSaveOutcome = isSpellDamage ? actor.getFlag(SYSTEM_ID, "pendingSpellSaveOutcome") : null;
    const matchesPendingSave = pendingSaveOutcome && pendingSaveOutcome.spellName === spellName;
    const saveMultiplier = matchesPendingSave ? spellSaveDamageMultiplier(actor, sourceActor, pendingSaveOutcome) : 1;
    if (matchesPendingSave) await actor.unsetFlag(SYSTEM_ID, "pendingSpellSaveOutcome");

    // Résistance/immunité/vulnérabilité de type (cf. damageTypeMultiplier ci-dessus) appliquée
    // APRÈS la réduction de sauvegarde ci-dessus, chacune arrondie à l'inférieur séparément —
    // cumul de réductions multiples conforme au SRD 5e (jamais une simple multiplication des
    // fractions en un seul arrondi). `isMagicalSource` : cf. WeaponData#magic (item-data.js)/
    // NpcData#attack.magic pour une attaque, toujours vrai pour un sort (rollDamage#isSpellDamage
    // déjà posé par #onRollSpellDamage).
    const typeMultiplier = damageTypeMultiplier(actor, damageType, { isSpellDamage, isMagicalSource });
    let targetAmount = saveMultiplier === 1 ? amount : Math.floor(amount * saveMultiplier);
    targetAmount = typeMultiplier === 1 ? targetAmount : Math.floor(targetAmount * typeMultiplier);

    let remaining = targetAmount;
    const updates = {};
    const temp = hp.temp ?? 0;
    if (temp > 0) {
      const absorbed = Math.min(temp, remaining);
      updates["system.attributes.hp.temp"] = temp - absorbed;
      remaining -= absorbed;
    }
    if (remaining > 0) updates["system.attributes.hp.value"] = Math.max(0, hp.value - remaining);

    // dndCustomDamageApply : seul flux autorisé à faire BAISSER system.attributes.hp.value
    // depuis un client non-MJ (cf. preUpdateActor, dnd-custom-ai.js) — un jet de dégâts réel a
    // déjà dû être posté en chat et un bouton cliqué explicitement (ex. dégâts d'un PNJ contre le
    // personnage du Joueur, source non "character" donc jamais concernée par le blocage PvP/
    // auto-dégâts ci-dessus), tout en fermant le vrai trou de sécurité signalé par un testeur :
    // taper une valeur arbitraire directement dans le champ PV de l'en-tête (character-sheet.hbs,
    // désormais `disabled` côté Joueur).
    if (Object.keys(updates).length) await requestActorUpdate(actor, updates, { dndCustomDamageApply: true });
    if (targetAmount > 0 && actor.type === "character" && actor.system.spells.concentratingOn) {
      await checkConcentration(actor, targetAmount);
    }
  }
}

/** Applique `amount` de soin (PV positifs) aux tokens actuellement ciblés par le client qui
 *  appelle — point d'entrée des boutons "Appliquer le soin"/"Appliquer la réduction"
 *  (helpers/chat-message-hooks.js). Pas de blocage PvP (soigner un autre Joueur est toujours
 *  légitime) ni d'absorption de PV temporaires (SRD 5e : les PV temporaires n'interagissent
 *  qu'avec les dégâts, jamais avec les soins). */
export async function applyHealToTargets(amount) {
  const targets = Array.from(game.user.targets);
  if (!targets.length) {
    ui.notifications.warn(game.i18n.localize("DND_CUSTOM.Chat.NoTarget"));
    return;
  }

  for (const token of targets) {
    const actor = token.actor;
    const hp = actor?.system.attributes?.hp;
    if (!hp) continue;
    await requestActorUpdate(actor, { "system.attributes.hp.value": Math.min(hp.value + amount, hp.max) });
  }
}
