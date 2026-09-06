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

/** Bascule l'état `statusId` (cf. CONFIG.statusEffects) sur l'Actor `uuid` via le natif Foundry
 *  `Actor#toggleStatusEffect` — même en local que relayé (le MJ actif l'exécute sur réception
 *  socket). Une ActiveEffect n'est pas un simple `Actor#update` : d'où un relais dédié, distinct
 *  de `performActorUpdate`. */
async function performStatusEffectToggle({ uuid, statusId, active } = {}) {
  const doc = await fromUuid(uuid);
  if (doc) await doc.toggleStatusEffect(statusId, { active });
}

const statusRelay = createGmRelay(`${SOCKET_EVENT}.statusEffect`, performStatusEffectToggle);

/** Écoute des canaux socket (cf. requestActorUpdate / requestToggleStatusEffect ci-dessous),
 *  cf. createGmRelay (gm-relay.js). Appelées une seule fois, depuis `Hooks.once("ready", ...)`
 *  (dnd-custom-ai.js). */
export const registerActorUpdateRelay = relay.register;
export const registerStatusEffectRelay = statusRelay.register;

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

/** Bascule un état sur `actor` : directement si le client a la permission, sinon relayé au MJ
 *  actif via socket (cf. `registerStatusEffectRelay` ci-dessus) — même besoin que
 *  `requestActorUpdate` mais pour `Actor#toggleStatusEffect` (ex. un sort à sauvegarde qui pose
 *  une condition sur un PNJ non possédé, cf. `#castSaveSpell` dans actor-sheet.js). */
export async function requestToggleStatusEffect(actor, statusId, active = true) {
  await statusRelay.request({ uuid: actor.uuid, statusId, active }, actor.isOwner);
}
