/** Construit un canal socket "relais vers le MJ actif" : un client sans la permission requise
 *  délègue l'exécution de `perform` au MJ actif (seul habilité), au lieu de l'exécuter en local.
 *  Centralise un pattern jusqu'ici dupliqué indépendamment dans actor-relay.js, companion.js et
 *  wild-shape-form.js (chacun son propre `SOCKET_EVENT`, sa propre écoute, sa propre notification
 *  "pas de MJ en ligne") : un futur changement de ce mécanisme (ex. gestion d'un MJ déconnecté) ne
 *  se fait désormais qu'ici.
 *
 *  `perform(payload)` fait le travail réel — appelé aussi bien en local (permission déjà là) que
 *  côté MJ relayé (son client exécute le même `perform` en recevant l'événement socket). Jamais
 *  exécuté directement côté Joueur sans la permission requise : c'est tout l'objet de ce relais.
 *
 *  `register()` (retourné) doit être appelé une seule fois, depuis `Hooks.once("ready", ...)`
 *  (dnd-custom-ai.js). `request(payload, hasLocalPermission)` (retourné) est le point d'entrée
 *  appelé depuis une fiche : exécute `perform` directement si `hasLocalPermission` est vrai,
 *  sinon relaie au MJ actif via socket (ou avertit qu'aucun MJ n'est en ligne). */
export function createGmRelay(socketEvent, perform) {
  function register() {
    game.socket.on(socketEvent, async (payload = {}) => {
      if (game.users.activeGM?.id !== game.user.id) return;
      await perform(payload);
    });
  }

  async function request(payload, hasLocalPermission) {
    if (hasLocalPermission) {
      await perform(payload);
      return;
    }
    if (!game.users.activeGM) {
      ui.notifications.warn(game.i18n.localize("DND_CUSTOM.Chat.NoGmOnline"));
      return;
    }
    game.socket.emit(socketEvent, payload);
  }

  return { register, request };
}
