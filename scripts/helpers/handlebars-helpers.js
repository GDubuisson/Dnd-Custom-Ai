/** Enregistre les helpers Handlebars du système. Poids toujours stockés en kg (cf.
 *  ClaudeFiles/ITEMS.md > convention d'unités) ; affichage en grammes en dessous de 0,1 kg,
 *  purement cosmétique côté template. */
export function registerHandlebarsHelpers() {
  Handlebars.registerHelper("formatWeight", (kg) => {
    const value = Number(kg) || 0;
    if (value > 0 && value < 0.1) return `${Math.round(value * 1000)} g`;
    return `${value} kg`;
  });

  Handlebars.registerHelper("isUsableItem", (item) => {
    if (item?.type === "tool") return Boolean(item.system.useEffect?.skill);
    return Boolean(item?.system?.use) && item.system.use.type !== "none";
  });

  Handlebars.registerHelper("useItemIcon", (item) => {
    if (item?.type === "tool") return "fa-screwdriver-wrench";
    const use = item?.system?.use;
    if (use?.type === "light") return item.system.lit ? "fa-fire" : "fa-lightbulb";
    if (use?.type === "heal") return "fa-kit-medical";
    return "fa-bolt";
  });

  // Aperçu texte brut d'une description HTML (system.description), tronqué : utilisé sur
  // l'onglet Équipement pour un résumé court sous chaque objet équipé (retour de test — pas
  // de description visible côté fiche). Sortie passée par l'échappement Handlebars normal
  // ({{}}, pas {{{}}}) : le HTML retiré n'a pas besoin d'être ré-autorisé ici.
  Handlebars.registerHelper("htmlSnippet", (html, maxLength = 140) => {
    const text = String(html ?? "")
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!text) return "";
    return text.length > maxLength ? `${text.slice(0, maxLength - 1).trimEnd()}…` : text;
  });
}
