import { DND_CUSTOM } from "./config.js";
import { ABILITY_KEYS } from "../data/character-data.js";

const { DialogV2 } = foundry.applications.api;

/**
 * Dialogue d'Amélioration de caractéristiques : +2 sur une ou +1 sur deux (max 20).
 * @returns {Promise<"applied"|"back"|null>} `back` = retour au choix Amélioration/Don
 */
export async function openAbilityScoreImprovementDialog(actor) {
  const abilityOptions = ABILITY_KEYS.map(
    (key) =>
      `<option value="${key}">${game.i18n.localize(DND_CUSTOM.abilities[key])} (${actor.system.abilities[key].value})</option>`
  ).join("");

  const content = `
    <div style="display:flex;flex-direction:column;gap:0.6rem;">
      <p>${game.i18n.localize("DND_CUSTOM.Wizard.AsiHelp")}</p>
      <label style="display:flex;flex-direction:column;gap:0.2rem;">
        ${game.i18n.localize("DND_CUSTOM.Wizard.AsiFirst")}
        <select name="ability1"><option value="">—</option>${abilityOptions}</select>
      </label>
      <label style="display:flex;flex-direction:column;gap:0.2rem;">
        ${game.i18n.localize("DND_CUSTOM.Wizard.AsiSecond")}
        <select name="ability2"><option value="">—</option>${abilityOptions}</select>
      </label>
    </div>
  `;

  return DialogV2.wait({
    window: { title: game.i18n.localize("DND_CUSTOM.Wizard.AsiTitle") },
    content,
    rejectClose: false,
    buttons: [
      {
        action: "back",
        label: game.i18n.localize("DND_CUSTOM.LevelUp.Back"),
        callback: () => "back"
      },
      {
        action: "ok",
        label: game.i18n.localize("DND_CUSTOM.Wizard.AsiApply"),
        default: true,
        callback: async (event, button) => {
          const form = button.form;
          const ability1 = form.elements.ability1.value;
          const ability2 = form.elements.ability2.value;

          if (!ability1 || (ability2 && ability1 === ability2)) {
            ui.notifications.error(game.i18n.localize("DND_CUSTOM.Wizard.AsiInvalid"));
            return null;
          }

          const updates = {};
          if (ability2) {
            updates[`system.abilities.${ability1}.value`] = Math.min(20, actor.system.abilities[ability1].value + 1);
            updates[`system.abilities.${ability2}.value`] = Math.min(20, actor.system.abilities[ability2].value + 1);
          } else {
            updates[`system.abilities.${ability1}.value`] = Math.min(20, actor.system.abilities[ability1].value + 2);
          }
          await actor.update(updates, { dndCustomWizard: true });
          return "applied";
        }
      }
    ]
  });
}
