import { tokenCenter, distanceBetweenPoints } from "./tactical-distance.js";
import { hasFeature, abilityModifier, proficiencyBonus, formatModifier } from "./rules.js";
import { requestActorUpdate } from "./actor-relay.js";
import { sheetRollFlags } from "./rolls.js";

const SYSTEM_ID = "dnd-custom-ai";

// Types de dégâts physiques (Rage, nuance « attaques non magiques »).
const PHYSICAL_DAMAGE_TYPES = new Set(["bludgeoning", "piercing", "slashing"]);

// Rayon du Voile des anciens, en mètres.
const ANCIENTS_VEIL_METERS = 3;

/** Indique si `actor` est à 3 m ou moins d'un personnage sous Voile des anciens. */
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

/**
 * Indique si `actor` a l'affinité `field` pour `damageType` (sous `system.combat` ou `system`).
 * @param {Actor} actor
 * @param {string} damageType
 * @param {"damageResistances"|"damageImmunities"|"damageVulnerabilities"} field
 */
function hasGenericDamageAffinity(actor, damageType, field) {
  const set = actor.system.combat?.[field] ?? actor.system[field];
  return set?.has?.(damageType) ?? false;
}

/** Indique si une armure ou une arme équipée de `actor` porte l'affinité `field` pour `damageType`. */
function hasEquipmentDamageAffinity(actor, damageType, field) {
  return actor.items.some(
    (item) => ["armor", "weapon"].includes(item.type) && item.system.equipped && item.system[field]?.has?.(damageType)
  );
}

/** Résistances accordées par des capacités ou états : Résilience draconique, Affinité de la tempête, Rage. */
function hasFeatureDamageResistance(actor, damageType) {
  // Résilience draconique : type de résistance choisi.
  if (actor.system.combat?.draconicResistanceType === damageType) return true;
  // Affinité de la tempête : résistance à la foudre et au tonnerre.
  if ((damageType === "lightning" || damageType === "thunder") && hasFeature(actor.items.contents, "Affinité de la tempête")) {
    return true;
  }
  // Rage : résistance aux dégâts physiques.
  return PHYSICAL_DAMAGE_TYPES.has(damageType) && Boolean(actor.statuses?.has("raging"));
}

/**
 * Multiplicateur de dégâts (0, 0.5, 1 ou 2) de `damageType` subis par `actor`.
 * L'immunité prime ; résistance et vulnérabilité s'annulent ; une source magique ignore les affinités physiques génériques.
 */
export function damageTypeMultiplier(actor, damageType, { isSpellDamage = false, isMagicalSource = false } = {}) {
  const veiled = isSpellDamage && isProtectedByAncientsVeil(actor);
  if (!damageType) return veiled ? 0.5 : 1;

  const genericBypassed = PHYSICAL_DAMAGE_TYPES.has(damageType) && isMagicalSource;
  const hasAffinity = (field) =>
    (!genericBypassed && hasGenericDamageAffinity(actor, damageType, field)) ||
    hasEquipmentDamageAffinity(actor, damageType, field);

  if (hasAffinity("damageImmunities")) return 0;
  const resistant = veiled || hasFeatureDamageResistance(actor, damageType) || hasAffinity("damageResistances");
  const vulnerable = hasAffinity("damageVulnerabilities");

  if (resistant && vulnerable) return 1;
  if (resistant) return 0.5;
  if (vulnerable) return 2;
  return 1;
}

// Capacités modifiant les dégâts d'un sort à sauvegarde (cf. spellSaveDamageMultiplier).
const EVASION_FEAT_NAME = "Évasion";
const POTENT_CANTRIP_FEAT_NAME = "Tour de magie renforcé";

/**
 * Fraction (0, 0.5 ou 1) des dégâts d'un sort à sauvegarde subie par `targetActor`.
 * Évasion : réussite 0, échec ½ ; Tour de magie renforcé : moitié sur réussite à un tour de magie.
 */
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

/** Sauvegarde de Constitution de concentration (DD 10 ou moitié des dégâts) ; échec = concentration perdue. */
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

/** Clé d'avertissement si `sourceActor` ne peut pas blesser `actor` (joueur contre joueur, auto-dégât hors MJ). */
function damageBlockedWarning(sourceActor, actor) {
  if (sourceActor?.type !== "character" || actor.type !== "character") return null;
  // Un personnage joueur ne peut pas blesser un autre personnage joueur.
  if (actor.id !== sourceActor.id) {
    return game.i18n.format("DND_CUSTOM.Chat.PvpBlocked", { attacker: sourceActor.name, target: actor.name });
  }
  // Seul le MJ peut appliquer des dégâts d'un joueur à lui-même.
  if (!game.user.isGM) return game.i18n.format("DND_CUSTOM.Chat.SelfDamageBlocked", { name: actor.name });
  return null;
}

/** Fraction de sauvegarde en attente sur `actor` pour ce sort (1 sinon) ; le résultat stocké est consommé. */
async function consumeSpellSaveMultiplier(actor, sourceActor, isSpellDamage, spellName) {
  const pendingSaveOutcome = isSpellDamage ? actor.getFlag(SYSTEM_ID, "pendingSpellSaveOutcome") : null;
  if (pendingSaveOutcome?.spellName !== spellName) return 1;
  // `setFlag(false)` car `unsetFlag` ne persiste pas sur un token non lié.
  await actor.setFlag(SYSTEM_ID, "pendingSpellSaveOutcome", false);
  return spellSaveDamageMultiplier(actor, sourceActor, pendingSaveOutcome);
}

/** Mises à jour de PV pour `amount` dégâts, les PV temporaires absorbant en premier. */
function hpDamageUpdates(hp, amount) {
  let remaining = amount;
  const updates = {};
  const temp = hp.temp ?? 0;
  if (temp > 0) {
    const absorbed = Math.min(temp, remaining);
    updates["system.attributes.hp.temp"] = temp - absorbed;
    remaining -= absorbed;
  }
  if (remaining > 0) updates["system.attributes.hp.value"] = Math.max(0, hp.value - remaining);
  return updates;
}

/** Applique à `actor` des dégâts déjà réduits par sa sauvegarde et ses affinités, puis teste sa concentration. */
async function applyDamageToActor(actor, sourceActor, amount, { damageType, isSpellDamage, spellName, isMagicalSource }) {
  const hp = actor?.system.attributes?.hp;
  if (!hp) return;

  const blockedWarning = damageBlockedWarning(sourceActor, actor);
  if (blockedWarning) {
    ui.notifications.warn(blockedWarning);
    return;
  }

  // Réduction de sauvegarde puis multiplicateur de type, chacun arrondi séparément.
  const saveMultiplier = await consumeSpellSaveMultiplier(actor, sourceActor, isSpellDamage, spellName);
  const typeMultiplier = damageTypeMultiplier(actor, damageType, { isSpellDamage, isMagicalSource });
  let targetAmount = saveMultiplier === 1 ? amount : Math.floor(amount * saveMultiplier);
  targetAmount = typeMultiplier === 1 ? targetAmount : Math.floor(targetAmount * typeMultiplier);

  // Autorise la baisse de PV par un joueur via ce flux.
  const updates = hpDamageUpdates(hp, targetAmount);
  if (Object.keys(updates).length) await requestActorUpdate(actor, updates, { dndCustomDamageApply: true });
  if (targetAmount > 0 && actor.type === "character" && actor.system.spells.concentratingOn) {
    await checkConcentration(actor, targetAmount);
  }
}

/** Applique `amount` dégâts de `damageType` aux cibles, PV temporaires absorbés en premier. */
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
  const damage = { damageType, isSpellDamage, spellName, isMagicalSource };
  for (const token of targets) {
    await applyDamageToActor(token.actor, sourceActor, amount, damage); // NOSONAR : séquentiel voulu
  }
}

/** Applique `amount` de soin aux cibles, sans absorber les PV temporaires. */
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
    await requestActorUpdate(actor, { "system.attributes.hp.value": Math.min(hp.value + amount, hp.max) }); // NOSONAR : séquentiel voulu
  }
}
