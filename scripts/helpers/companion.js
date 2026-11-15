import { createGmRelay } from "./gm-relay.js";

const SYSTEM_ID = "dnd-custom-ai";
const SOCKET_EVENT = `system.${SYSTEM_ID}.companion`;

// Profil du compagnon animal du Maître des bêtes (Loup SRD).
const WOLF_PROFILE = {
  type: "npc",
  system: {
    creatureType: "beast",
    challengeRating: "1/4",
    size: "m",
    abilities: { str: { mod: 3 }, dex: { mod: 2 }, con: { mod: 1 }, int: { mod: -4 }, wis: { mod: 1 }, cha: { mod: -3 } },
    attributes: { hp: { value: 11, max: 11 }, ac: { value: 13 }, speed: 12 },
    attacks: [
      {
        name: "Morsure",
        ability: "str",
        bonus: 2,
        damage: { dice: "2d4", bonus: 2, type: "piercing" }
      }
    ],
    particularity: "Tactique de meute : avantage aux jets d'attaque si un allié du Loup est à moins de 1,50 m de la cible."
  }
};

/** Crée une seule fois le compagnon animal de `ownerActor` (PNJ autonome). */
async function createBeastCompanion(ownerActor) {
  const name = game.i18n.format("DND_CUSTOM.Companion.Name", { owner: ownerActor.name });
  await Actor.create({ name, ...WOLF_PROFILE });
  await ownerActor.setFlag(SYSTEM_ID, "beastCompanionCreated", true);
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: ownerActor }),
    content: game.i18n.format("DND_CUSTOM.Chat.CompanionSummoned", { owner: ownerActor.name, companion: name })
  });
}

async function performCompanionRequest({ actorUuid } = {}) {
  const ownerActor = await fromUuid(actorUuid);
  if (ownerActor) await createBeastCompanion(ownerActor);
}

const relay = createGmRelay(SOCKET_EVENT, performCompanionRequest);

/** Écoute socket du relais MJ de création du compagnon. */
export const ensureBeastCompanionRequestListener = relay.register;

/** Crée le compagnon, directement ou via le MJ actif. */
export async function requestBeastCompanion(ownerActor) {
  await relay.request({ actorUuid: ownerActor.uuid }, game.user.isGM);
}
