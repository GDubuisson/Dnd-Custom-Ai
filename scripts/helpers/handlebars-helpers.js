/** Enregistre les helpers Handlebars du système. Poids toujours stockés en kg (cf.
 *  ClaudeFiles/CONCEPTION_FONCTIONNELLE.md > types d'Item) ; affichage en grammes en dessous de
 *  0,1 kg, purement cosmétique côté template. */
export function registerHandlebarsHelpers() {
  Handlebars.registerHelper("formatWeight", (kg) => {
    // Arrondi à 2 décimales avant affichage : la somme flottante (quantité x poids sur
    // plusieurs objets, cf. rules.js > carriedWeight) produit sinon des valeurs du type
    // 1.7000000000000002 (imprécision binaire standard de l'arithmétique flottante JS),
    // affichées telles quelles sans cet arrondi (retour de test).
    const value = Math.round((Number(kg) || 0) * 100) / 100;
    if (value > 0 && value < 0.1) return `${Math.round(value * 1000)} g`;
    return `${value} kg`;
  });

  // Vitesse stockée en "pieds" SRD 5e (cf. DND_CUSTOM.baseSpeed et rules.js > classSpeedBonus/
  // speedPenalty, valeurs 10/15/20/25/30 identiques au SRD) : convertie ici en mètres pour
  // l'affichage seulement (facteur 0,3, même convention déjà utilisée pour les portées d'armes/
  // sorts de ce système, ex. 30 m au lieu de 100 pieds) — le calcul lui-même reste en pieds,
  // inchangé, pour rester vérifiable contre le SRD.
  Handlebars.registerHelper("formatSpeed", (feet) => `${Math.round((Number(feet) || 0) * 0.3)} m`);

  // Retour de test : le bouton de jet d'une Capacité (ex. Second souffle, Bienfait du Fiélon)
  // affichait la formule Foundry brute ("1d10 + @attributes.level"), illisible pour un joueur —
  // affichage seulement, la formule réelle passée à `new Roll()` (actor-sheet.js) reste
  // inchangée. `@attributes.level` est la seule référence de roll-data utilisée dans
  // world-items/features.json à ce jour (cf. tests/data/consistency.test.js). `levelLabel` est
  // résolu côté template via `{{localize "DND_CUSTOM.Actor.Level"}}` (pas `game.i18n` ici
  // directement : ce fichier reste testable sans mock du global `game`, cf. tests/support/
  // handlebars-env.js qui ne fournit que le helper `localize`).
  Handlebars.registerHelper("displayRollFormula", (formula, levelLabel) =>
    String(formula ?? "").replace(/@attributes\.level/g, String(levelLabel ?? "").toLowerCase())
  );

  // Économie d'action de combat (cf. FeatureData/SpellData#activation, item-data.js) : une
  // Capacité/un Sort "Réaction" affiche un badge dédié sur l'onglet Capacités/Sorts et voit son
  // bouton d'utilisation grisé une fois la réaction consommée ce round-ci (cf. context.reactionAvailable).
  Handlebars.registerHelper("isReactionItem", (item) => item?.system?.activation === "reaction");

  // Vrai seulement pour une Capacité/un Sort "Réaction" dont la réaction est déjà consommée ce
  // round-ci (cf. context.reactionAvailable) : grise le bouton d'utilisation correspondant.
  Handlebars.registerHelper(
    "reactionBlocked",
    (item, reactionAvailable) => item?.system?.activation === "reaction" && !reactionAvailable
  );

  // Même logique que reactionBlocked ci-dessus, pour le bouton de technique à réserve partagée
  // (cf. featureResourceState, actor-sheet.js) : grisé aussi bien à réserve épuisée qu'à
  // réaction déjà consommée (la technique, pas la réserve elle-même, porte l'activation).
  Handlebars.registerHelper("resourceTechniqueDisabled", (resourceState, item, reactionAvailable) => {
    if (!resourceState?.remaining) return true;
    return item?.system?.activation === "reaction" && !reactionAvailable;
  });

  // Grise un bouton de Capacité si elle nécessite un état actif sur l'Actor qui ne l'est pas
  // (system.requiresState, cf. FeatureData, item-data.js — ex. Frénésie qui nécessite d'être
  // En Rage) et/ou si elle consomme une Réaction déjà utilisée ce round-ci (reprend la logique
  // de reactionBlocked ci-dessus pour les mêmes boutons de Capacité). `activeStatuses` : Set
  // natif (Actor#statuses, cf. context.activeStatuses, actor-sheet.js), pas une donnée
  // sérialisée — reste toujours à jour au fil des bascules d'état sans plomberie supplémentaire.
  Handlebars.registerHelper("featureDisabled", (item, reactionAvailable, activeStatuses) => {
    const required = item?.system?.requiresState;
    if (required && !activeStatuses?.has(required)) return true;
    return item?.system?.activation === "reaction" && !reactionAvailable;
  });

  // Libellé localisé d'un état (cf. DND_CUSTOM.conditions, config.js) à partir de son id — pour
  // le tooltip d'une Capacité grisée par requiresState (cf. featureDisabled ci-dessus).
  // `conditions` : context.conditions déjà construit pour l'onglet Statistiques (actor-sheet.js),
  // réutilisé tel quel plutôt que dupliqué (déjà les libellés localisés, pas juste les id).
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
