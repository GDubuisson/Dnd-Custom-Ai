import { SPELL_LEVELS } from "./rules.js";

const { DialogV2 } = foundry.applications.api;

/** Détermine quel palier d'emplacement de sort dépenser pour lancer un sort de niveau
 *  `spellLevel`, avec surclassement possible (SRD 5e : un sort peut toujours être lancé avec un
 *  emplacement de niveau supérieur au sien, sans effet de jeu supplémentaire ici — les sorts
 *  n'ont pas de texte "aux niveaux supérieurs" modélisé dans ce système, cf. spell-slots.json).
 *
 *  - Le palier exact du sort a une charge disponible : le renvoie directement, **sans ouvrir de
 *    fenêtre** (cas courant, préserve le clic unique existant sur le bouton "Lancer").
 *  - Seuls des paliers supérieurs ont des charges : ouvre une petite fenêtre de choix (même
 *    famille que offerSubclassChoiceDialog, subclass-choice.js) pour que le joueur choisisse
 *    explicitement le palier à surclasser (ou annule) — dépenser un emplacement rare doit rester
 *    une décision visible, jamais automatique.
 *  - Aucun palier (exact ou supérieur) n'a de charge : renvoie `null`, à charge de l'appelant
 *    d'afficher l'avertissement "aucun emplacement disponible" (cf. DndCustomActorSheet#onCastSpell).
 *
 * `slots` : `actor.system.spells.slots`, forme `{ "1": {value, max}, ..., "9": {value, max} }`.
 * @param {string} spellName
 * @param {number} spellLevel
 * @param {object} slots
 * @returns {Promise<number|null>}
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
