const SYSTEM_ID = "dnd-custom-ai";

/** Peuple un compendium du système à partir d'un fichier JSON versionné avec le code
 *  (`scripts/data/*.json`, non destiné à être modifié — cf. ClaudeFiles). Comparaison par
 *  nom : n'ajoute que les entrées manquantes, ne touche jamais à une entrée déjà présente
 *  (pour ne pas écraser une modification faite à la main dans le compendium). */
export async function seedCompendiumFromJson(packName, sourcePath) {
  if (!game.user.isGM) return;

  const pack = game.packs.get(`${SYSTEM_ID}.${packName}`);
  if (!pack) return;

  const response = await fetch(`systems/${SYSTEM_ID}/${sourcePath}`);
  const entries = await response.json();

  const index = await pack.getIndex();
  const existingNames = new Set(index.map((entry) => entry.name));
  const missing = entries.filter((entry) => !existingNames.has(entry.name));
  if (!missing.length) return;

  await Item.createDocuments(missing, { pack: pack.collection });
  console.log(`${SYSTEM_ID} | ${missing.length} entrée(s) ajoutée(s) au compendium "${packName}" depuis ${sourcePath}`);
}
