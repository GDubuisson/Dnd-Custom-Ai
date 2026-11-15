import { openAbilityScoreImprovementDialog } from "./ability-score-improvement.js";
import { radioListDialogContent } from "./dialog-content.js";

const { DialogV2 } = foundry.applications.api;
const SYSTEM_ID = "dnd-custom-ai";

/**
 * Propose une Amélioration de caractéristiques ou un Don, avec retour arrière possible.
 * @returns {Promise<boolean>} `true` si un choix a été appliqué
 */
export async function offerAbilityScoreOrFeatDialog(actor) {
  const choiceDialogs = { asi: openAbilityScoreImprovementDialog, feat: openFeatChoiceDialog };
  let result;
  do {
    const choice = await DialogV2.wait({ // NOSONAR : séquentiel voulu
      window: { title: game.i18n.localize("DND_CUSTOM.LevelUp.ChoiceTitle") },
      content: `<p>${game.i18n.localize("DND_CUSTOM.LevelUp.ChoiceHelp")}</p>`,
      buttons: [
        { action: "asi", label: game.i18n.localize("DND_CUSTOM.LevelUp.AbilityScoreOption"), default: true },
        { action: "feat", label: game.i18n.localize("DND_CUSTOM.LevelUp.FeatOption") }
      ],
      rejectClose: false
    });
    const openChoiceDialog = choiceDialogs[choice];
    if (!openChoiceDialog) return false;
    // « Retour » rouvre le choix entre Amélioration et Don.
    result = await openChoiceDialog(actor); // NOSONAR : séquentiel voulu
  } while (result === "back");
  return result === "applied";
}

/**
 * Dialogue de choix d'un Don non encore possédé, description complète affichée.
 * @returns {Promise<"applied"|"back"|null>}
 */
async function openFeatChoiceDialog(actor) {
  const pack = game.packs.get(`${SYSTEM_ID}.dons`);
  const feats = pack ? await pack.getDocuments() : [];
  const ownedNames = new Set(actor.items.contents.map((item) => item.name));
  const available = feats.filter((feat) => !ownedNames.has(feat.name));

  if (!available.length) {
    ui.notifications.warn(
      game.i18n.localize(feats.length ? "DND_CUSTOM.LevelUp.AllFeatsOwned" : "DND_CUSTOM.Wizard.ClassContentMissing")
    );
    return null;
  }

  const options = available.map((feat) => ({ value: feat.id, label: feat.name, description: feat.system.description }));

  return DialogV2.wait({
    window: { title: game.i18n.localize("DND_CUSTOM.LevelUp.FeatDialogTitle") },
    content: radioListDialogContent(options, "featId"),
    rejectClose: false,
    buttons: [
      {
        action: "back",
        label: game.i18n.localize("DND_CUSTOM.LevelUp.Back"),
        callback: () => "back"
      },
      {
        action: "ok",
        label: game.i18n.localize("DND_CUSTOM.LevelUp.FeatConfirm"),
        default: true,
        callback: async (event, button) => {
          const featId = button.form.elements.featId?.value;
          const chosen = available.find((feat) => feat.id === featId);
          if (!chosen) return null;

          await actor.createEmbeddedDocuments("Item", [chosen.toObject()]);
          await ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ actor }),
            content: game.i18n.format("DND_CUSTOM.Chat.FeatGranted", { name: actor.name, feat: chosen.name })
          });
          return "applied";
        }
      }
    ]
  });
}
