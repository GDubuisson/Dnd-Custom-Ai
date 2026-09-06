import { DND_CUSTOM } from "./config.js";
import { loadSystemJson } from "./system-json.js";

const SYSTEM_ID = "dnd-custom-ai";

// Armes/armures/objets/outils : importés dans les Items du monde (comme avant, cf.
// world-items/README.md), rangés dans un dossier par catégorie (cf. ensureFolder ci-dessous —
// retour de test, tout arrivait en vrac dans l'onglet "Objets"). Classes/Sous-classes/Origines/
// Sorts/Capacités de classe/Dons/Langues/Adversaires : importés DIRECTEMENT dans leur compendium
// (packs/classes, packs/sous-classes, packs/origines, packs/sorts, packs/capacites,
// packs/dons, packs/langues, packs/adversaires, cf. system.json > packs), qui
// reste vide sinon — Foundry ne compile ces packs qu'à partir de documents ajoutés depuis
// l'interface, et ce système n'a pas d'étape de build pour les préremplir autrement (cf.
// ClaudeFiles/CONCEPTION_TECHNIQUE.md > pas de build). Les compendiums n'ont pas cette notion de dossier ici (pas
// demandé, et une seule catégorie par compendium de toute façon). `packs/adversaires` est le seul
// compendium Actor (tous les autres sont des compendiums Item) — cf. `compendium.documentClass`
// dans la boucle COMPENDIUM_FILES plus bas, qui s'adapte au type réel du pack.
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
  { file: "languages.json", pack: `${SYSTEM_ID}.langues` },
  // Bestiaire (PNJ pré-configurés, chantier "Adversaires" — humanoïdes + bêtes sauvages
  // réelles, aucune créature légendaire/mythique, cf. world-items/README.md), seul fichier de
  // COMPENDIUM_FILES à peupler un compendium Actor plutôt qu'Item : cf. `compendium.
  // documentClass.createDocuments` ci-dessous (résolu dynamiquement par pack, plutôt qu'un
  // Item.createDocuments en dur qui échouerait silencieusement sur des données d'Actor).
  { file: "npcs.json", pack: `${SYSTEM_ID}.adversaires` }
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

/** `entry` (donnée brute JSON, forcément PARTIELLE — un fichier world-items/*.json n'écrit
 *  jamais un champ de schéma qui garde sa valeur par défaut) diffère-t-il de `existing` (Item/
 *  Actor déjà présent, même nom) ? Comparer `entry.system` directement à `existing.system` (le
 *  `system` "préparé", DataModel résolu avec valeurs par défaut ET données dérivées calculées)
 *  déclencherait un patch sur QUASIMENT CHAQUE entrée à CHAQUE appel, JSON identique ou pas — un
 *  premier essai en conditions réelles (2026-09-05, capacités/sorts/dons... 100% "modifiés" à
 *  chaque rechargement) l'a confirmé avant que ça n'atteigne un commit. La bonne comparaison :
 *  fusionner `entry.system` PAR-DESSUS `existing.toObject().system` (données brutes stockées,
 *  sans dérivé ni défaut de schéma ajouté au vol) via `foundry.utils.mergeObject` — exactement
 *  la même fusion récursive (clé par clé, jamais un remplacement complet) que celle qu'appliquera
 *  réellement `updateDocuments({system: entry.system})`. Si le résultat de cette fusion est
 *  identique aux données brutes déjà stockées, rien à appliquer ; sinon, `entry.system` est le
 *  patch (partiel, jamais l'objet complet). Renvoie `null` si rien n'a changé — évite un
 *  `updateDocuments` (et le hook `updateItem`/`updateActor` associé) pour une entrée déjà à jour. */
function diffPatch(entry, existing) {
  const patch = {};
  if (entry.img && entry.img !== existing.img) patch.img = entry.img;
  if (entry.system) {
    const currentSystem = existing.toObject().system ?? {};
    const mergedSystem = foundry.utils.mergeObject(currentSystem, entry.system, { inplace: false });
    if (!foundry.utils.objectsEqual(mergedSystem, currentSystem)) patch.system = entry.system;
  }
  if (!Object.keys(patch).length) return null;
  return { _id: existing.id ?? existing._id, ...patch };
}

/** Importe tout le contenu de référence du système (classes, origines, sorts, capacités de
 *  classe, armes/armures/objets/outils) et le **resynchronise** : une entrée absente (par nom)
 *  est créée, une entrée déjà présente dont le contenu (`img`/`system`) diffère du JSON source
 *  est ÉCRASÉE par ce JSON — `world-items/*.json` reste l'unique source de vérité pour ce
 *  contenu de règles (cf. `ClaudeFiles/CONCEPTION_TECHNIQUE.md`), jamais un espace de
 *  personnalisation libre. Décision explicite de l'utilisateur (2026-09-05, cf. dette technique
 *  "les compendiums ne se remettent jamais à jour", `ClaudeFiles/ANOMALIES_ACTIVES.md`) : **toute
 *  modification manuelle d'un Item/Actor de compendium (ou d'un Item de référence du monde —
 *  arme/armure/objet/outil) sera écrasée au prochain chargement du monde** si le JSON source a
 *  changé depuis, sans confirmation ni sauvegarde préalable — attendu, pas un bug. Un renommage
 *  dans le JSON source (le nom sert de clé de rapprochement) reste hors de portée de cette
 *  resynchronisation : traité comme une suppression + un ajout, l'ancienne entrée nommée
 *  différemment n'est ni renommée ni retirée automatiquement (limitation connue, cf.
 *  `ClaudeFiles/CONCEPTION_TECHNIQUE.md`).
 *
 *  Rejouable sans risque à chaque nouvelle version de world-items/*.json — lancée automatiquement
 *  au chargement du monde (hook "ready", cf. dnd-custom-ai.js) ; reste aussi exposée via
 *  `game.dndCustomAi.importSystemContent()` et une Macro monde (cf. ensureContentImportMacro
 *  ci-dessous) en secours si l'auto-import a été raté (ex. monde ouvert hors ligne lors d'une
 *  mise à jour du système). Retour de test à l'origine du découplage import/hook "ready" : les
 *  compendiums Classes/Origines restaient vides et les sorts/capacités de classe absents faute
 *  d'avoir remarqué/exécuté la macro documentée. */
export async function importSystemContent({ notifyIfEmpty = true } = {}) {
  if (!game.user.isGM) return;

  let totalImported = 0;
  let totalUpdated = 0;

  for (const { file, type, folderKey, subfolder } of WORLD_ITEM_FILES) {
    const topFolder = await ensureFolder(game.i18n.localize(folderKey));
    const subfolderCache = new Map();

    const data = await loadSystemJson(`world-items/${file}`);
    const existingByName = new Map(game.items.map((item) => [item.name, item]));
    const missing = data.filter((entry) => !existingByName.has(entry.name));
    for (const entry of missing) {
      entry.folder = await resolveFolderId(entry, topFolder, subfolder, subfolderCache);
    }
    if (missing.length) await Item.createDocuments(missing);
    totalImported += missing.length;
    console.log(`${SYSTEM_ID} | ${file} : ${missing.length} objet(s) importé(s) dans les Items du monde`);

    // Resynchronisation : une entrée déjà présente (par nom) dont img/system diffère du JSON
    // source est écrasée par ce JSON (cf. docstring d'importSystemContent ci-dessus — politique
    // assumée, pas un bug). `diffPatch` ne renvoie un patch que si quelque chose a réellement
    // changé, pour ne jamais déclencher un `updateItem` (hooks, `_stats.modifiedTime`...) sur une
    // entrée déjà identique.
    const staleUpdates = data
      .map((entry) => {
        const existing = existingByName.get(entry.name);
        return existing ? diffPatch(entry, existing) : null;
      })
      .filter(Boolean);
    if (staleUpdates.length) {
      await Item.updateDocuments(staleUpdates);
      console.log(`${SYSTEM_ID} | ${file} : ${staleUpdates.length} objet(s) existant(s) resynchronisé(s) depuis le JSON`);
    }
    totalUpdated += staleUpdates.length;

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
    const data = await loadSystemJson(`world-items/${file}`);
    // `await compendium.getIndex()` plutôt que le getter `compendium.index` brut : pour un pack
    // dont l'index n'a pas encore été chargé par ce client à ce point précis du hook `ready`
    // (retour de test — reproduit de façon fiable sur `adversaires`, tout juste ajouté à
    // `system.json` > `packs`), `.index` renvoyable une Collection VIDE plutôt que de lever une
    // erreur : `existingNames` restait vide à chaque session, si bien que `missing` valait TOUJOURS
    // la liste complète et dupliquait les 15 PNJ à chaque rechargement du monde. `getIndex()`
    // force explicitement le chargement/la mise à jour de l'index avant de le lire — inoffensif
    // pour les compendiums déjà indexés (retourne l'index déjà en cache sans requête réseau
    // superflue), donc appliqué à TOUS les fichiers de COMPENDIUM_FILES, pas seulement celui-ci.
    const index = await compendium.getIndex();
    const existingNames = new Set(index.map((entry) => entry.name));
    const missing = data.filter((entry) => !existingNames.has(entry.name));
    // `compendium.documentClass` (Item ou Actor selon le pack, cf. system.json > packs > "type")
    // plutôt qu'un `Item.createDocuments` en dur : seul ce fichier peuple un compendium Actor
    // (npcs.json -> packs/adversaires), tous les autres restent des Items comme avant.
    if (missing.length) await compendium.documentClass.createDocuments(missing, { pack: packId });
    totalImported += missing.length;
    console.log(`${SYSTEM_ID} | ${file} : ${missing.length} objet(s) importé(s) dans ${packId}`);

    // Resynchronisation (même politique que les Items du monde ci-dessus, cf. docstring
    // d'importSystemContent) : `getIndex()` ne porte pas `system` (juste nom/type/img), donc pas
    // assez pour diffé — `getDocuments()` charge les documents complets du pack. Contrairement au
    // getter `.index` (cf. commentaire ci-dessus sur le bug de course déjà corrigé),
    // `getDocuments()` est une vraie méthode asynchrone qui attend le chargement réel : aucun
    // risque de retomber sur ce même bug ici.
    const documents = await compendium.getDocuments();
    const existingByName = new Map(documents.map((doc) => [doc.name, doc]));
    const staleUpdates = data
      .map((entry) => {
        const existing = existingByName.get(entry.name);
        return existing ? diffPatch(entry, existing) : null;
      })
      .filter(Boolean);
    if (staleUpdates.length) {
      await compendium.documentClass.updateDocuments(staleUpdates, { pack: packId });
      console.log(`${SYSTEM_ID} | ${file} : ${staleUpdates.length} objet(s) existant(s) resynchronisé(s) dans ${packId} depuis le JSON`);
    }
    totalUpdated += staleUpdates.length;
  }

  if (totalImported > 0 || totalUpdated > 0 || notifyIfEmpty) {
    ui.notifications.info(
      totalUpdated > 0
        ? game.i18n.format("DND_CUSTOM.Macros.ImportContentDoneWithUpdates", { updated: totalUpdated })
        : game.i18n.localize("DND_CUSTOM.Macros.ImportContentDone")
    );
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
