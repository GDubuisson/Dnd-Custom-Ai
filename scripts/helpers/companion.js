const SYSTEM_ID = "dnd-custom-ai";
const SOCKET_EVENT = `system.${SYSTEM_ID}.companion`;

/** Profil de compagnon simplifié (Maître des bêtes, Rôdeur — cf. world-items/features.json >
 *  "Compagnon animal") : un Loup SRD 5e, réduit aux champs de NpcData (scripts/data/npc-data.js).
 *  Un seul profil pour l'instant, pas de choix proposé au joueur (contrairement à l'esprit
 *  totem du Barbare) — cohérent avec la simplification déjà assumée ailleurs (équipement de
 *  départ unique par classe, etc.). */
const WOLF_PROFILE = {
  type: "npc",
  system: {
    creatureType: "beast",
    challengeRating: "1/4",
    size: "m",
    abilities: { str: { mod: 3 }, dex: { mod: 2 }, con: { mod: 1 }, int: { mod: -4 }, wis: { mod: 1 }, cha: { mod: -3 } },
    attributes: { hp: { value: 11, max: 11 }, ac: { value: 13 }, speed: 12 },
    attack: {
      name: "Morsure",
      ability: "str",
      bonus: 2,
      damage: { dice: "2d4", bonus: 2, type: "piercing" }
    },
    particularity: "Tactique de meute : avantage aux jets d'attaque si un allié du Loup est à moins de 1,50 m de la cible."
  }
};

/** Crée le compagnon animal de `ownerActor` (Actor `npc` autonome, profil ci-dessus) — le MJ le
 *  place ensuite sur la scène comme n'importe quel PNJ, aucune IA/automatisation de combat
 *  (hors scope, cf. CONCEPTION_FONCTIONNELLE.md). Pose un flag sur `ownerActor` pour ne jamais
 *  recréer de second compagnon par la suite, même si celui-ci est supprimé par le MJ ensuite. */
async function createBeastCompanion(ownerActor) {
  const name = game.i18n.format("DND_CUSTOM.Companion.Name", { owner: ownerActor.name });
  await Actor.create({ name, ...WOLF_PROFILE });
  await ownerActor.setFlag(SYSTEM_ID, "beastCompanionCreated", true);
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: ownerActor }),
    content: game.i18n.format("DND_CUSTOM.Chat.CompanionSummoned", { owner: ownerActor.name, companion: name })
  });
}

/** Écoute du canal socket : un Joueur n'a pas la permission de créer un Actor (cf. Token, même
 *  restriction) — délègue au MJ actif, même mécanique que requestActorUpdate
 *  (dnd-custom-ai.js). */
export function ensureBeastCompanionRequestListener() {
  game.socket.on(SOCKET_EVENT, async ({ actorUuid } = {}) => {
    if (game.users.activeGM?.id !== game.user.id) return;
    const ownerActor = await fromUuid(actorUuid);
    if (ownerActor) await createBeastCompanion(ownerActor);
  });
}

/** Point d'entrée appelé par #onSummonCompanion (actor-sheet.js) : crée directement si le
 *  client a la permission (MJ), sinon relaie au MJ actif via socket. */
export async function requestBeastCompanion(ownerActor) {
  if (game.user.isGM) {
    await createBeastCompanion(ownerActor);
    return;
  }
  if (!game.users.activeGM) {
    ui.notifications.warn(game.i18n.localize("DND_CUSTOM.Chat.NoGmOnline"));
    return;
  }
  game.socket.emit(SOCKET_EVENT, { actorUuid: ownerActor.uuid });
}
