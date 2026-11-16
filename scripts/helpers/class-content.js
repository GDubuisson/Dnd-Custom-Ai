import { DND_CUSTOM } from "./config.js";

const SYSTEM_ID = "dnd-custom-ai";

/** Items d'un `type` répondant à `predicate`, dans le monde puis le compendium, dédoublonnés par nom. */
export async function findClassContentCandidates(type, packName, predicate) {
  const fromWorld = game.items.filter((item) => item.type === type && predicate(item.system));

  const pack = game.packs.get(`${SYSTEM_ID}.${packName}`);
  const fromPack = pack ? (await pack.getDocuments()).filter((item) => predicate(item.system)) : [];

  const byName = new Map();
  for (const item of [...fromWorld, ...fromPack]) {
    if (!byName.has(item.name)) byName.set(item.name, item);
  }
  return [...byName.values()];
}

/** Nombre d'Items d'un `type` disponibles, pour détecter un compendium encore vide. */
function countAvailableContent(type, packName) {
  const worldCount = game.items.filter((item) => item.type === type).length;
  const pack = game.packs.get(`${SYSTEM_ID}.${packName}`);
  return worldCount + (pack?.index.size ?? 0);
}

/**
 * Octroie les Capacités et Sorts accessibles à la classe, sous-classe et niveau de `actor`.
 * @returns {Promise<string[]>} noms des Items octroyés
 */
export async function grantClassContent(actor, classKey, level) {
  if (!classKey) return [];
  const ownedNames = new Set(actor.items.contents.map((item) => item.name));
  const isSpellcaster = DND_CUSTOM.spellcastingClasses.includes(classKey);

  const subclassKey = actor.system.subclass;

  // Plus haut niveau de sort accessible, dérivé par CharacterData.
  const maxSpellLevel = actor.system.spells?.maxLevel ?? 0;

  // Capacités d'abord : elles déterminent les sorts bonus.
  const features = await findClassContentCandidates(
    "feature",
    "capacites",
    (system) =>
      // Capacité universelle ou de la classe du personnage (comparaison par clé).
      (system.universal || system.class === classKey) &&
      (system.level ?? 1) <= level &&
      // Capacité de base, ou de la sous-classe choisie.
      (!system.subclass || system.subclass === subclassKey) &&
      // Capacités à choisir manuellement exclues.
      !system.manualOnly
  );

  // Sorts nommément accordés par une Capacité (ex. Chevalier occulte).
  const bonusSpellNames = new Set(features.flatMap((feature) => [...(feature.system.grantsSpells ?? [])]));

  const [spells, bonusSpells] = await Promise.all([
    isSpellcaster
      ? findClassContentCandidates(
          "spell",
          "sorts",
          (system) =>
            system.classes?.has?.(classKey) && (system.level === 0 || system.level <= maxSpellLevel)
        )
      : [],
    bonusSpellNames.size
      ? findClassContentCandidates("spell", "sorts", () => true).then((candidates) =>
          candidates.filter((item) => bonusSpellNames.has(item.name))
        )
      : []
  ]);

  const toGrant = [...features, ...spells, ...bonusSpells].filter((item) => !ownedNames.has(item.name));

  if (toGrant.length) {
    await actor.createEmbeddedDocuments("Item", toGrant.map((item) => item.toObject()));
  } else {
    // Avertit seulement si le compendium semble vide.
    const featurePoolEmpty = countAvailableContent("feature", "capacites") === 0;
    const spellPoolEmpty = isSpellcaster && countAvailableContent("spell", "sorts") === 0;
    if (featurePoolEmpty || spellPoolEmpty) {
      ui.notifications.warn(game.i18n.localize("DND_CUSTOM.Wizard.ClassContentMissing"));
    }
  }
  return toGrant.map((item) => item.name);
}

/**
 * Octroie le Commun et la langue de l'Origine, s'ils manquent.
 * @returns {Promise<string[]>} noms des Items octroyés
 */
export async function grantLanguages(actor, originKey) {
  const ownedNames = new Set(actor.items.contents.map((item) => item.name));
  const originLanguage = game.dndCustomAi?.origins?.[originKey]?.language;
  const wantedNames = new Set(["Commun", originLanguage].filter(Boolean));

  const languages = await findClassContentCandidates("language", "langues", () => true);
  const toGrant = languages.filter((item) => wantedNames.has(item.name) && !ownedNames.has(item.name));

  if (toGrant.length) {
    await actor.createEmbeddedDocuments("Item", toGrant.map((item) => item.toObject()));
  } else if (countAvailableContent("language", "langues") === 0) {
    ui.notifications.warn(game.i18n.localize("DND_CUSTOM.Wizard.ClassContentMissing"));
  }
  return toGrant.map((item) => item.name);
}
