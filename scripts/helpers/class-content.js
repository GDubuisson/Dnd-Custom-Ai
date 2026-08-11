import { DND_CUSTOM } from "./config.js";

const SYSTEM_ID = "dnd-custom-ai";

/** Cherche les Items d'un `type` donné correspondant à `predicate`, d'abord dans les Items du
 *  monde (comme l'équipement de départ, cf. character-creation-wizard.js), puis dans le
 *  compendium `packName` (packs/capacites ou packs/sorts) une fois peuplé par l'import
 *  automatique (content-import.js) — dédoublonné par nom, l'exemplaire du monde prévalant s'il
 *  existe déjà (même logique que #grantStartingEquipment). */
async function findClassContentCandidates(type, packName, predicate) {
  const fromWorld = game.items.filter((item) => item.type === type && predicate(item.system));

  const pack = game.packs.get(`${SYSTEM_ID}.${packName}`);
  const fromPack = pack ? (await pack.getDocuments()).filter((item) => predicate(item.system)) : [];

  const byName = new Map();
  for (const item of [...fromWorld, ...fromPack]) {
    if (!byName.has(item.name)) byName.set(item.name, item);
  }
  return [...byName.values()];
}

/** Octroie à `actor` les Capacités de classe et, s'il s'agit d'une classe lanceuse, les Sorts
 *  correspondant à sa classe/son niveau actuel, s'il ne les possède pas déjà (par nom) :
 *  - Capacités (FeatureData.class/level, libellé de classe localisé exact, ex. "Barbare") :
 *    toute Capacité dont le niveau requis est atteint (`level` <= niveau du personnage).
 *  - Sorts (SpellData.classes/level, liste de libellés séparés par virgule) : tours de magie
 *    (niveau 0, toujours connus) + sorts dont le niveau est couvert par au moins un emplacement
 *    de sort actuel (system.spells.slots, déjà recalculé pour le niveau courant, cf.
 *    CharacterData#prepareDerivedData). Reflète l'esprit "lanceur préparé" du SRD 5e (accès à
 *    toute la liste de sorts de la classe, le joueur choisit ensuite lesquels préparer/lancer,
 *    cf. case "Préparé" déjà existante sur l'onglet Capacités) — simplification assumée, comme
 *    l'équipement de départ (DND_CUSTOM.classStartingEquipment) : pas les tables "sorts connus"
 *    complètes propres à chaque classe (Barde/Ensorceleur/Occultiste/Magicien).
 *
 *  Appelée à la création du personnage (character-creation-wizard.js) et à chaque montée de
 *  niveau (actor-sheet.js > #onLevelUp). Renvoie les noms des Items effectivement octroyés
 *  (pour un éventuel message de chat), tableau vide si rien de nouveau. */
export async function grantClassContent(actor, classKey, level) {
  if (!classKey) return [];
  const classLabel = game.i18n.localize(DND_CUSTOM.classes[classKey]);
  const ownedNames = new Set(actor.items.contents.map((item) => item.name));

  const features = await findClassContentCandidates(
    "feature",
    "capacites",
    (system) => system.class === classLabel && (system.level ?? 1) <= level
  );
  const toGrant = features.filter((item) => !ownedNames.has(item.name));

  if (DND_CUSTOM.spellcastingClasses.includes(classKey)) {
    const slots = actor.system.spells?.slots ?? {};
    const maxSpellLevel = Object.entries(slots).reduce(
      (max, [spellLevel, slot]) => (slot.max > 0 ? Math.max(max, Number(spellLevel)) : max),
      0
    );
    const spells = await findClassContentCandidates("spell", "sorts", (system) => {
      const classes = String(system.classes ?? "")
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean);
      if (!classes.includes(classLabel)) return false;
      return system.level === 0 || system.level <= maxSpellLevel;
    });
    toGrant.push(...spells.filter((item) => !ownedNames.has(item.name)));
  }

  if (toGrant.length) {
    await actor.createEmbeddedDocuments("Item", toGrant.map((item) => item.toObject()));
  }
  return toGrant.map((item) => item.name);
}
