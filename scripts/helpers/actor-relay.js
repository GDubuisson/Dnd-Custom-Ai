const SYSTEM_ID = "dnd-custom-ai";
const SOCKET_EVENT = `system.${SYSTEM_ID}`;

/** Extrait de dnd-custom-ai.js (chantier "Niveau A", 2026-08-24) dans son propre fichier pour
 *  éviter un import circulaire : `requestActorUpdate` doit être appelable depuis actor-sheet.js
 *  (#onEnterWildShape, PV temporaires posés sur la Forme) ET depuis dnd-custom-ai.js
 *  (applyDamageToTargets/applyHealToTargets, #onDropConcentration) — dnd-custom-ai.js importe
 *  déjà DndCustomActorSheet depuis actor-sheet.js, donc l'inverse aurait créé un cycle. */

/** Écoute du canal socket (cf. requestActorUpdate ci-dessous) : un joueur sans permission de
 *  modification sur l'Actor ciblé (PNJ non possédé, le cas courant) délègue sa mise à jour au MJ
 *  actif, seul habilité à l'appliquer — même motif `game.users.activeGM` que les hooks
 *  updateActor de dnd-custom-ai.js, pour qu'un seul des MJ éventuellement connectés traite
 *  chaque requête. Appelée une seule fois, depuis `Hooks.once("ready", ...)` (dnd-custom-ai.js). */
export function registerActorUpdateRelay() {
  game.socket.on(SOCKET_EVENT, async ({ uuid, updates } = {}) => {
    if (game.users.activeGM?.id !== game.user.id) return;
    const doc = await fromUuid(uuid);
    if (doc) await doc.update(updates);
  });
}

/** Applique `updates` à `actor` : directement si le client a la permission, sinon relayée au MJ
 *  actif via socket (cf. `registerActorUpdateRelay` ci-dessus) — nécessaire pour un PNJ (ou une
 *  Forme sauvage/monture) dont un joueur n'est pas propriétaire, sans quoi `Actor#update` lève
 *  une erreur de permission ("User lacks permission...") côté joueur au lieu d'échouer
 *  silencieusement comme espéré. `options` (ex. `dndCustomDamageApply`, cf. `preUpdateActor`
 *  dans dnd-custom-ai.js) n'a de sens que pour un update local direct : relayé au MJ actif,
 *  c'est SON client qui appelle `doc.update()`, déjà hors du filtre non-MJ de `preUpdateActor` —
 *  rien à transmettre au MJ dans ce cas. */
export async function requestActorUpdate(actor, updates, options = {}) {
  if (actor.isOwner) {
    await actor.update(updates, options);
    return;
  }
  if (!game.users.activeGM) {
    ui.notifications.warn(game.i18n.localize("DND_CUSTOM.Chat.NoGmOnline"));
    return;
  }
  game.socket.emit(SOCKET_EVENT, { uuid: actor.uuid, updates });
}
