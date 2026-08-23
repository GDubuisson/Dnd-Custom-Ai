import { hasFeature } from "./rules.js";
import { MELEE_REACH_METERS, tokenCenter, distanceBetweenPoints } from "./tactical-distance.js";

const OPPORTUNITY_ATTACK_FEATURE_NAME = "Attaque d'opportunité";

// Position juste avant déplacement de chaque token en cours de mouvement (id -> {x, y} du
// CENTRE), le temps de comparer `preUpdateToken`/`updateToken` — jamais persisté sur le
// TokenDocument lui-même (certaines versions de Foundry gèlent/reconstruisent ses instances
// entre les deux hooks, piège rencontré en développant : une propriété ajoutée dynamiquement à
// `preUpdateToken` n'était plus lisible dans `updateToken`).
const preMoveCenters = new Map();

/** Premier maillon du chantier "Combat automatisé avancé" (cadrage du 2026-08-23 avec
 *  l'utilisateur : positionnement via l'API de distance Foundry, réaction en "rappel non-
 *  bloquant" plutôt qu'une vraie interruption synchrone du jet) : détecte automatiquement
 *  qu'un token PNJ HOSTILE quitte la portée de mêlée (1,50 m) d'un Combattant personnage joueur
 *  qui a encore sa réaction disponible, et poste un simple message de chat de rappel — jamais
 *  d'interruption du mouvement ni de jet automatique, le joueur reste libre de cliquer (ou non)
 *  le bouton d'attaque de son arme ensuite, comme pour toute réaction de ce système.
 *
 *  Ne réagit qu'à un déplacement RÉEL (x/y modifiés, pas une simple mise à jour du token) et
 *  seulement pendant un combat actif où le token qui bouge est lui-même Combattant — même garde
 *  que `isActorInCombat` (rolls.js) pour les critiques : pas de détection hors combat. Un seul
 *  client (le MJ actif) poste le rappel, pour ne jamais dupliquer le message à plusieurs MJ
 *  connectés (même garde que les hooks `updateCombat`/`deleteCombat` existants,
 *  dnd-custom-ai.js).
 *
 *  Portée volontairement réduite à "PNJ hostile s'éloigne d'un PJ" (pas l'inverse) : c'est le cas
 *  de loin le plus fréquent en jeu (un joueur a une fiche interactive avec bouton de réaction ;
 *  un PNJ n'en a pas), et le MJ reste de toute façon seul juge des attaques d'opportunité de ses
 *  propres créatures. */
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
    if (tokenDoc.disposition !== CONST.TOKEN_DISPOSITIONS.HOSTILE) return;

    const combat = game.combat;
    if (!combat?.combatants.some((c) => c.tokenId === tokenDoc.id)) return;

    const newCenter = tokenCenter(tokenDoc, { x: changes.x, y: changes.y });

    for (const combatant of combat.combatants) {
      const actor = combatant.actor;
      if (actor?.type !== "character") continue;
      if (!actor.system.combat.reactionAvailable) continue;
      if (!hasFeature(actor.items.contents, OPPORTUNITY_ATTACK_FEATURE_NAME)) continue;

      const reactorToken = combatant.token;
      if (!reactorToken) continue;
      const reactorCenter = tokenCenter(reactorToken);

      const distanceBefore = distanceBetweenPoints(reactorCenter, oldCenter);
      const distanceAfter = distanceBetweenPoints(reactorCenter, newCenter);
      if (distanceBefore <= MELEE_REACH_METERS && distanceAfter > MELEE_REACH_METERS) {
        await ChatMessage.create({
          content: game.i18n.format("DND_CUSTOM.Chat.OpportunityAttackAvailable", {
            reactor: actor.name,
            mover: tokenDoc.name
          })
        });
      }
    }
  });
}
