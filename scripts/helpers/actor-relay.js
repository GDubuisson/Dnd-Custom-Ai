import { createGmRelay } from "./gm-relay.js";

const SYSTEM_ID = "dnd-custom-ai";
const SOCKET_EVENT = `system.${SYSTEM_ID}`;

/** Applique `updates` (+ `options`, cf. `requestActorUpdate` ci-dessous) à l'Actor `uuid` — même
 *  en local (permission déjà là) que relayé (le MJ actif reçoit `uuid`/`updates`/`options` par
 *  socket et exécute cette même fonction). */
async function performActorUpdate({ uuid, updates, options } = {}) {
  const doc = await fromUuid(uuid);
  if (doc) await doc.update(updates, options ?? {});
}

const relay = createGmRelay(SOCKET_EVENT, performActorUpdate);

/** Écoute du canal socket (cf. requestActorUpdate ci-dessous), cf. createGmRelay (gm-relay.js).
 *  Appelée une seule fois, depuis `Hooks.once("ready", ...)` (dnd-custom-ai.js). */
export const registerActorUpdateRelay = relay.register;

/** Applique `updates` à `actor` : directement si le client a la permission, sinon relayée au MJ
 *  actif via socket (cf. `registerActorUpdateRelay` ci-dessus) — nécessaire pour un PNJ (ou une
 *  Forme sauvage/monture) dont un joueur n'est pas propriétaire, sans quoi `Actor#update` lève
 *  une erreur de permission ("User lacks permission...") côté joueur au lieu d'échouer
 *  silencieusement comme espéré. `options` (ex. `dndCustomDamageApply`, cf. `preUpdateActor`
 *  dans dnd-custom-ai.js) : sans effet une fois relayé au MJ actif, puisque c'est alors SON
 *  client qui appelle `doc.update()` — `preUpdateActor` y voit un `userId` de MJ et sort tôt
 *  (`if (game.users.get(userId)?.isGM) return;`), avant même de regarder `options`. */
export async function requestActorUpdate(actor, updates, options = {}) {
  await relay.request({ uuid: actor.uuid, updates, options }, actor.isOwner);
}
