import { DND_CUSTOM } from "./config.js";

const SYSTEM_ID = "dnd-custom-ai";

/**
 * Clés de libellé du chemin de dossier d'une créature du bestiaire : phase de campagne, puis milieu.
 * @returns {string[]} vide si les flags `phase`/`habitat` manquent ou sont inconnus
 */
export function bestiaryFolderKeys(entry) {
  const flags = entry.flags?.[SYSTEM_ID] ?? {};
  const phaseKey = DND_CUSTOM.bestiaryPhases[flags.phase];
  const habitatKey = DND_CUSTOM.bestiaryHabitats[flags.habitat];
  return phaseKey && habitatKey ? [phaseKey, habitatKey] : [];
}

/**
 * Vrai si la créature respecte le monde scellé : en phase 0, hors du large de la Mer intérieure,
 * seuls les humanoïdes et les bêtes existent.
 */
export function fitsSealedWorld(entry) {
  const flags = entry.flags?.[SYSTEM_ID] ?? {};
  if (flags.phase !== 0 || DND_CUSTOM.bestiaryMagicHabitats.includes(flags.habitat)) return true;
  return ["humanoid", "beast"].includes(entry.system?.creatureType);
}
