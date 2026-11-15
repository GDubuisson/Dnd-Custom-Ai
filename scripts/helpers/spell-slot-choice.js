import { SPELL_LEVELS } from "./rules.js";

const { DialogV2 } = foundry.applications.api;

/**
 * Choisit le palier d'emplacement à dépenser ; dialogue de surclassement si le palier exact est vide.
 * @param {string} spellName
 * @param {number} spellLevel - niveau de base du sort
 * @param {object} slots - `actor.system.spells.slots`
 * @returns {Promise<number|null>} `null` si aucun emplacement disponible ou annulation
 */
export async function chooseSpellSlotLevel(spellName, spellLevel, slots) {
  const available = SPELL_LEVELS.filter((level) => level >= spellLevel && slots[level]?.value > 0);
  if (!available.length) return null;
  if (available[0] === spellLevel) return spellLevel;

  const rows = available
    .map(
      (level, index) => `
        <label class="checkbox-row" style="align-items:flex-start;gap:0.5rem;">
          <input type="radio" name="slotLevel" value="${level}" ${index === 0 ? "checked" : ""}>
          <span>${game.i18n.format("DND_CUSTOM.Spells.UpcastLevelOption", {
            level,
            remaining: slots[level].value,
            max: slots[level].max
          })}</span>
        </label>`
    )
    .join("");

  const chosenLevel = await DialogV2.prompt({
    window: { title: game.i18n.localize("DND_CUSTOM.Spells.UpcastDialogTitle") },
    content: `
      <p>${game.i18n.format("DND_CUSTOM.Spells.UpcastDialogPrompt", { spell: spellName, level: spellLevel })}</p>
      <div style="display:flex;flex-direction:column;gap:0.6rem;">${rows}</div>`,
    ok: {
      label: game.i18n.localize("DND_CUSTOM.Spells.UpcastConfirm"),
      callback: (event, button) => Number(button.form.elements.slotLevel?.value) || null
    },
    rejectClose: false
  });

  return chosenLevel ?? null;
}

/**
 * Dialogue de répartition de `total` niveaux d'emplacements à récupérer, jusqu'à `maxLevel`.
 * @param {string} featureName - Capacité nommée dans le dialogue
 * @param {number} total - niveaux d'emplacements à répartir
 * @param {object} slots - `actor.system.spells.slots`
 * @param {number} [maxLevel] - palier maximal récupérable
 * @returns {Promise<Record<number, number>|null>}
 */
export async function chooseSpellSlotRecovery(featureName, total, slots, maxLevel = 5) {
  const eligible = SPELL_LEVELS.filter(
    (level) => level <= maxLevel && slots[level]?.max > 0 && slots[level].value < slots[level].max
  );
  if (!eligible.length) return null;

  const rows = eligible
    .map(
      (level) => `
        <div class="form-row">
          <label>${game.i18n.format("DND_CUSTOM.Spells.RecoveryLevelLabel", {
            level,
            remaining: slots[level].value,
            max: slots[level].max
          })}</label>
          <input type="number" name="level${level}" value="0" min="0" step="1">
        </div>`
    )
    .join("");

  // Montants bornés plutôt que rejetés ; le callback doit toujours renvoyer un objet
  // (un `null` ferait renvoyer l'action « ok » par `DialogV2.wait`).
  const distribution = await DialogV2.wait({
    window: { title: game.i18n.localize("DND_CUSTOM.Spells.RecoveryDialogTitle") },
    content: `
      <p>${game.i18n.format("DND_CUSTOM.Spells.RecoveryDialogPrompt", { feature: featureName, total })}</p>
      <div style="display:flex;flex-direction:column;gap:0.4rem;">${rows}</div>`,
    rejectClose: false,
    buttons: [
      {
        action: "ok",
        label: game.i18n.localize("DND_CUSTOM.Spells.RecoveryConfirm"),
        default: true,
        callback: (event, button) => {
          const result = {};
          let remaining = total;
          for (const level of eligible) {
            const cap = Math.min(remaining, slots[level].max - slots[level].value);
            const amount = Math.max(0, Math.min(cap, Math.trunc(Number(button.form.elements[`level${level}`]?.value) || 0)));
            if (amount > 0) {
              result[level] = amount;
              remaining -= amount;
            }
          }
          return result;
        }
      }
    ]
  });

  // Fermé ou rien réparti : `null`, aucune charge consommée.
  if (!distribution || typeof distribution !== "object" || !Object.keys(distribution).length) return null;
  return distribution;
}
