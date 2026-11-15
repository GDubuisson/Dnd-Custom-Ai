import { DND_CUSTOM } from "./config.js";
import { radioListDialogContent } from "./dialog-content.js";

const { DialogV2 } = foundry.applications.api;
const SYSTEM_ID = "dnd-custom-ai";

/** Propose le choix de sous-classe lorsque le personnage atteint le niveau requis. */
export async function offerSubclassChoiceDialog(actor, classKey, level) {
  if (actor.system.subclass) return;
  const subclassChoices = DND_CUSTOM.subclasses[classKey];
  const requiredLevel = DND_CUSTOM.subclassLevel[classKey];
  if (!subclassChoices || requiredLevel === undefined || level < requiredLevel) return;

  const pack = game.packs.get(`${SYSTEM_ID}.sous-classes`);
  const subclassItems = pack ? await pack.getDocuments() : [];

  const options = Object.entries(subclassChoices).map(([key, labelKey]) => {
    const label = game.i18n.localize(labelKey);
    return {
      value: key,
      label,
      description: subclassItems.find((candidate) => candidate.name === label)?.system.description ?? ""
    };
  });

  const chosenKey = await DialogV2.prompt({
    window: { title: game.i18n.localize("DND_CUSTOM.LevelUp.SubclassDialogTitle") },
    content: radioListDialogContent(options, "subclassKey"),
    ok: {
      label: game.i18n.localize("DND_CUSTOM.LevelUp.SubclassConfirm"),
      callback: (event, button) => button.form.elements.subclassKey?.value
    }
  });

  if (chosenKey) await actor.update({ "system.subclass": chosenKey });
}
