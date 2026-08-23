import { hasFeature } from "./rules.js";
import { MELEE_REACH_METERS, tokenCenter, distanceBetweenPoints } from "./tactical-distance.js";

const GIANT_KILLER_FEAT_NAME = "Tueur de géants";
// Tailles SRD 5e "Grande ou plus" (cf. DND_CUSTOM.sizes, config.js — ordre tp/p/m/g/tg/gig).
const LARGE_OR_BIGGER_SIZES = new Set(["g", "tg", "gig"]);

/** Chantier "8 sous-classes déjà à ≥1 mécanique" (2026-08-23) : option "Tueur de géants" (Giant
 *  Killer) de Proie du chasseur (Hunter, Rôdeur, SRD 5e) — même schéma "rappel non-bloquant" que
 *  Sentinelle (helpers/sentinel.js), mais déclenché ici quand le Rôdeur LUI-MÊME (pas un allié)
 *  est touché OU manqué par un PNJ hostile de taille Grande ou plus à 1,50 m, avec sa réaction
 *  encore disponible. Se branche sur le bouton d'attaque du profil PNJ (`#onRollAttack`,
 *  npc-sheet.js), après le jet — touché ou manqué, peu importe, SRD 5e ("qui vient de vous
 *  toucher OU vous manquer"). Distance seule sert de proxy pour "attaque au corps à corps" (même
 *  simplification que Sentinelle/Attaque d'opportunité — ce système ne distingue pas mêlée/
 *  distance sur le profil d'attaque simplifié d'un PNJ). */
export async function checkGiantKillerReminder(attackerActor) {
  if (game.users.activeGM?.id !== game.user.id) return;

  const attackerToken = attackerActor.getActiveTokens()[0]?.document;
  if (!attackerToken || attackerToken.disposition !== CONST.TOKEN_DISPOSITIONS.HOSTILE) return;
  if (!LARGE_OR_BIGGER_SIZES.has(attackerActor.system.size)) return;

  const combat = game.combat;
  if (!combat) return;

  const targetedTokenIds = new Set([...game.user.targets].map((token) => token.id));
  if (!targetedTokenIds.size) return;

  const attackerCenter = tokenCenter(attackerToken);

  for (const combatant of combat.combatants) {
    const actor = combatant.actor;
    if (actor?.type !== "character") continue;
    if (!actor.system.combat.reactionAvailable) continue;
    if (!hasFeature(actor.items.contents, GIANT_KILLER_FEAT_NAME)) continue;
    // "qui vient de VOUS toucher ou manquer" (SRD 5e) : contrairement à Sentinelle, le rappel ne
    // concerne QUE le Rôdeur lui-même, jamais un allié.
    if (!targetedTokenIds.has(combatant.tokenId)) continue;

    const reactorToken = combatant.token;
    if (!reactorToken) continue;

    const distance = distanceBetweenPoints(tokenCenter(reactorToken), attackerCenter);
    if (distance <= MELEE_REACH_METERS) {
      await ChatMessage.create({
        content: game.i18n.format("DND_CUSTOM.Chat.GiantKillerAvailable", {
          reactor: actor.name,
          attacker: attackerActor.name
        })
      });
    }
  }
}
