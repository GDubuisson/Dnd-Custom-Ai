const SYSTEM_ID = "dnd-custom-ai";

/** Charge un fichier JSON livré avec le système, `relativePath` étant relatif à la racine du
 *  système (ex. `"world-items/classes.json"`, `"scripts/data/glossary.json"`). Point d'entrée
 *  unique : jusqu'ici le même `fetch(...).json()` était réécrit dans dnd-custom-ai.js,
 *  content-import.js et les deux Journaux-guide. */
export async function loadSystemJson(relativePath) {
  const response = await fetch(`systems/${SYSTEM_ID}/${relativePath}`);
  return response.json();
}
