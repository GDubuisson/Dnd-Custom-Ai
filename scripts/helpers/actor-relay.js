import { createGmRelay } from "./gm-relay.js";

const SYSTEM_ID = "dnd-custom-ai";
const SOCKET_EVENT = `system.${SYSTEM_ID}`;

/** Applique `updates` à l'Actor `uuid` (en local ou côté MJ). */
async function performActorUpdate({ uuid, updates, options } = {}) {
  const doc = await fromUuid(uuid);
  if (doc) await doc.update(updates, options ?? {});
}

const relay = createGmRelay(SOCKET_EVENT, performActorUpdate);

/** Bascule l'état `statusId` sur l'Actor `uuid` (en local ou côté MJ). */
async function performStatusEffectToggle({ uuid, statusId, active } = {}) {
  const doc = await fromUuid(uuid);
  if (doc) await doc.toggleStatusEffect(statusId, { active });
}

const statusRelay = createGmRelay(`${SOCKET_EVENT}.statusEffect`, performStatusEffectToggle);

/** Écoutes socket des relais MJ de mise à jour d'Actor et d'état. */
export const registerActorUpdateRelay = relay.register;
export const registerStatusEffectRelay = statusRelay.register;

/** Met à jour `actor`, directement ou via le MJ actif si le joueur n'en est pas propriétaire. */
export async function requestActorUpdate(actor, updates, options = {}) {
  await relay.request({ uuid: actor.uuid, updates, options }, actor.isOwner);
}

/** Bascule un état sur `actor`, directement ou via le MJ actif. */
export async function requestToggleStatusEffect(actor, statusId, active = true) {
  await statusRelay.request({ uuid: actor.uuid, statusId, active }, actor.isOwner);
}
