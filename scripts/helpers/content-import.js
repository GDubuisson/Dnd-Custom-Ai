import { DND_CUSTOM } from "./config.js";

const SYSTEM_ID = "dnd-custom-ai";

// Armes/armures/objets/outils : importés dans les Items du monde (comme avant, cf.
// world-items/README.md), rangés dans un dossier par catégorie (cf. ensureFolder ci-dessous —
// retour de test, tout arrivait en vrac dans l'onglet "Objets"). Classes/Sous-classes/Origines/
// Sorts/Capacités de classe/Dons/Langues : importés DIRECTEMENT dans leur compendium
// (packs/classes, packs/sous-classes, packs/origines, packs/sorts, packs/capacites,
// packs/dons, packs/langues, cf. system.json > packs), qui
// reste vide sinon — Foundry ne compile ces packs qu'à partir de documents ajoutés depuis
// l'interface, et ce système n'a pas d'étape de build pour les préremplir autrement (cf.
// PROJECT.md > pas de build). Les compendiums n'ont pas cette notion de dossier ici (pas
// demandé, et une seule catégorie par compendium de toute façon).
const WORLD_ITEM_FILES = [
  {
    file: "weapons.json",
    type: "weapon",
    folderKey: "DND_CUSTOM.Folders.Weapons",
    subfolder: (entry) => DND_CUSTOM.weaponTypes[entry.system.weaponType]
  },
  {
    file: "armors.json",
    type: "armor",
    folderKey: "DND_CUSTOM.Folders.Armors",
    subfolder: (entry) => DND_CUSTOM.armorTypes[entry.system.armorType]
  },
  { file: "gear.json", type: "gear", folderKey: "DND_CUSTOM.Folders.Gear" },
  { file: "tools.json", type: "tool", folderKey: "DND_CUSTOM.Folders.Tools" }
];
const COMPENDIUM_FILES = [
  { file: "classes.json", pack: `${SYSTEM_ID}.classes` },
  { file: "subclasses.json", pack: `${SYSTEM_ID}.sous-classes` },
  { file: "origins.json", pack: `${SYSTEM_ID}.origines` },
  { file: "spells.json", pack: `${SYSTEM_ID}.sorts` },
  { file: "features.json", pack: `${SYSTEM_ID}.capacites` },
  { file: "feats.json", pack: `${SYSTEM_ID}.dons` },
  { file: "languages.json", pack: `${SYSTEM_ID}.langues` }
];

/** Crée (une seule fois, si absent) un Folder de type "Item" nommé `name` sous `parentId`
 *  (racine du monde si omis) : dédoublonné par nom + parent, jamais recréé une fois existant —
 *  le MJ reste libre de le renommer/déplacer/y ajouter d'autres Items ensuite sans qu'il ne
 *  soit régénéré au prochain chargement du monde. */
async function ensureFolder(name, parentId = null) {
  const existing = game.folders.find(
    (folder) => folder.type === "Item" && folder.name === name && (folder.folder?.id ?? null) === parentId
  );
  if (existing) return existing;
  return Folder.create({ name, type: "Item", folder: parentId });
}

/** Dossier cible pour `entry` (donnée brute de world-items/*.json OU Item déjà créé, même forme
 *  `entry.system.*` dans les deux cas) : le sous-dossier de `topFolder` si `subfolderFn` en
 *  fournit un (armes/armures, cf. WORLD_ITEM_FILES), sinon `topFolder` lui-même (objets/outils,
 *  pas de sous-catégorie dans ces données). `cache` évite de recréer/rechercher le même
 *  sous-dossier pour chaque Item d'une même catégorie durant un seul import. */
async function resolveFolderId(entry, topFolder, subfolderFn, cache) {
  const labelKey = subfolderFn?.(entry);
  if (!labelKey) return topFolder.id;

  const label = game.i18n.localize(labelKey);
  if (!cache.has(label)) cache.set(label, await ensureFolder(label, topFolder.id));
  return cache.get(label).id;
}

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

  for (const { file, type, folderKey, subfolder } of WORLD_ITEM_FILES) {
    const topFolder = await ensureFolder(game.i18n.localize(folderKey));
    const subfolderCache = new Map();

    const data = await fetch(`systems/${SYSTEM_ID}/world-items/${file}`).then((r) => r.json());
    const existingNames = new Set(game.items.map((item) => item.name));
    const missing = data.filter((entry) => !existingNames.has(entry.name));
    for (const entry of missing) {
      entry.folder = await resolveFolderId(entry, topFolder, subfolder, subfolderCache);
    }
    if (missing.length) await Item.createDocuments(missing);
    totalImported += missing.length;
    console.log(`${SYSTEM_ID} | ${file} : ${missing.length} objet(s) importé(s) dans les Items du monde`);

    // Range aussi rétroactivement les Items de ce type déjà importés avant l'ajout de cette
    // organisation en dossiers (mondes déjà en cours) : uniquement ceux sans dossier du tout,
    // jamais de déplacement forcé d'un Item que le MJ aurait volontairement rangé ailleurs.
    const unfiled = game.items.filter((item) => item.type === type && !item.folder);
    if (unfiled.length) {
      const updates = [];
      for (const item of unfiled) {
        updates.push({ _id: item.id, folder: await resolveFolderId(item, topFolder, subfolder, subfolderCache) });
      }
      await Item.updateDocuments(updates);
      console.log(`${SYSTEM_ID} | ${file} : ${updates.length} objet(s) existant(s) rangé(s) dans un dossier`);
    }
  }

  for (const { file, pack: packId } of COMPENDIUM_FILES) {
    const compendium = game.packs.get(packId);
    if (!compendium) {
      console.warn(`${SYSTEM_ID} | Compendium ${packId} introuvable, ${file} ignoré`);
      continue;
    }
    // Item.createDocuments échoue silencieusement (ou lève) sur un compendium verrouillé — un
    // MJ a pu le verrouiller manuellement depuis la sidebar (protection contre l'édition
    // accidentelle) sans savoir que ce système y importe automatiquement du contenu à chaque
    // chargement du monde. Déverrouillé automatiquement ici plutôt que de faire échouer
    // l'import en silence : jamais re-verrouillé ensuite (le MJ reste libre de le reverrouiller
    // depuis la sidebar s'il le souhaite).
    if (compendium.locked) {
      await compendium.configure({ locked: false });
      console.log(`${SYSTEM_ID} | Compendium ${packId} déverrouillé automatiquement avant import`);
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
