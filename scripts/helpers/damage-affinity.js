import { DND_CUSTOM } from "./config.js";

/** Les 3 groupes de cases « affinité aux dégâts » (résistances / immunités / vulnérabilités)
 *  d'une fiche — chacun `{ field, titleKey, options: [{ key, label, checked }] }` couvrant les
 *  13 types SRD (cf. `damageAffinitySchema`, `data/shared-schema.js` ;
 *  `damageTypeMultiplier`, `helpers/damage-resolution.js` pour la résolution). `affinities` porte
 *  les 3 `SetField` : `system.combat` pour un personnage, `system` pour un PNJ. */
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

/** Résumé texte (types actifs seulement) des groupes de `damageAffinityGroups`, affiché à la
 *  place du tableau complet pour un non-MJ (le tableau lui étant verrouillé, cf. tab-stats.hbs).
 *  Les groupes sans aucun type coché sont omis. */
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
