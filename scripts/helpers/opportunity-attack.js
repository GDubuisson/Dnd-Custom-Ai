import { hasFeature } from "./rules.js";

// Allonge de mêlée par défaut SRD 5e (1,50 m) : ce système ne suit pas de propriété "allonge"
// par arme (ex. Hallebarde 3 m) — simplification assumée, comme d'autres nuances SRD déjà
// documentées comme non modélisées ailleurs (cf. ANOMALIES_ACTIVES.md).
const MELEE_REACH_METERS = 1.5;

const OPPORTUNITY_ATTACK_FEATURE_NAME = "Attaque d'opportunité";

// Position juste avant déplacement de chaque token en cours de mouvement (id -> {x, y} du
// CENTRE), le temps de comparer `preUpdateToken`/`updateToken` — jamais persisté sur le
// TokenDocument lui-même (certaines versions de Foundry gèlent/reconstruisent ses instances
// entre les deux hooks, piège rencontré en développant : une propriété ajoutée dynamiquement à
// `preUpdateToken` n'était plus lisible dans `updateToken`).
const preMoveCenters = new Map();

/** Centre `{x, y}` d'un TokenDocument à partir de ses seules données (x/y/width/height +
 *  `canvas.grid.size`), jamais du placeable canvas (`tokenDoc.object`) — reste correct même si
 *  le placeable n'a pas encore fini de se (re)positionner au moment du hook. `x`/`y` explicites
 *  optionnels (retour de test : dans `Hooks.on("updateToken", ...)`, `tokenDoc.x`/`y` ne
 *  reflètent PAS encore la nouvelle position au moment où le hook se déclenche — seul le payload
 *  `changes` du hook la contient déjà ; sans ce paramètre, `preUpdateToken`/`updateToken`
 *  calculaient silencieusement le MÊME centre, jamais aucun déclenchement possible). */
function tokenCenter(tokenDoc, { x = tokenDoc.x, y = tokenDoc.y } = {}) {
  const gridSize = canvas.grid.size;
  return {
    x: x + (tokenDoc.width * gridSize) / 2,
    y: y + (tokenDoc.height * gridSize) / 2
  };
}

/** Distance réelle (mètres, unité de la scène) entre deux points `{x, y}` du canvas — utilise
 *  l'API de mesure de grille native de Foundry (`canvas.grid.measurePath`, v13+), qui gère
 *  correctement une grille carrée ou hexagonale sans qu'il soit nécessaire de reconstruire une
 *  grille tactique complète (cf. chantier "Combat automatisé avancé", cadrage du 2026-08-23 :
 *  positionnement via l'API Foundry existante, pas de pathfinding). */
function distanceBetweenPoints(pointA, pointB) {
  return canvas.grid.measurePath([pointA, pointB]).distance;
}

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
