import { DND_CUSTOM } from "./config.js";
import { ensureGmAuthoredJournal } from "./journal.js";
import { loadSystemJson } from "./system-json.js";

const SYSTEM_ID = "dnd-custom-ai";

/** Échappe `text` pour une insertion dans du HTML. */
function escapeHtml(text) {
  return String(text).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

/** Section HTML listant les objets `items` avec leur histoire ; chaîne vide si aucun n'en a. */
function loreSection(titleKey, items, loreByName) {
  const blocks = items
    .filter((item) => loreByName.has(item.name))
    .map((item) => {
      const paragraphs = loreByName.get(item.name).split("\n\n").map((text) => `<p>${escapeHtml(text)}</p>`);
      return `<h3>${escapeHtml(item.name)}</h3>${paragraphs.join("")}`;
    });
  return blocks.length ? `<h2>${game.i18n.localize(titleKey)}</h2>${blocks.join("")}` : "";
}

/** Pages du journal : une par région ayant au moins un objet avec une histoire. */
async function buildPages() {
  const [regional, historical, lore] = await Promise.all([
    loadSystemJson("world-items/regional.json"),
    loadSystemJson("world-items/historical.json"),
    loadSystemJson("scripts/data/item-lore.json")
  ]);
  const loreByName = new Map(lore.map((entry) => [entry.name, entry.lore]));
  const inRegion = (items, region) => items.filter((item) => item.flags?.[SYSTEM_ID]?.region === region);

  return Object.entries(DND_CUSTOM.regions)
    .map(([region, labelKey]) => ({
      name: game.i18n.localize(labelKey),
      content:
        loreSection("DND_CUSTOM.Journal.ItemLoreRegional", inRegion(regional, region), loreByName) +
        loreSection("DND_CUSTOM.Journal.ItemLoreHistorical", inRegion(historical, region), loreByName)
    }))
    .filter((page) => page.content);
}

/** Crée le Journal « Chroniques des objets », réservé au MJ, s'il n'existe pas encore. */
export function ensureItemLoreJournal() {
  return ensureGmAuthoredJournal(game.i18n.localize("DND_CUSTOM.Journal.ItemLoreTitle"), buildPages, {
    ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE }
  });
}
