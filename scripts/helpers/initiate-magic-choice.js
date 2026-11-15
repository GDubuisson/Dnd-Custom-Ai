import { DND_CUSTOM } from "./config.js";
import { findClassContentCandidates } from "./class-content.js";

const { DialogV2 } = foundry.applications.api;

// Classes proposées par le don « Magie d'initié » (Paladin exclu).
const INITIATE_MAGIC_CLASSES = ["bard", "cleric", "druid", "sorcerer", "warlock", "wizard"];

async function promptClass() {
  const options = INITIATE_MAGIC_CLASSES.map(
    (key) => `<option value="${key}">${game.i18n.localize(DND_CUSTOM.classes[key])}</option>`
  ).join("");

  return DialogV2.wait({
    window: { title: game.i18n.localize("DND_CUSTOM.Abilities.InitiateMagicClassTitle") },
    content: `
      <p>${game.i18n.localize("DND_CUSTOM.Abilities.InitiateMagicClassPrompt")}</p>
      <select name="classKey">${options}</select>`,
    rejectClose: false,
    buttons: [
      {
        action: "ok",
        label: game.i18n.localize("DND_CUSTOM.Abilities.InitiateMagicNext"),
        default: true,
        callback: (event, button) => button.form.elements.classKey.value
      }
    ]
  });
}

async function promptSpells(cantrips, levelOneSpells) {
  const cantripOptions = (selected) =>
    cantrips.map((spell) => `<option value="${spell.name}" ${spell.name === selected ? "selected" : ""}>${spell.name}</option>`).join("");
  const levelOneOptions = levelOneSpells
    .map((spell) => `<option value="${spell.name}">${spell.name}</option>`)
    .join("");

  const content = `
    <div style="display:flex;flex-direction:column;gap:0.6rem;">
      <p>${game.i18n.localize("DND_CUSTOM.Abilities.InitiateMagicSpellsPrompt")}</p>
      <label style="display:flex;flex-direction:column;gap:0.2rem;">
        ${game.i18n.localize("DND_CUSTOM.Abilities.InitiateMagicCantrip1")}
        <select name="cantrip1">${cantripOptions(cantrips[0]?.name)}</select>
      </label>
      <label style="display:flex;flex-direction:column;gap:0.2rem;">
        ${game.i18n.localize("DND_CUSTOM.Abilities.InitiateMagicCantrip2")}
        <select name="cantrip2">${cantripOptions(cantrips[1]?.name)}</select>
      </label>
      <label style="display:flex;flex-direction:column;gap:0.2rem;">
        ${game.i18n.localize("DND_CUSTOM.Abilities.InitiateMagicLevelOne")}
        <select name="levelOneSpell">${levelOneOptions}</select>
      </label>
    </div>`;

  return DialogV2.wait({
    window: { title: game.i18n.localize("DND_CUSTOM.Abilities.InitiateMagicSpellsTitle") },
    content,
    rejectClose: false,
    buttons: [
      {
        action: "ok",
        label: game.i18n.localize("DND_CUSTOM.Abilities.InitiateMagicConfirm"),
        default: true,
        callback: (event, button) => {
          const cantrip1 = button.form.elements.cantrip1.value;
          const cantrip2 = button.form.elements.cantrip2.value;
          const levelOneSpell = button.form.elements.levelOneSpell.value;
          if (!cantrip1 || !cantrip2 || cantrip1 === cantrip2 || !levelOneSpell) {
            ui.notifications.error(game.i18n.localize("DND_CUSTOM.Abilities.InitiateMagicInvalid"));
            return null;
          }
          return { cantrip1, cantrip2, levelOneSpell };
        }
      }
    ]
  });
}

/**
 * Dialogue « Magie d'initié » : choix d'une classe, puis de 2 tours de magie et d'1 sort de niveau 1.
 * @returns {Promise<{classKey: string, cantripItems: Item[], levelOneSpellItem: Item}|null>}
 */
export async function chooseInitiateMagicSpells() {
  const classKey = await promptClass();
  if (!classKey) return null;

  const [cantrips, levelOneSpells] = await Promise.all([
    findClassContentCandidates("spell", "sorts", (system) => system.classes?.has?.(classKey) && system.level === 0),
    findClassContentCandidates("spell", "sorts", (system) => system.classes?.has?.(classKey) && system.level === 1)
  ]);

  if (cantrips.length < 2 || !levelOneSpells.length) {
    ui.notifications.warn(game.i18n.localize("DND_CUSTOM.Wizard.ClassContentMissing"));
    return null;
  }

  const picked = await promptSpells(cantrips, levelOneSpells);
  if (!picked) return null;

  return {
    classKey,
    cantripItems: [
      cantrips.find((spell) => spell.name === picked.cantrip1),
      cantrips.find((spell) => spell.name === picked.cantrip2)
    ],
    levelOneSpellItem: levelOneSpells.find((spell) => spell.name === picked.levelOneSpell)
  };
}
