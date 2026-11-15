import { DND_CUSTOM } from "./config.js";
import { radioListDialogContent } from "./dialog-content.js";

const { DialogV2 } = foundry.applications.api;
const SYSTEM_ID = "dnd-custom-ai";

/** Résume les attaques d'un PNJ en une ligne, ex. « Morsure (2d4 perforant) ». */
function summarizeAttacks(attacks) {
  return (attacks ?? [])
    .map((attack) => {
      const typeLabel = game.i18n.localize(DND_CUSTOM.damageTypes[attack.damage?.type] ?? "");
      const details = [attack.damage?.dice, typeLabel].filter(Boolean).join(" ");
      return `${attack.name} (${details})`;
    })
    .join(", ");
}

/**
 * Propose au Druide les formes sauvages accessibles à son niveau.
 * @returns {Promise<string|undefined>} nom de la forme choisie
 */
export async function offerWildShapeFormDialog(actor) {
  const pack = game.packs.get(`${SYSTEM_ID}.adversaires`);
  const npcDocuments = pack ? await pack.getDocuments() : [];
  const level = actor.system.attributes.level;

  const available = DND_CUSTOM.wildShapeForms
    .filter((entry) => level >= entry.minLevel)
    .map((entry) => npcDocuments.find((candidate) => candidate.name === entry.name))
    .filter(Boolean);

  if (!available.length) {
    ui.notifications.warn(game.i18n.localize("DND_CUSTOM.Chat.WildShapeNoFormAvailable"));
    return undefined;
  }

  const options = available.map((npc) => ({
    value: npc.name,
    label: npc.name,
    meta: ` (${game.i18n.localize("DND_CUSTOM.Actor.HP")} ${npc.system.attributes.hp.max}, ${game.i18n.localize("DND_CUSTOM.Actor.AC")} ${npc.system.attributes.ac.value})`,
    description: summarizeAttacks(npc.system.attacks)
  }));

  return DialogV2.prompt({
    window: { title: game.i18n.localize("DND_CUSTOM.WildShape.DialogTitle") },
    content: radioListDialogContent(options, "wildShapeFormName"),
    ok: {
      label: game.i18n.localize("DND_CUSTOM.WildShape.Confirm"),
      callback: (event, button) => button.form.elements.wildShapeFormName?.value
    }
  });
}
