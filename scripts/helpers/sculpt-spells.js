import { hasFeature } from "./rules.js";

const { DialogV2 } = foundry.applications.api;

const SCULPT_SPELLS_FEATURE_NAME = "Sculpteur de sorts";

/**
 * Sculpteur de sorts : Maj-clic sur « Lancer » protège gratuitement un allié d'un sort à sauvegarde.
 * @returns {Promise<string|null>} id de l'Actor protégé
 */
export async function chooseSculptSpellsTarget(actor, targets, { careful }) {
  if (!careful) return null;
  if (!hasFeature(actor.items.contents, SCULPT_SPELLS_FEATURE_NAME)) return null;
  if (!targets.length) return null;

  if (targets.length === 1) return targets[0].actor?.id ?? null;

  const options = targets
    .map((token) => `<option value="${token.actor.id}">${token.actor.name}</option>`)
    .join("");
  return DialogV2.prompt({
    window: { title: game.i18n.localize("DND_CUSTOM.Spells.SculptSpellsTitle") },
    content: `<select name="targetActorId">${options}</select>`,
    ok: {
      label: game.i18n.localize("DND_CUSTOM.Spells.MetamagicConfirm"),
      callback: (event, button) => button.form.elements.targetActorId.value
    },
    rejectClose: false
  });
}
