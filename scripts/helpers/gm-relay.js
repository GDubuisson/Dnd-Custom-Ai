/**
 * Crée un relais socket qui délègue `perform` au MJ actif quand le client n'a pas la permission.
 * @returns {{register: Function, request: (payload: object, hasLocalPermission: boolean) => Promise}}
 */
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
