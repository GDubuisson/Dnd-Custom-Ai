import { DND_CUSTOM } from "./config.js";
import { radioListDialogContent } from "./dialog-content.js";

const { DialogV2 } = foundry.applications.api;
const SYSTEM_ID = "dnd-custom-ai";

/** Résume les attaques d'un PNJ du compendium (NpcData#attacks) en une ligne lisible pour le
 *  dialogue de choix ci-dessous, ex. "Morsure (2d4 perforant), Griffe (2d6 tranchant)". */
function summarizeAttacks(attacks) {
  return (attacks ?? [])
    .map((attack) => {
      const typeLabel = game.i18n.localize(DND_CUSTOM.damageTypes[attack.damage?.type] ?? "");
      return `${attack.name} (${attack.damage?.dice}${typeLabel ? ` ${typeLabel}` : ""})`;
    })
    .join(", ");
}

/** Propose au Druide, au clic sur "Prendre forme" (cf. #onEnterWildShape, actor-sheet.js), un
 *  choix parmi les formes de DND_CUSTOM.wildShapeForms (config.js) dont le niveau minimum est
 *  atteint — même pattern que offerSubclassChoiceDialog (subclass-choice.js) : DialogV2.prompt
 *  avec une ligne à cocher par option, tirée du compendium "adversaires" (PNJ prêts à l'emploi,
 *  world-items/npcs.json). Retourne le nom de la forme choisie, ou undefined si aucune forme
 *  n'est disponible au niveau du personnage ou si le dialogue est fermé sans choix. */
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
