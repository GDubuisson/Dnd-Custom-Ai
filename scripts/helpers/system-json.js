const SYSTEM_ID = "dnd-custom-ai";

/**
 * Charge un fichier JSON livré avec le système.
 * @param {string} relativePath - chemin relatif à la racine du système
 */
export async function loadSystemJson(relativePath) {
  const response = await fetch(`systems/${SYSTEM_ID}/${relativePath}`);
  return response.json();
}
