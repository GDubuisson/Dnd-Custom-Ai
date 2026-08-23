import { hasFeature } from "./rules.js";
import { MELEE_REACH_METERS, tokenCenter, distanceBetweenPoints } from "./tactical-distance.js";

const SYSTEM_ID = "dnd-custom-ai";
const OPPORTUNITY_ATTACK_FEATURE_NAME = "Attaque d'opportunité";
// Flag transitoire posé sur un Actor PNJ hostile (jamais persisté au-delà du prochain jet
// d'attaque de CE PNJ) par la clause "Échappée de la horde" ci-dessous — cf. son commentaire.
// Exporté pour être consommé par #onRollAttack (npc-sheet.js).
export const PENDING_OPPORTUNITY_DISADVANTAGE_FLAG = "pendingOpportunityDisadvantage";

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
 *  Portée initialement réduite à "PNJ hostile s'éloigne d'un PJ" (pas l'inverse) : c'est le cas
 *  de loin le plus fréquent en jeu (un joueur a une fiche interactive avec bouton de réaction ;
 *  un PNJ n'en a pas), et le MJ reste de toute façon seul juge des attaques d'opportunité de ses
 *  propres créatures. Sens inverse ajouté ensuite (chantier "8 sous-classes déjà à ≥1
 *  mécanique", 2026-08-23) pour "Échappée de la horde" (Tactiques défensives, Rôdeur Hunter) :
 *  cf. commentaire dédié dans le hook `updateToken` ci-dessous. */
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
      return;
    }

    // "Échappée de la horde" (Tactiques défensives, Rôdeur Hunter — chantier "8 sous-classes
    // déjà à ≥1 mécanique", 2026-08-23, sur demande explicite de l'utilisateur) : sens INVERSE
    // du bloc ci-dessus — le Rôdeur (avec ce choix fait) qui s'éloigne d'un PNJ hostile à portée
    // pose un désavantage ÉPHÉMÈRE sur ce PNJ précis, consommé par son PROCHAIN jet d'attaque
    // (#onRollAttack, npc-sheet.js) — approximation assumée avec l'utilisateur : rien ne garantit
    // que ce prochain jet sera bien l'attaque d'opportunité elle-même (le MJ pourrait choisir de
    // ne pas la faire, ou faire autre chose avant), même esprit que les flags `pendingCritical`
    // déjà utilisés ailleurs dans ce système.
    const moverActor = tokenDoc.actor;
    if (moverActor?.type !== "character" || moverActor.system.combat?.huntersDefense !== "mobile") return;

    for (const combatant of combat.combatants) {
      const enemyActor = combatant.actor;
      if (!enemyActor || combatant.token?.disposition !== CONST.TOKEN_DISPOSITIONS.HOSTILE) continue;

      const enemyToken = combatant.token;
      const enemyCenter = tokenCenter(enemyToken);
      const distanceBefore = distanceBetweenPoints(enemyCenter, oldCenter);
      const distanceAfter = distanceBetweenPoints(enemyCenter, newCenter);
      if (distanceBefore <= MELEE_REACH_METERS && distanceAfter > MELEE_REACH_METERS) {
        await enemyActor.setFlag(SYSTEM_ID, PENDING_OPPORTUNITY_DISADVANTAGE_FLAG, true);
      }
    }
  });
}
