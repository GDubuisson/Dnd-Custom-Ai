import { DND_CUSTOM } from "./config.js";

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

  const rows = available
    .map((npc, index) => {
      const hp = npc.system.attributes.hp.max;
      const ac = npc.system.attributes.ac.value;
      const attacks = summarizeAttacks(npc.system.attacks);
      return `
        <label class="checkbox-row" style="align-items:flex-start;gap:0.5rem;">
          <input type="radio" name="wildShapeFormName" value="${npc.name}" ${index === 0 ? "checked" : ""}>
          <span><strong>${npc.name}</strong> (${game.i18n.localize("DND_CUSTOM.Actor.HP")} ${hp},
            ${game.i18n.localize("DND_CUSTOM.Actor.AC")} ${ac})<br>${attacks}</span>
        </label>`;
    })
    .join("");

  return DialogV2.prompt({
    window: { title: game.i18n.localize("DND_CUSTOM.WildShape.DialogTitle") },
    content: `<div style="display:flex;flex-direction:column;gap:0.6rem;max-height:60vh;overflow-y:auto;">${rows}</div>`,
    ok: {
      label: game.i18n.localize("DND_CUSTOM.WildShape.Confirm"),
      callback: (event, button) => button.form.elements.wildShapeFormName?.value
    }
  });
}
