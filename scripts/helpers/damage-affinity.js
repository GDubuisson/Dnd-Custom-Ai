import { DND_CUSTOM } from "./config.js";

/**
 * Construit les groupes de cases résistances / immunités / vulnérabilités aux dégâts.
 * @param {object} affinities - objet portant les trois SetField d'affinité
 */
export function damageAffinityGroups(affinities) {
  const options = (setField) =>
    Object.entries(DND_CUSTOM.damageTypes).map(([key, label]) => ({ key, label, checked: setField.has(key) }));
  return [
    { field: "damageResistances", titleKey: "DND_CUSTOM.Npc.DamageResistances", options: options(affinities.damageResistances) },
    { field: "damageImmunities", titleKey: "DND_CUSTOM.Npc.DamageImmunities", options: options(affinities.damageImmunities) },
    {
      field: "damageVulnerabilities",
      titleKey: "DND_CUSTOM.Npc.DamageVulnerabilities",
      options: options(affinities.damageVulnerabilities)
    }
  ];
}

/** Résumé texte des affinités actives, affiché aux non-MJ. */
export function damageAffinitySummary(groups) {
  return groups
    .map((group) => ({
      titleKey: group.titleKey,
      labelsText: group.options
        .filter((option) => option.checked)
        .map((option) => game.i18n.localize(option.label))
        .join(", ")
    }))
    .filter((group) => group.labelsText);
}
