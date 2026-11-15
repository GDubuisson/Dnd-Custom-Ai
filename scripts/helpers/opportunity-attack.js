import { isReadyReactor } from "./reaction-reminders.js";
import { MELEE_REACH_METERS, tokenCenter, distanceBetweenPoints } from "./tactical-distance.js";

const SYSTEM_ID = "dnd-custom-ai";
const OPPORTUNITY_ATTACK_FEATURE_NAME = "Attaque d'opportunité";
// Flag éphémère d'un PNJ : désavantage sur son prochain jet d'attaque (Échappée de la horde).
export const PENDING_OPPORTUNITY_DISADVANTAGE_FLAG = "pendingOpportunityDisadvantage";

// Centre de chaque token avant déplacement, lu entre `preUpdateToken` et `updateToken`.
const preMoveCenters = new Map();

/** Vrai si le déplacement fait sortir le token de l'allonge de corps à corps autour de `center`. */
function leavesReach(center, oldCenter, newCenter) {
  return distanceBetweenPoints(center, oldCenter) <= MELEE_REACH_METERS
    && distanceBetweenPoints(center, newCenter) > MELEE_REACH_METERS;
}

/** Un PNJ hostile quitte l'allonge d'un PJ : rappel d'attaque d'opportunité dans le chat. */
async function remindOpportunityAttacks(combat, tokenDoc, oldCenter, newCenter) {
  for (const combatant of combat.combatants) {
    if (!isReadyReactor(combatant, OPPORTUNITY_ATTACK_FEATURE_NAME)) continue;
    if (!leavesReach(tokenCenter(combatant.token), oldCenter, newCenter)) continue;
    await ChatMessage.create({ // NOSONAR : séquentiel voulu
      content: game.i18n.format("DND_CUSTOM.Chat.OpportunityAttackAvailable", {
        reactor: combatant.actor.name,
        mover: tokenDoc.name
      })
    });
  }
}

/** Échappée de la horde : le Rôdeur qui s'éloigne impose un désavantage au prochain jet d'attaque du PNJ. */
async function applyEscapeTheHorde(combat, tokenDoc, oldCenter, newCenter) {
  const moverActor = tokenDoc.actor;
  if (moverActor?.type !== "character" || moverActor.system.combat?.huntersDefense !== "mobile") return;

  for (const combatant of combat.combatants) {
    const enemyActor = combatant.actor;
    if (!enemyActor || combatant.token?.disposition !== CONST.TOKEN_DISPOSITIONS.HOSTILE) continue;
    if (!leavesReach(tokenCenter(combatant.token), oldCenter, newCenter)) continue;
    await enemyActor.setFlag(SYSTEM_ID, PENDING_OPPORTUNITY_DISADVANTAGE_FLAG, true); // NOSONAR : séquentiel voulu
  }
}

/**
 * Rappels d'attaque d'opportunité en combat : un PNJ hostile quitte l'allonge d'un PJ
 * ayant sa réaction, ou un Rôdeur avec Échappée de la horde s'éloigne d'un PNJ.
 */
export function registerOpportunityAttackHooks() {
  Hooks.on("preUpdateToken", (tokenDoc, changes) => {
    if (changes.x === undefined && changes.y === undefined) return;
    preMoveCenters.set(tokenDoc.id, tokenCenter(tokenDoc));
  });

  Hooks.on("updateToken", async (tokenDoc, changes) => {
    const oldCenter = preMoveCenters.get(tokenDoc.id);
    preMoveCenters.delete(tokenDoc.id);
    if (game.users.activeGM?.id !== game.user.id) return;
    if (changes.x === undefined && changes.y === undefined) return;
    if (!oldCenter) return;

    const combat = game.combat;
    if (!combat?.combatants.some((c) => c.tokenId === tokenDoc.id)) return;

    const newCenter = tokenCenter(tokenDoc, { x: changes.x, y: changes.y });
    if (tokenDoc.disposition === CONST.TOKEN_DISPOSITIONS.HOSTILE) {
      await remindOpportunityAttacks(combat, tokenDoc, oldCenter, newCenter);
    } else {
      await applyEscapeTheHorde(combat, tokenDoc, oldCenter, newCenter);
    }
  });
}
