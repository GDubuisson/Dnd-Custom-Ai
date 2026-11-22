import { DND_CUSTOM } from "./config.js";
import { loadSystemJson } from "./system-json.js";
import { bestiaryFolderKeys, bestiaryFolderLabelKeys } from "./bestiary.js";

const SYSTEM_ID = "dnd-custom-ai";

/** Clé de libellé de la région d'un objet (flag `region`), pour son sous-dossier. */
function regionSubfolder(entry) {
  return DND_CUSTOM.regions[entry.flags?.[SYSTEM_ID]?.region];
}

/** Dons d'éclat (flag `shard`) rangés dans le dossier « Éclats » du compendium des dons. */
function featFolderKeys(entry) {
  return entry.flags?.[SYSTEM_ID]?.shard ? ["DND_CUSTOM.Folders.Shards"] : [];
}

// Fichiers importés dans les Items du monde (rangés par dossier) ; les autres contenus
// vont directement dans leur compendium (Item, ou Actor pour les adversaires).
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
  { file: "tools.json", type: "tool", folderKey: "DND_CUSTOM.Folders.Tools" },
  // Fichiers à types mélangés, rangés par région (flag `region`).
  { file: "regional.json", folderKey: "DND_CUSTOM.Folders.Regional", subfolder: regionSubfolder },
  { file: "historical.json", folderKey: "DND_CUSTOM.Folders.Historical", subfolder: regionSubfolder }
];
const COMPENDIUM_FILES = [
  { file: "classes.json", pack: `${SYSTEM_ID}.classes` },
  { file: "subclasses.json", pack: `${SYSTEM_ID}.sous-classes` },
  { file: "origins.json", pack: `${SYSTEM_ID}.origines` },
  { file: "spells.json", pack: `${SYSTEM_ID}.sorts` },
  { file: "features.json", pack: `${SYSTEM_ID}.capacites` },
  {
    file: "feats.json",
    pack: `${SYSTEM_ID}.dons`,
    folderPath: featFolderKeys,
    folderLabels: () => ["DND_CUSTOM.Folders.Shards"]
  },
  { file: "languages.json", pack: `${SYSTEM_ID}.langues` },
  // Compendiums Actor : montures et véhicules, puis le bestiaire (toujours en dernier : les specs
  // attendent la fin de l'import sur le compte des adversaires).
  { file: "mounts.json", pack: `${SYSTEM_ID}.montures-vehicules` },
  // Bestiaire rangé par phase de campagne puis par milieu ; sites de pierre et Ulrich à part.
  {
    file: "npcs.json",
    pack: `${SYSTEM_ID}.adversaires`,
    folderPath: bestiaryFolderKeys,
    folderLabels: bestiaryFolderLabelKeys
  }
];

/** Crée, s'il n'existe pas, le dossier `name` sous `parentId` (racine par défaut) dans le compendium `pack`. */
async function ensurePackFolder(pack, name, parentId = null) {
  const existing = pack.folders.find((folder) => folder.name === name && (folder._source.folder ?? null) === parentId);
  if (existing) return existing;
  return Folder.create({ name, type: pack.documentName, folder: parentId }, { pack: pack.collection });
}

/** Identifiant du dossier de compendium d'une entrée (chemin de clés de libellé), `null` sans chemin. */
async function resolvePackFolderId(pack, entry, folderPathFn) {
  let parentId = null;
  for (const labelKey of folderPathFn(entry)) {
    parentId = (await ensurePackFolder(pack, game.i18n.localize(labelKey), parentId)).id; // NOSONAR : séquentiel voulu
  }
  return parentId;
}

/**
 * Range les documents du compendium dans le dossier que leur entrée JSON leur attribue : ceux encore
 * sans dossier, et ceux d'un ancien rangement (ex. sites de pierre sortis des phases en 1.7.0).
 */
async function filePackDocuments(pack, data, folderPathFn) {
  const dataByName = new Map(data.map((entry) => [entry.name, entry]));
  const documents = await pack.getDocuments();
  const updates = [];
  for (const doc of documents) {
    const entry = dataByName.get(doc.name);
    if (!entry) continue;
    const folder = await resolvePackFolderId(pack, entry, folderPathFn); // NOSONAR : séquentiel voulu
    if (folder && doc._source.folder !== folder) updates.push({ _id: doc.id, folder });
  }
  if (!updates.length) return;
  await pack.documentClass.updateDocuments(updates, { pack: pack.collection });
  console.log(`${SYSTEM_ID} | ${pack.collection} : ${updates.length} document(s) existant(s) rangé(s) dans un dossier`);
}

/**
 * Supprime les dossiers vides du compendium (ni document ni sous-dossier) portant un des libellés
 * gérés par le système, restes d'un ancien rangement. Un dossier créé à la main par le MJ sous un
 * autre nom n'est jamais touché.
 */
async function prunePackFolders(pack, labelKeys) {
  const managedNames = new Set(labelKeys.map((key) => game.i18n.localize(key)));
  const documents = await pack.getDocuments();
  const used = new Set(documents.map((doc) => doc._source.folder).filter(Boolean));
  const removed = new Set();
  let changed = true;
  while (changed) {
    changed = false;
    for (const folder of pack.folders) {
      if (removed.has(folder.id) || used.has(folder.id) || !managedNames.has(folder.name)) continue;
      const hasChild = pack.folders.some((child) => !removed.has(child.id) && child._source.folder === folder.id);
      if (hasChild) continue;
      removed.add(folder.id);
      changed = true;
    }
  }
  if (!removed.size) return;
  await Folder.deleteDocuments([...removed], { pack: pack.collection });
  console.log(`${SYSTEM_ID} | ${pack.collection} : ${removed.size} dossier(s) vide(s) supprimé(s)`);
}

/** Crée, s'il n'existe pas, le dossier d'Items `name` sous `parentId` (racine par défaut). */
async function ensureFolder(name, parentId = null) {
  const existing = game.folders.find(
    (folder) => folder.type === "Item" && folder.name === name && (folder.folder?.id ?? null) === parentId
  );
  if (existing) return existing;
  return Folder.create({ name, type: "Item", folder: parentId });
}

/** Dossier cible d'une entrée : sous-dossier de catégorie si `subfolderFn` en fournit un, sinon `topFolder`. */
async function resolveFolderId(entry, topFolder, subfolderFn, cache) {
  const labelKey = subfolderFn?.(entry);
  if (!labelKey) return topFolder.id;

  const label = game.i18n.localize(labelKey);
  if (!cache.has(label)) cache.set(label, await ensureFolder(label, topFolder.id));
  return cache.get(label).id;
}

/**
 * Patch à appliquer pour aligner `existing` sur l'entrée JSON partielle `entry`.
 * @returns {object|null} `null` si la fusion ne change rien aux données stockées
 */
function diffPatch(entry, existing) {
  const patch = {};
  if (entry.img && entry.img !== existing.img) patch.img = entry.img;
  if (entry.system) {
    const currentSystem = existing.toObject().system ?? {};
    const mergedSystem = foundry.utils.mergeObject(currentSystem, entry.system, { inplace: false });
    if (!foundry.utils.equals(mergedSystem, currentSystem)) patch.system = entry.system;
  }
  if (!Object.keys(patch).length) return null;
  return { _id: existing.id ?? existing._id, ...patch };
}

/** Patches des entrées JSON qui diffèrent de leur document existant (rapproché par nom). */
function staleUpdatesFor(data, existingByName) {
  return data
    .map((entry) => {
      const existing = existingByName.get(entry.name);
      return existing ? diffPatch(entry, existing) : null;
    })
    .filter(Boolean);
}

/** Range dans leur dossier les Items de ce type (ou de ce fichier, s'il mélange les types) encore sans dossier. */
async function fileUnfiledItems({ file, type, subfolder }, data, topFolder, subfolderCache) {
  const names = new Set(data.map((entry) => entry.name));
  const unfiled = game.items.filter((item) => !item.folder && (type ? item.type === type : names.has(item.name)));
  if (!unfiled.length) return;
  const updates = [];
  for (const item of unfiled) {
    updates.push({ _id: item.id, folder: await resolveFolderId(item, topFolder, subfolder, subfolderCache) }); // NOSONAR : séquentiel voulu
  }
  await Item.updateDocuments(updates);
  console.log(`${SYSTEM_ID} | ${file} : ${updates.length} objet(s) existant(s) rangé(s) dans un dossier`);
}

/** Synchronise un fichier `world-items/*.json` avec les Items du monde. */
async function syncWorldItemFile(spec) {
  const { file, folderKey, subfolder } = spec;
  const topFolder = await ensureFolder(game.i18n.localize(folderKey));
  const subfolderCache = new Map();

  const data = await loadSystemJson(`world-items/${file}`);
  const existingByName = new Map(game.items.map((item) => [item.name, item]));
  const missing = data.filter((entry) => !existingByName.has(entry.name));
  for (const entry of missing) {
    entry.folder = await resolveFolderId(entry, topFolder, subfolder, subfolderCache); // NOSONAR : séquentiel voulu
  }
  if (missing.length) await Item.createDocuments(missing);
  console.log(`${SYSTEM_ID} | ${file} : ${missing.length} objet(s) importé(s) dans les Items du monde`);

  // Écrase les entrées existantes qui diffèrent du JSON source.
  const staleUpdates = staleUpdatesFor(data, existingByName);
  if (staleUpdates.length) {
    await Item.updateDocuments(staleUpdates);
    console.log(`${SYSTEM_ID} | ${file} : ${staleUpdates.length} objet(s) existant(s) resynchronisé(s) depuis le JSON`);
  }

  await fileUnfiledItems(spec, data, topFolder, subfolderCache);
  return { imported: missing.length, updated: staleUpdates.length };
}

/**
 * Supprime du compendium les entrées retirées ou renommées du JSON (`scripts/data/retired-content.json`,
 * noms par fichier) : sans cela, un renommage laisserait l'ancienne fiche en double dans les mondes existants.
 */
async function deleteRetiredEntries(compendium, file, index, retiredByFile) {
  const retired = new Set(retiredByFile[file] ?? []);
  const ids = index.filter((entry) => retired.has(entry.name)).map((entry) => entry._id);
  if (!ids.length) return;
  await compendium.documentClass.deleteDocuments(ids, { pack: compendium.collection });
  console.log(`${SYSTEM_ID} | ${compendium.collection} : ${ids.length} entrée(s) retirée(s) supprimée(s)`);
}

/** Synchronise un fichier `world-items/*.json` avec son compendium du système. */
async function syncCompendiumFile({ file, pack: packId, folderPath, folderLabels }, retiredByFile = {}) {
  const compendium = game.packs.get(packId);
  if (!compendium) {
    console.warn(`${SYSTEM_ID} | Compendium ${packId} introuvable, ${file} ignoré`);
    return { imported: 0, updated: 0 };
  }
  // Déverrouille un compendium verrouillé pour pouvoir y importer.
  if (compendium.locked) {
    await compendium.configure({ locked: false });
    console.log(`${SYSTEM_ID} | Compendium ${packId} déverrouillé automatiquement avant import`);
  }
  const data = await loadSystemJson(`world-items/${file}`);
  // `getIndex()` garantit un index chargé (le getter `index` peut être encore vide).
  const index = await compendium.getIndex();
  await deleteRetiredEntries(compendium, file, index, retiredByFile);
  const existingNames = new Set(index.map((entry) => entry.name));
  const missing = data.filter((entry) => !existingNames.has(entry.name));
  if (folderPath) {
    // Rangement avant création : le compte final des documents signale ainsi la fin de l'import.
    await filePackDocuments(compendium, data, folderPath);
    if (folderLabels) await prunePackFolders(compendium, folderLabels());
    for (const entry of missing) {
      const folder = await resolvePackFolderId(compendium, entry, folderPath); // NOSONAR : séquentiel voulu
      if (folder) entry.folder = folder;
    }
  }
  // Classe de document du pack : Item ou Actor.
  if (missing.length) await compendium.documentClass.createDocuments(missing, { pack: packId });
  console.log(`${SYSTEM_ID} | ${file} : ${missing.length} objet(s) importé(s) dans ${packId}`);

  // Documents complets nécessaires pour comparer `system`.
  const documents = await compendium.getDocuments();
  const staleUpdates = staleUpdatesFor(data, new Map(documents.map((doc) => [doc.name, doc])));
  if (staleUpdates.length) {
    await compendium.documentClass.updateDocuments(staleUpdates, { pack: packId });
    console.log(`${SYSTEM_ID} | ${file} : ${staleUpdates.length} objet(s) existant(s) resynchronisé(s) dans ${packId} depuis le JSON`);
  }
  return { imported: missing.length, updated: staleUpdates.length };
}

/**
 * Importe et resynchronise le contenu de référence depuis `world-items/*.json` (source de vérité) :
 * crée les entrées absentes et écrase celles qui diffèrent, rapprochées par nom.
 */
export async function importSystemContent({ notifyIfEmpty = true } = {}) {
  if (!game.user.isGM) return;

  let totalImported = 0;
  let totalUpdated = 0;
  const tally = ({ imported, updated }) => {
    totalImported += imported;
    totalUpdated += updated;
  };
  for (const spec of WORLD_ITEM_FILES) tally(await syncWorldItemFile(spec)); // NOSONAR : séquentiel voulu
  const retiredByFile = await loadSystemJson("scripts/data/retired-content.json");
  for (const spec of COMPENDIUM_FILES) tally(await syncCompendiumFile(spec, retiredByFile)); // NOSONAR : séquentiel voulu

  if (totalImported > 0 || totalUpdated > 0 || notifyIfEmpty) {
    ui.notifications.info(
      totalUpdated > 0
        ? game.i18n.format("DND_CUSTOM.Macros.ImportContentDoneWithUpdates", { updated: totalUpdated })
        : game.i18n.localize("DND_CUSTOM.Macros.ImportContentDone")
    );
  }
}

/** Crée la macro monde d'import du contenu si elle n'existe pas encore. */
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
