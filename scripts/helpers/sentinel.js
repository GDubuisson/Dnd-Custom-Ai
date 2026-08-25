import { hasFeature } from "./rules.js";
import { MELEE_REACH_METERS, tokenCenter, distanceBetweenPoints } from "./tactical-distance.js";

const SENTINEL_FEAT_NAME = "Sentinelle";

/** 2e maillon du chantier "Combat automatisé avancé" (cadrage du 2026-08-23) : clause 3 du don
 *  Sentinelle uniquement ("quand une créature à 1,50 m de vous attaque une cible autre que vous,
 *  vous pouvez utiliser votre réaction pour l'attaquer") — même esprit "rappel non-bloquant" que
 *  helpers/opportunity-attack.js. Les 2 autres clauses SRD (vitesse à 0 après une Attaque
 *  d'opportunité réussie ; provoque une Attaque d'opportunité même après Se désengager) restent
 *  texte : la 1re demanderait de savoir si CETTE attaque a précisément touché ET était une
 *  Attaque d'opportunité (rien ne le distingue aujourd'hui) ; la 2e est déjà vraie de fait, ce
 *  système ne suivant jamais l'action Se désengager (aucune AO n'est jamais bloquée pour cette
 *  raison, cf. helpers/opportunity-attack.js).
 *
 *  Portée volontairement réduite à "un PNJ hostile attaque" (jamais un PJ) : Sentinelle protège
 *  contre une menace ennemie, et ce système bloque déjà le PvP (cf. CONCEPTION_FONCTIONNELLE.md)
 *  — nul besoin de surveiller les attaques entre PJ. Se branche sur le bouton d'attaque du profil
 *  PNJ (`#onRollAttack`, npc-sheet.js), seul point où un PNJ déclare ses cibles
 *  (`game.user.targets`, même convention que `compareToTargetAc`, rolls.js).
 *
 *  Un seul client (le MJ actif) poste le rappel — même garde que les autres hooks de combat de ce
 *  système (updateCombat/deleteCombat, dnd-custom-ai.js ; updateToken, opportunity-attack.js). */
export async function checkSentinelReminder(attackerActor) {
  if (game.users.activeGM?.id !== game.user.id) return;

  const attackerToken = attackerActor.getActiveTokens()[0]?.document;
  if (!attackerToken || attackerToken.disposition !== CONST.TOKEN_DISPOSITIONS.HOSTILE) return;

  const combat = game.combat;
  if (!combat) return;

  const targetedTokenIds = new Set([...game.user.targets].map((token) => token.id));
  if (!targetedTokenIds.size) return;

  const attackerCenter = tokenCenter(attackerToken);

  for (const combatant of combat.combatants) {
    const actor = combatant.actor;
    if (actor?.type !== "character") continue;
    if (!actor.system.combat.reactionAvailable) continue;
    if (!hasFeature(actor.items.contents, SENTINEL_FEAT_NAME)) continue;
    // "une cible AUTRE que vous" (SRD 5e) : pas de rappel si c'est justement ce Combattant qui
    // est visé par l'attaque.
    if (targetedTokenIds.has(combatant.tokenId)) continue;

    const reactorToken = combatant.token;
    if (!reactorToken) continue;

    const distance = distanceBetweenPoints(tokenCenter(reactorToken), attackerCenter);
    if (distance <= MELEE_REACH_METERS) {
      await ChatMessage.create({
        content: game.i18n.format("DND_CUSTOM.Chat.SentinelAvailable", {
          reactor: actor.name,
          attacker: attackerActor.name
        })
      });
    }
  }
}
