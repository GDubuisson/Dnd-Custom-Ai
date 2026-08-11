const SYSTEM_ID = "dnd-custom-ai";

// Armes/armures/objets/outils : importés dans les Items du monde (comme avant, cf.
// world-items/README.md). Classes/Origines/Sorts/Capacités de classe/Langues : importés
// DIRECTEMENT dans leur compendium (packs/classes, packs/origines, packs/sorts, packs/capacites,
// packs/langues, cf. system.json > packs), qui reste vide sinon — Foundry ne compile ces packs
// qu'à partir de documents ajoutés depuis l'interface, et ce système n'a pas d'étape de build
// pour les préremplir autrement (cf. PROJECT.md > pas de build).
const WORLD_ITEM_FILES = ["armors.json", "weapons.json", "gear.json", "tools.json"];
const COMPENDIUM_FILES = [
  { file: "classes.json", pack: `${SYSTEM_ID}.classes` },
  { file: "origins.json", pack: `${SYSTEM_ID}.origines` },
  { file: "spells.json", pack: `${SYSTEM_ID}.sorts` },
  { file: "features.json", pack: `${SYSTEM_ID}.capacites` },
  { file: "languages.json", pack: `${SYSTEM_ID}.langues` }
];

/** Importe tout le contenu de référence du système (classes, origines, sorts, capacités de
 *  classe, armes/armures/objets/outils) : sans doublon (comparaison par nom), rejouable sans
 *  risque à chaque nouvelle version de world-items/*.json. Lancée automatiquement au chargement
 *  du monde (hook "ready", cf. dnd-custom-ai.js) — plus besoin d'une action manuelle du MJ ;
 *  reste aussi exposée via `game.dndCustomAi.importSystemContent()` et une Macro monde (cf.
 *  ensureContentImportMacro ci-dessous) en secours si l'auto-import a été raté (ex. monde
 *  ouvert hors ligne lors d'une mise à jour du système). Retour de test à l'origine de ce
 *  découplage : les compendiums Classes/Origines restaient vides et les sorts/capacités de
 *  classe absents faute d'avoir remarqué/exécuté la macro documentée. */
export async function importSystemContent({ notifyIfEmpty = true } = {}) {
  if (!game.user.isGM) return;

  let totalImported = 0;

  for (const file of WORLD_ITEM_FILES) {
    const data = await fetch(`systems/${SYSTEM_ID}/world-items/${file}`).then((r) => r.json());
    const existingNames = new Set(game.items.map((item) => item.name));
    const missing = data.filter((entry) => !existingNames.has(entry.name));
    if (missing.length) await Item.createDocuments(missing);
    totalImported += missing.length;
    console.log(`${SYSTEM_ID} | ${file} : ${missing.length} objet(s) importé(s) dans les Items du monde`);
  }

  for (const { file, pack: packId } of COMPENDIUM_FILES) {
    const compendium = game.packs.get(packId);
    if (!compendium) {
      console.warn(`${SYSTEM_ID} | Compendium ${packId} introuvable, ${file} ignoré`);
      continue;
    }
    const data = await fetch(`systems/${SYSTEM_ID}/world-items/${file}`).then((r) => r.json());
    const existingNames = new Set(compendium.index.map((entry) => entry.name));
    const missing = data.filter((entry) => !existingNames.has(entry.name));
    if (missing.length) await Item.createDocuments(missing, { pack: packId });
    totalImported += missing.length;
    console.log(`${SYSTEM_ID} | ${file} : ${missing.length} objet(s) importé(s) dans ${packId}`);
  }

  if (totalImported > 0 || notifyIfEmpty) {
    ui.notifications.info(game.i18n.localize("DND_CUSTOM.Macros.ImportContentDone"));
  }
}

/** Crée (une seule fois, si absente) une Macro monde qui lance l'import ci-dessus — même
 *  principe que ensureAwardXpMacro (xp.js) : jamais écrasée si elle existe déjà. */
export async function ensureContentImportMacro() {
  if (!game.user.isGM) return;

  const name = game.i18n.localize("DND_CUSTOM.Macros.ImportContent");
  if (game.macros.getName(name)) return;

  await Macro.create({
    name,
    type: "script",
    scope: "global",
    img: "icons/svg/downgrade.svg",
    command: "await game.dndCustomAi.importSystemContent();"
  });
}
