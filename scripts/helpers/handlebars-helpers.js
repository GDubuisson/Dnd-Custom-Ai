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
}
