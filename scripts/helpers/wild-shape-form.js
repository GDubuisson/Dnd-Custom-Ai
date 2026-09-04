const SYSTEM_ID = "dnd-custom-ai";
const SOCKET_EVENT = `system.${SYSTEM_ID}.wildShapeForm`;
const FLAG_KEY = "wildShapeFormActors";

/** Crée (ou réutilise) l'Actor `wildShapeForm` de `character` pour la forme `templateName` (cf.
 *  DND_CUSTOM.wildShapeForms, config.js), le lie via system.combat.wildShapeActorId, et pose les
 *  PV temporaires de "Forme sauvage de combat" (Cercle de la Lune) le cas échéant —
 *  `combatWildShapeBonus` déjà calculé côté appelant (2× niveau du Druide). Un Actor par forme
 *  DÉJÀ PRISE est conservé (flag `wildShapeFormActors`, { [nomForme]: actorId }) et réutilisé
 *  aux prises suivantes (PV remis au maximum) plutôt que recréé à chaque transformation — même
 *  esprit que le flag `beastCompanionCreated` de companion.js. N'exécute que sur un client
 *  habilité à créer un Actor et à écrire sur celui de `character` (cf. requestWildShapeTransformation
 *  ci-dessous pour le relais MJ) : jamais appelée directement côté Joueur. */
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

/** Écoute du canal socket (cf. requestWildShapeTransformation ci-dessous) : un Joueur n'a pas la
 *  permission de créer un Actor — délègue au MJ actif, même mécanique que
 *  ensureBeastCompanionRequestListener (companion.js) / registerActorUpdateRelay (actor-relay.js).
 *  Appelée une seule fois, depuis Hooks.once("ready", ...) (dnd-custom-ai.js). */
export function registerWildShapeFormRequestListener() {
  game.socket.on(SOCKET_EVENT, async (payload = {}) => {
    if (game.users.activeGM?.id !== game.user.id) return;
    await performWildShapeTransformation(payload);
  });
}

/** Point d'entrée appelé par #onEnterWildShape (actor-sheet.js) : exécute directement si le
 *  client a la permission (MJ), sinon relaie au MJ actif via socket — celui-ci pose ensuite
 *  system.combat.wildShapeActorId sur `character`, ce qui déclenche le nouveau rendu de sa fiche
 *  (hook updateActor standard de Foundry), sans canal de retour nécessaire ici. */
export async function requestWildShapeTransformation(character, templateName, combatWildShapeBonus) {
  const payload = { characterUuid: character.uuid, templateName, combatWildShapeBonus };
  if (game.user.isGM) {
    await performWildShapeTransformation(payload);
    return;
  }
  if (!game.users.activeGM) {
    ui.notifications.warn(game.i18n.localize("DND_CUSTOM.Chat.NoGmOnline"));
    return;
  }
  game.socket.emit(SOCKET_EVENT, payload);
}
