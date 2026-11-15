/**
 * Évalue une expression arithmétique simple (nombres et + - * /), sans exécuter de code.
 * @throws {Error} si l'expression est mal formée
 */
function evaluateArithmetic(expression) {
  const tokens = expression.match(/\d+(?:\.\d+)?|[+\-*/]/g) ?? [];
  let index = 0;
  const factor = () => {
    let sign = 1;
    while (tokens[index] === "+" || tokens[index] === "-") {
      if (tokens[index] === "-") sign = -sign;
      index += 1;
    }
    const value = Number(tokens[index]);
    index += 1;
    if (!Number.isFinite(value)) throw new Error(`expression invalide : ${expression}`);
    return sign * value;
  };
  const term = () => {
    let value = factor();
    while (tokens[index] === "*" || tokens[index] === "/") {
      const operator = tokens[index];
      index += 1;
      value = operator === "*" ? value * factor() : value / factor();
    }
    return value;
  };
  let value = term();
  while (tokens[index] === "+" || tokens[index] === "-") {
    const operator = tokens[index];
    index += 1;
    value = operator === "+" ? value + term() : value - term();
  }
  if (index !== tokens.length) throw new Error(`expression invalide : ${expression}`);
  return value;
}

/** Enregistre les helpers Handlebars du système. */
export function registerHandlebarsHelpers() {
  Handlebars.registerHelper("formatWeight", (kg) => {
    // Arrondi à 2 décimales contre l'imprécision flottante.
    const value = Math.round((Number(kg) || 0) * 100) / 100;
    if (value > 0 && value < 0.1) return `${Math.round(value * 1000)} g`;
    return `${value} kg`;
  });

  // Affiche en mètres une vitesse stockée en pieds.
  Handlebars.registerHelper("formatSpeed", (feet) => `${Math.round((Number(feet) || 0) * 0.3)} m`);

  // Formule de jet lisible : remplace `@attributes.level` et évalue ceil/floor/round/min/max.
  // Sans niveau numérique, affiche `levelLabel` à la place.
  Handlebars.registerHelper("displayRollFormula", (formula, level, levelLabel) => {
    const raw = String(formula ?? "");
    const numericLevel = Number(level);
    if (!Number.isFinite(numericLevel)) {
      return raw.replaceAll("@attributes.level", String(levelLabel ?? "").toLowerCase());
    }
    const substituted = raw.replaceAll("@attributes.level", String(numericLevel));
    return substituted.replace(/(ceil|floor|round|min|max)\(([^()]*)\)/g, (call, fn, args) => {
      if (!/^[\d+\-*/., ]*$/.test(args)) return call;
      try {
        return String(Math[fn](...args.split(",").map(evaluateArithmetic)));
      } catch {
        return call;
      }
    });
  });

  // Capacité ou Sort déclenché par une réaction.
  Handlebars.registerHelper("isReactionItem", (item) => item?.system?.activation === "reaction");

  // Réaction déjà consommée ce round.
  Handlebars.registerHelper(
    "reactionBlocked",
    (item, reactionAvailable) => item?.system?.activation === "reaction" && !reactionAvailable
  );

  // Technique à réserve partagée : désactivée si réserve épuisée ou réaction consommée.
  Handlebars.registerHelper("resourceTechniqueDisabled", (resourceState, item, reactionAvailable) => {
    if (!resourceState?.remaining) return true;
    return item?.system?.activation === "reaction" && !reactionAvailable;
  });

  // Capacité désactivée si l'état requis est absent ou la réaction consommée.
  Handlebars.registerHelper("featureDisabled", (item, reactionAvailable, activeStatuses) => {
    const required = item?.system?.requiresState;
    if (required && !activeStatuses?.has(required)) return true;
    return item?.system?.activation === "reaction" && !reactionAvailable;
  });

  // Libellé localisé d'un état à partir de son id.
  Handlebars.registerHelper("conditionLabel", (conditions, id) => conditions?.find((c) => c.id === id)?.label ?? id);

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

  // Aperçu texte tronqué d'une description HTML.
  Handlebars.registerHelper("htmlSnippet", (html, maxLength = 140) => {
    const text = String(html ?? "")
      .replace(/<[^<>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!text) return "";
    return text.length > maxLength ? `${text.slice(0, maxLength - 1).trimEnd()}…` : text;
  });

  // Définition du glossaire pour un slug, utilisée en `data-tooltip` ; chaîne vide si absente.
  Handlebars.registerHelper("glossaryTip", (key) => {
    const glossary = typeof game !== "undefined" ? game?.dndCustomAi?.glossary : null;
    return glossary?.get?.(key) ?? "";
  });
}
