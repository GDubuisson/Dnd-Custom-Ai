import { syncGmAuthoredJournal } from "./journal.js";
import { loadSystemJson } from "./system-json.js";

/** Échappe `text` pour une insertion dans du HTML. */
function escapeHtml(text) {
  return String(text).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function paragraphsHtml(paragraphs = []) {
  return paragraphs.map((text) => `<p>${escapeHtml(text)}</p>`).join("");
}

function itemsHtml(items = []) {
  if (!items.length) return "";
  const rows = items.map(({ label, text }) => `<li><strong>${escapeHtml(label)}.</strong> ${escapeHtml(text)}</li>`);
  return `<ul>${rows.join("")}</ul>`;
}

function tableHtml(table) {
  if (!table) return "";
  const head = table.head.map((cell) => `<th>${escapeHtml(cell)}</th>`).join("");
  const rows = table.rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`);
  return `<table><thead><tr>${head}</tr></thead><tbody>${rows.join("")}</tbody></table>`;
}

/** Contenu HTML de la page d'un site de pierre (`scripts/data/stone-sites.json`). */
export function stoneSitePageContent(site) {
  return site.sections
    .map(
      (section) =>
        `<h2>${escapeHtml(section.title)}</h2>${paragraphsHtml(section.paragraphs)}${itemsHtml(section.items)}${tableHtml(section.table)}`
    )
    .join("");
}

async function buildPages() {
  const sites = await loadSystemJson("scripts/data/stone-sites.json");
  return sites.map((site) => ({ name: site.name, content: stoneSitePageContent(site) }));
}

/**
 * Journal « Sites de pierre », réservé au MJ : une page par site, resynchronisée à chaque chargement
 * (pages ajoutées au fil des sites, pages du système mises à jour ; les pages du MJ ne sont jamais touchées).
 */
export function syncStoneSitesJournal() {
  return syncGmAuthoredJournal(game.i18n.localize("DND_CUSTOM.Journal.StoneSitesTitle"), buildPages, {
    ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE }
  });
}
