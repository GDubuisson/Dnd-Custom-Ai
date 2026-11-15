import { createGmRelay } from "./gm-relay.js";

const SYSTEM_ID = "dnd-custom-ai";
const SOCKET_EVENT = `system.${SYSTEM_ID}.wildShapeForm`;
const FLAG_KEY = "wildShapeFormActors";

/** Crée ou réutilise l'Actor de forme sauvage du Druide et le lie à sa fiche (exécuté côté MJ). */
async function performWildShapeTransformation({ characterUuid, templateName, combatWildShapeBonus } = {}) {
  const character = await fromUuid(characterUuid);
  if (!character) return;

  const pack = game.packs.get(`${SYSTEM_ID}.adversaires`);
  const npcDocuments = pack ? await pack.getDocuments() : [];
  const template = npcDocuments.find((candidate) => candidate.name === templateName);
  if (!template) return;

  const storedIds = character.getFlag(SYSTEM_ID, FLAG_KEY) ?? {};
  let formActor = storedIds[templateName] ? game.actors.get(storedIds[templateName]) : null;

  if (formActor) {
    await formActor.update({
      "system.attributes.hp.value": formActor.system.attributes.hp.max,
      "system.attributes.hp.temp": combatWildShapeBonus ?? 0
    });
  } else {
    const data = template.toObject();
    delete data._id;
    data.type = "wildShapeForm";
    data.name = game.i18n.format("DND_CUSTOM.WildShape.FormActorName", { form: template.name, owner: character.name });
    if (combatWildShapeBonus) data.system.attributes.hp.temp = combatWildShapeBonus;
    formActor = await Actor.create(data);
    await character.setFlag(SYSTEM_ID, FLAG_KEY, { ...storedIds, [templateName]: formActor.id });
  }

  await character.update({ "system.combat.wildShapeActorId": formActor.id });
}

const relay = createGmRelay(SOCKET_EVENT, performWildShapeTransformation);

/** Écoute socket du relais MJ de transformation en forme sauvage. */
export const registerWildShapeFormRequestListener = relay.register;

/** Déclenche la transformation, directement ou via le MJ actif. */
export async function requestWildShapeTransformation(character, templateName, combatWildShapeBonus) {
  const payload = { characterUuid: character.uuid, templateName, combatWildShapeBonus };
  await relay.request(payload, game.user.isGM);
}
