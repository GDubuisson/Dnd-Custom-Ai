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

/** Boîte de dialogue de répartition d'une récupération d'emplacements de sorts (ex.
 *  Récupération arcanique/naturelle, cf. FeatureData#recoversSpellSlots, item-data.js) : le
 *  joueur reçoit `total` NIVEAUX à répartir librement entre les paliers de son choix (SRD 5e :
 *  jamais de palier 6 ou plus pour ces deux Capacités précises, plafond appliqué par l'appelant
 *  via `maxLevel`).
 *
 *  Renvoie un objet `{ [niveau]: montant }` (montants > 0 uniquement) si le joueur confirme une
 *  répartition valide, ou `null` si : aucun palier éligible n'a de charge manquante (rien à
 *  proposer, l'appelant ne consomme alors pas la charge de la Capacité), le joueur annule, ou la
 *  répartition saisie dépasse le total ou la capacité d'un palier (message d'erreur affiché,
 *  même convention que openAbilityScoreImprovementDialog qui ferme plutôt que de rester ouvert
 *  sur une saisie invalide).
 *
 * @param {string} featureName
 * @param {number} total
 * @param {object} slots `actor.system.spells.slots`
 * @param {number} [maxLevel=5]
 * @returns {Promise<Record<number, number>|null>}
 */
export async function chooseSpellSlotRecovery(featureName, total, slots, maxLevel = 5) {
  const eligible = SPELL_LEVELS.filter(
    (level) => level <= maxLevel && slots[level]?.max > 0 && slots[level].value < slots[level].max
  );
  if (!eligible.length) return null;

  const rows = eligible
    .map((level) => {
      const cap = Math.min(total, slots[level].max - slots[level].value);
      return `
        <div class="form-row">
          <label>${game.i18n.format("DND_CUSTOM.Spells.RecoveryLevelLabel", {
            level,
            remaining: slots[level].value,
            max: slots[level].max
          })}</label>
          <input type="number" name="level${level}" value="0" min="0" max="${cap}">
        </div>`;
    })
    .join("");

  return DialogV2.wait({
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
          const distribution = {};
          let spent = 0;
          for (const level of eligible) {
            const amount = Number(button.form.elements[`level${level}`]?.value) || 0;
            const cap = Math.min(total, slots[level].max - slots[level].value);
            if (amount < 0 || amount > cap) {
              ui.notifications.error(game.i18n.localize("DND_CUSTOM.Spells.RecoveryInvalid"));
              return null;
            }
            if (amount > 0) distribution[level] = amount;
            spent += amount;
          }
          if (spent > total) {
            ui.notifications.error(game.i18n.localize("DND_CUSTOM.Spells.RecoveryInvalid"));
            return null;
          }
          return spent > 0 ? distribution : null;
        }
      }
    ]
  });
}
