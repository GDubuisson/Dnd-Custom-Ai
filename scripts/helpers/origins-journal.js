import { DND_CUSTOM } from "./config.js";
import { ensureGmAuthoredJournal } from "./journal.js";

/** Crée le Journal comparatif des Origines, visible de tous, s'il n'existe pas encore. */
export function ensureOriginsJournal() {
  const title = game.i18n.localize("DND_CUSTOM.Journal.OriginsComparisonTitle");
  return ensureGmAuthoredJournal(
    title,
    () => {
      const origins = game.dndCustomAi?.origins ?? {};
      if (!Object.keys(origins).length) return [];
      return [{ name: title, content: buildOriginsTable(origins) }];
    },
    { ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER } }
  );
}

function buildOriginsTable(origins) {
  const headers = [
    "DND_CUSTOM.Journal.OriginColumn",
    "DND_CUSTOM.Journal.TraitsColumn",
    "DND_CUSTOM.Journal.AbilityBonusesColumn",
    "DND_CUSTOM.Journal.SkillAdvantagesColumn",
    "DND_CUSTOM.Journal.SpecialTraitColumn"
  ]
    .map((key) => `<th>${game.i18n.localize(key)}</th>`)
    .join("");

  const rows = Object.values(origins)
    .map((origin) => {
      const bonuses = Object.entries(origin.abilityBonuses)
        .map(([key, value]) => `${game.i18n.localize(DND_CUSTOM.abilities[key])} +${value}`)
        .join(", ");
      const skills = origin.skillAdvantages
        .map((key) => game.i18n.localize(DND_CUSTOM.skills[key]))
        .join(", ");
      return `<tr>
        <td>${origin.label}</td>
        <td class="dnd-origins-traits-cell" title="${origin.traits}">${origin.traits}</td>
        <td>${bonuses}</td>
        <td>${skills}</td>
        <td><strong>${origin.specialTrait.name}</strong><br>${origin.specialTrait.description}</td>
      </tr>`;
    })
    .join("");

  // Texte complet de la colonne « Traits culturels » accessible via l'infobulle `title`.
  return `<table class="dnd-origins-table"><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table>`;
}
