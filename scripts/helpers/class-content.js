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

/** Nombre total d'Items d'un `type` disponibles (monde + compendium `packName`), sans filtre
 *  classe/niveau : sert uniquement à distinguer "rien de nouveau à ce niveau" (normal, la
 *  plupart des niveaux n'apportent aucune Capacité) de "le compendium est vide" (import du
 *  contenu système pas encore terminé, cf. #grantClassContent ci-dessous). `pack.index` est
 *  déjà chargé sans requête réseau supplémentaire (contrairement à getDocuments), donc peu
 *  coûteux à vérifier à chaque appel. */
function countAvailableContent(type, packName) {
  const worldCount = game.items.filter((item) => item.type === type).length;
  const pack = game.packs.get(`${SYSTEM_ID}.${packName}`);
  return worldCount + (pack?.index.size ?? 0);
}

/** Octroie à `actor` les Capacités de classe et, s'il s'agit d'une classe lanceuse, les Sorts
 *  correspondant à sa classe/son niveau actuel, s'il ne les possède pas déjà (par nom) :
 *  - Capacités (FeatureData.class/level, libellé de classe localisé exact, ex. "Barbare") :
 *    toute Capacité dont le niveau requis est atteint (`level` <= niveau du personnage). Une
 *    Capacité de sous-classe (FeatureData.subclass renseigné) n'est incluse que si elle
 *    correspond à la sous-classe choisie par le personnage (actor.system.subclass, cf.
 *    DND_CUSTOM.subclasses, config.js) — vide, elle reste une Capacité de classe de base.
 *  - Sorts (SpellData.classes/level, liste de libellés séparés par virgule) : tours de magie
 *    (niveau 0, toujours connus) + sorts dont le niveau est couvert par le plus haut niveau de
 *    sort accessible au personnage (system.spells.maxLevel, déjà recalculé pour le niveau
 *    courant, cf. CharacterData#prepareDerivedData). Reflète l'esprit "lanceur préparé" du
 *    SRD 5e (accès à toute la liste de sorts de la classe, le joueur choisit ensuite lesquels préparer/lancer,
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
  const isSpellcaster = DND_CUSTOM.spellcastingClasses.includes(classKey);

  // Sous-classe (facultative) : lue directement sur l'Actor plutôt que passée en paramètre —
  // grantClassContent est déjà rappelée telle quelle à la montée de niveau (actor-sheet.js >
  // #onLevelUp) et au changement de sous-classe (hook updateActor, dnd-custom-ai.js), les deux
  // fois avec actor.system.subclass à jour. Vide tant qu'aucune sous-classe n'est choisie.
  const subclassKey = actor.system.subclass;
  const subclassLabel = subclassKey ? game.i18n.localize(DND_CUSTOM.subclasses[classKey]?.[subclassKey]) : "";

  // Plus haut niveau de sort accessible à la classe/au niveau du personnage : donnée dérivée
  // exposée par CharacterData#prepareDerivedData (cf. rules.js > spellUsesForClass), pas
  // recalculée ici pour éviter de dupliquer la logique de la table SRD.
  const maxSpellLevel = actor.system.spells?.maxLevel ?? 0;

  // Capacités et Sorts recherchés en parallèle (deux lectures de compendium indépendantes,
  // cf. findClassContentCandidates) plutôt que l'une après l'autre : évite de doubler
  // l'attente perçue par le joueur/MJ à la création ou à la montée de niveau.
  const [features, spells] = await Promise.all([
    findClassContentCandidates(
      "feature",
      "capacites",
      (system) =>
        system.class === classLabel &&
        (system.level ?? 1) <= level &&
        // Capacité de classe de base (system.subclass vide) toujours éligible ; une Capacité de
        // sous-classe (system.subclass renseigné) seulement si elle correspond à la sous-classe
        // choisie par le personnage (cf. subclassLabel ci-dessus).
        (!system.subclass || system.subclass === subclassLabel)
    ),
    isSpellcaster
      ? findClassContentCandidates("spell", "sorts", (system) => {
          const classes = String(system.classes ?? "")
            .split(",")
            .map((entry) => entry.trim())
            .filter(Boolean);
          if (!classes.includes(classLabel)) return false;
          return system.level === 0 || system.level <= maxSpellLevel;
        })
      : []
  ]);

  const toGrant = [...features, ...spells].filter((item) => !ownedNames.has(item.name));

  if (toGrant.length) {
    await actor.createEmbeddedDocuments("Item", toGrant.map((item) => item.toObject()));
  } else {
    // Rien de nouveau à ce niveau est le cas normal la plupart du temps (peu de niveaux
    // apportent une Capacité) : on ne prévient que si le compendium correspondant semble
    // carrément vide (import du contenu système pas encore terminé, cf. hook "ready",
    // dnd-custom-ai.js — fenêtre possible juste après le chargement du monde), pas à chaque
    // niveau sans nouveauté.
    const featurePoolEmpty = countAvailableContent("feature", "capacites") === 0;
    const spellPoolEmpty = isSpellcaster && countAvailableContent("spell", "sorts") === 0;
    if (featurePoolEmpty || spellPoolEmpty) {
      ui.notifications.warn(game.i18n.localize("DND_CUSTOM.Wizard.ClassContentMissing"));
    }
  }
  return toGrant.map((item) => item.name);
}

/** Octroie à `actor` la langue Commune et, si une Origine est renseignée, sa langue d'Origine
 *  (cf. scripts/data/origins.json > `language`), s'il ne les possède pas déjà (par nom). Les
 *  langues spéciales (catégorie "special", cf. LanguageData) ne sont volontairement jamais
 *  octroyées automatiquement ici : trop dépendantes du passé propre à chaque personnage pour
 *  être déduites de la seule Origine — elles restent un ajout manuel (glisser depuis le
 *  compendium Langues vers l'onglet Journal).
 *
 *  Appelée uniquement à la création du personnage (character-creation-wizard.js) : les langues
 *  connues ne changent pas avec le niveau, contrairement aux Sorts/Capacités (pas d'appel
 *  équivalent depuis #onLevelUp). Renvoie les noms des Items effectivement octroyés, tableau
 *  vide si rien de nouveau. */
export async function grantLanguages(actor, originKey) {
  const ownedNames = new Set(actor.items.contents.map((item) => item.name));
  const originLanguage = game.dndCustomAi?.origins?.[originKey]?.language;
  const wantedNames = new Set(["Commune", originLanguage].filter(Boolean));

  const languages = await findClassContentCandidates("language", "langues", () => true);
  const toGrant = languages.filter((item) => wantedNames.has(item.name) && !ownedNames.has(item.name));

  if (toGrant.length) {
    await actor.createEmbeddedDocuments("Item", toGrant.map((item) => item.toObject()));
  } else if (countAvailableContent("language", "langues") === 0) {
    ui.notifications.warn(game.i18n.localize("DND_CUSTOM.Wizard.ClassContentMissing"));
  }
  return toGrant.map((item) => item.name);
}
