import { DND_CUSTOM } from "./config.js";
import { ensureGmAuthoredJournal } from "./journal.js";

/** Crée (une seule fois, si absent) un Journal récapitulant les différences entre les 6
 *  Origines, à partir de game.dndCustomAi.origins (cf. scripts/data/origins.json). **Visible de
 *  tous les joueurs** (`ownership.default: OBSERVER`) : outil de choix d'Origine à la création,
 *  destiné aux joueurs. N'écrase jamais un Journal existant du même nom, pour ne pas effacer les
 *  modifications du MJ ; un Journal créé « Aucun » avant ce correctif est remonté à OBSERVER, cf.
 *  ensureGmAuthoredJournal. */
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

  // Retour de test : la colonne "Traits culturels" (texte le plus long, ex. "Noblesse,
  // chevalerie, droiture, honneur") débordait sans troncature propre faute de propriété CSS
  // dédiée — cf. règle `.dnd-origins-traits-cell` (styles/dnd-custom-ai.css), globale (pas
  // scopée `.dnd-custom-ai`) car cette page de Journal Foundry n'est pas rendue à l'intérieur
  // de ce conteneur. Le texte complet reste consultable via l'infobulle `title` ci-dessus.
  return `<table class="dnd-origins-table"><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table>`;
}
