import { DND_CUSTOM } from "./config.js";

const SYSTEM_ID = "dnd-custom-ai";

/**
 * Clés de libellé du chemin de dossier d'une créature du bestiaire.
 * - Site de pierre : le site, puis « Avant la rupture » (phase 0) ou « Après la rupture » (phase 1+).
 *   L'ordre des ruptures dépend de la table : un site ne se range donc pas sous une phase globale.
 * - Milieu autonome (Ulrich et sa bande) : un seul dossier, les paliers se lisent dans les noms.
 * - Ailleurs : la phase de campagne, puis le milieu.
 * @returns {string[]} vide si les flags `phase`/`habitat` manquent ou sont inconnus
 */
export function bestiaryFolderKeys(entry) {
  const flags = entry.flags?.[SYSTEM_ID] ?? {};
  const phaseKey = DND_CUSTOM.bestiaryPhases[flags.phase];
  const habitatKey = DND_CUSTOM.bestiaryHabitats[flags.habitat];
  if (!phaseKey || !habitatKey) return [];
  if (DND_CUSTOM.bestiarySiteHabitats.includes(flags.habitat)) {
    return [habitatKey, flags.phase === 0 ? DND_CUSTOM.bestiaryRupture.before : DND_CUSTOM.bestiaryRupture.after];
  }
  if (DND_CUSTOM.bestiaryStandaloneHabitats.includes(flags.habitat)) return [habitatKey];
  return [phaseKey, habitatKey];
}

/** Toutes les clés de libellé pouvant nommer un dossier du bestiaire (pour le ménage des dossiers vides). */
export function bestiaryFolderLabelKeys() {
  return [
    ...Object.values(DND_CUSTOM.bestiaryPhases),
    ...Object.values(DND_CUSTOM.bestiaryHabitats),
    ...Object.values(DND_CUSTOM.bestiaryRupture)
  ];
}

/**
 * Vrai si la créature respecte le monde scellé : en phase 0 (pour un site, avant sa rupture), hors du
 * large de la Mer intérieure, seuls les humanoïdes et les bêtes existent, plus les types qu'admet la
 * fuite d'une pierre sur son site (`bestiaryLeakTypes`, ex. les plantes de Tirwen).
 */
export function fitsSealedWorld(entry) {
  const flags = entry.flags?.[SYSTEM_ID] ?? {};
  if (flags.phase !== 0 || DND_CUSTOM.bestiaryMagicHabitats.includes(flags.habitat)) return true;
  const leakTypes = DND_CUSTOM.bestiaryLeakTypes[flags.habitat] ?? [];
  return ["humanoid", "beast", ...leakTypes].includes(entry.system?.creatureType);
}
