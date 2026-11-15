import { hasFeature } from "./rules.js";

const { DialogV2 } = foundry.applications.api;

const METAMAGIC_RESERVOIR_NAME = "Sorcellerie innée";
const METAMAGIC_FEATURE_NAME = "Métamagie";

/**
 * Métamagie au lancer d'un sort à sauvegarde : Maj-clic = Sort Prudent, Ctrl-clic = Sort Élevé.
 * Coûte 1 point de sorcellerie.
 * @returns {Promise<{option: "careful"|"heightened", targetActorId: string}|null>}
 */
export async function chooseMetamagicOption(actor, targets, { careful, heightened }) {
  if (!careful && !heightened) return null;
  if (!hasFeature(actor.items.contents, METAMAGIC_FEATURE_NAME)) return null;

  const reservoir = actor.items.contents.find(
    (item) => item.type === "feature" && item.name === METAMAGIC_RESERVOIR_NAME
  );
  if (!reservoir || reservoir.system.uses.value <= 0) return null;

  const option = careful ? "careful" : "heightened";

  let targetActorId = targets[0]?.actor?.id;
  if (targets.length > 1) {
    const options = targets
      .map((token) => `<option value="${token.actor.id}">${token.actor.name}</option>`)
      .join("");
    targetActorId = await DialogV2.prompt({
      window: {
        title: game.i18n.localize(
          careful ? "DND_CUSTOM.Spells.MetamagicCarefulTitle" : "DND_CUSTOM.Spells.MetamagicHeightenedTitle"
        )
      },
      content: `<select name="targetActorId">${options}</select>`,
      ok: {
        label: game.i18n.localize("DND_CUSTOM.Spells.MetamagicConfirm"),
        callback: (event, button) => button.form.elements.targetActorId.value
      },
      rejectClose: false
    });
    if (!targetActorId) return null;
  }

  await reservoir.update({ "system.uses.value": reservoir.system.uses.value - 1 });
  return { option, targetActorId };
}
