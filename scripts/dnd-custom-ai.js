import { CharacterData } from "./data/character-data.js";
import { NpcData } from "./data/npc-data.js";
import { VehicleActorData } from "./data/vehicle-actor-data.js";
import { WeaponData, ArmorData, GearData, FeatureData, ToolData, SpellData, LanguageData } from "./data/item-data.js";
import { OriginData } from "./data/origin-data.js";
import { ClassData } from "./data/class-data.js";
import { DndCustomActorSheet } from "./sheets/actor-sheet.js";
import { CharacterCreationWizard } from "./sheets/character-creation-wizard.js";
import { DndCustomNpcSheet } from "./sheets/npc-sheet.js";
import { VehicleActorSheet } from "./sheets/vehicle-actor-sheet.js";
import {
  WeaponItemSheet,
  ArmorItemSheet,
  GearItemSheet,
  FeatureItemSheet,
  OriginItemSheet,
  ClassItemSheet,
  ToolItemSheet,
  SpellItemSheet,
  LanguageItemSheet
} from "./sheets/item-sheets.js";
import { ensureOriginsJournal } from "./helpers/origins-journal.js";
import { ensurePlayerGuideJournal } from "./helpers/player-guide-journal.js";
import { ensureGmGuideJournal } from "./helpers/gm-guide-journal.js";
import { openAwardXpDialog, ensureAwardXpMacro } from "./helpers/xp.js";
import { importSystemContent, ensureContentImportMacro } from "./helpers/content-import.js";
import { resyncControlledToken, ensureTokenResyncMacro } from "./helpers/token-sync.js";
import { ensureWildSurgeTable, rollWildSurge } from "./helpers/wild-magic-tables.js";
import { declareDeath } from "./helpers/death.js";
import { grantClassContent } from "./helpers/class-content.js";
import { registerHandlebarsHelpers } from "./helpers/handlebars-helpers.js";
import {
  equipmentSlots,
  isOffHandEligible,
  abilityModifier,
  proficiencyBonus,
  formatModifier
} from "./helpers/rules.js";
import { DND_CUSTOM } from "./helpers/config.js";

const SYSTEM_ID = "dnd-custom-ai";
// Canal socket (system.json > "socket": true) utilisé pour relayer au MJ actif une mise à jour
// qu'un joueur n'a pas la permission d'effectuer lui-même (cf. requestActorUpdate plus bas —
// PNJ ciblé pour l'application de dégâts, notamment).
const SOCKET_EVENT = `system.${SYSTEM_ID}`;

// Durée de la Rage, SRD 5e (jusqu'à 1 minute = 10 rounds) : décomptée automatiquement round par
// round UNIQUEMENT si un combat Foundry est déjà démarré au moment où l'état "En Rage" (cf.
// DND_CUSTOM.conditions, config.js) est activé — cf. hooks createActiveEffect/updateCombat plus
// bas. Hors combat, la Rage reste manuelle (bascule/désactive l'état à la main), comme avant.
// Ne modélise QUE cette limite de durée, pas la condition de fin anticipée SRD ("un tour sans
// attaque ni dégât subi") : ce système ne verrouille pas l'économie d'action du tour lui-même
// (cf. commentaire sur system.combat, character-data.js), fidèle à ce parti pris existant.
const RAGE_DURATION_ROUNDS = 10;

Hooks.once("init", async () => {
  console.log(`${SYSTEM_ID} | Initialisation du système`);

  // Types déclarés dans system.json ("documentTypes") ; le schéma de chaque type
  // vient de son DataModel, pas d'un template.json (approche dépréciée depuis la V12/V13).
  CONFIG.Actor.dataModels.character = CharacterData;
  CONFIG.Actor.dataModels.npc = NpcData;
  // Montures vivantes : même modèle de données que "npc" (bloc de stats de créature), cf.
  // scripts/sheets/npc-sheet.js — seul le type d'Actor et le libellé de fiche diffèrent.
  CONFIG.Actor.dataModels.mount = NpcData;
  CONFIG.Actor.dataModels.vehicle = VehicleActorData;
  CONFIG.Item.dataModels.weapon = WeaponData;
  CONFIG.Item.dataModels.armor = ArmorData;
  CONFIG.Item.dataModels.gear = GearData;
  CONFIG.Item.dataModels.feature = FeatureData;
  CONFIG.Item.dataModels.tool = ToolData;
  CONFIG.Item.dataModels.spell = SpellData;
  CONFIG.Item.dataModels.language = LanguageData;
  // Destinés aux compendiums (system.json > packs), remplis à la main par le MJ depuis
  // l'interface Foundry (cf. données actuelles dans scripts/data/origins.json pour "origin").
  CONFIG.Item.dataModels.origin = OriginData;
  CONFIG.Item.dataModels.class = ClassData;
  // Sous-classe : même schéma que "class" (nom + description libre), même statut "flavor
  // seulement" — cf. commentaire de ClassData (class-data.js) et DND_CUSTOM.subclasses
  // (config.js) pour la donnée mécanique réelle (niveau d'obtention, Capacités liées).
  CONFIG.Item.dataModels.subclass = ClassData;

  // CONFIG.statusEffects est un Proxy (cf. foundry/client/config.mjs) qui maintient aussi un
  // accès par id (`CONFIG.statusEffects["prone"]`, utilisé en interne par
  // Actor#toggleStatusEffect) : le vider puis le repeupler par push() plutôt que de
  // l'écraser par une simple affectation, sous peine de perdre cet accès par id.
  CONFIG.statusEffects.length = 0;
  for (const condition of DND_CUSTOM.conditions) CONFIG.statusEffects.push(condition);

  DocumentSheetConfig.registerSheet(Actor, SYSTEM_ID, DndCustomActorSheet, {
    types: ["character"],
    makeDefault: true,
    width: 726,
    label: "DND_CUSTOM.SheetLabels.Character"
  });

  DocumentSheetConfig.registerSheet(Actor, SYSTEM_ID, DndCustomNpcSheet, {
    types: ["npc"],
    makeDefault: true,
    width: 726,
    label: "DND_CUSTOM.SheetLabels.Npc"
  });

  DocumentSheetConfig.registerSheet(Actor, SYSTEM_ID, DndCustomNpcSheet, {
    types: ["mount"],
    makeDefault: true,
    width: 726,
    label: "DND_CUSTOM.SheetLabels.Mount"
  });

  DocumentSheetConfig.registerSheet(Actor, SYSTEM_ID, VehicleActorSheet, {
    types: ["vehicle"],
    makeDefault: true,
    label: "DND_CUSTOM.SheetLabels.Vehicle"
  });

  // Une fiche Handlebars dédiée par type d'Item (cf. ClaudeFiles/CONCEPTION_FONCTIONNELLE.md).
  DocumentSheetConfig.registerSheet(Item, SYSTEM_ID, WeaponItemSheet, { types: ["weapon"], makeDefault: true });
  DocumentSheetConfig.registerSheet(Item, SYSTEM_ID, ArmorItemSheet, { types: ["armor"], makeDefault: true });
  DocumentSheetConfig.registerSheet(Item, SYSTEM_ID, GearItemSheet, { types: ["gear"], makeDefault: true });
  DocumentSheetConfig.registerSheet(Item, SYSTEM_ID, FeatureItemSheet, { types: ["feature"], makeDefault: true });
  DocumentSheetConfig.registerSheet(Item, SYSTEM_ID, OriginItemSheet, { types: ["origin"], makeDefault: true });
  DocumentSheetConfig.registerSheet(Item, SYSTEM_ID, ClassItemSheet, { types: ["class", "subclass"], makeDefault: true });
  DocumentSheetConfig.registerSheet(Item, SYSTEM_ID, ToolItemSheet, { types: ["tool"], makeDefault: true });
  DocumentSheetConfig.registerSheet(Item, SYSTEM_ID, SpellItemSheet, { types: ["spell"], makeDefault: true });
  DocumentSheetConfig.registerSheet(Item, SYSTEM_ID, LanguageItemSheet, { types: ["language"], makeDefault: true });

  registerHandlebarsHelpers();

  // En-tête d'onglet Capacités/Sorts spécialisé par classe (cf. actor-sheet.js >
  // context.classTabPartial, templates/actor/tab-abilities.hbs) : ce fichier n'est jamais une
  // PART (cf. static PARTS ci-dessus) donc jamais chargé automatiquement par
  // HandlebarsApplicationMixin — il faut le précharger explicitement pour que
  // {{> (lookup this "classTabPartial")}} le trouve dès le premier rendu.
  await foundry.applications.handlebars.loadTemplates([
    `systems/${SYSTEM_ID}/templates/actor/abilities/class-flavor.hbs`
  ]);

  // Données de jeu externalisées en JSON (cf. convention "pas en dur dans le JS").
  game.dndCustomAi = {
    origins: await loadOrigins(),
    spellSlotTables: await loadSpellSlotTables(),
    openAwardXpDialog,
    importSystemContent,
    resyncControlledToken
  };
});

// Journal de référence (MJ) récapitulant les différences entre Origines, Guide du Joueur, Guide
// du MJ (visible du MJ uniquement, cf. gm-guide-journal.js), Macro monde "Attribuer de l'XP"
// (cf. scripts/helpers/xp.js) : créés une seule fois, au premier chargement du monde. Le
// contenu de référence (classes, origines, sorts, capacités de
// classe, armes/armures/objets/outils, cf. content-import.js) est importé automatiquement à
// chaque chargement du monde ci-dessous — dédoublonné par nom, donc sans risque même si déjà
// importé. ensureContentImportMacro reste créée en secours (re-déclenchement manuel possible),
// mais n'est plus l'unique moyen de peupler les compendiums Classes/Origines/Sorts/Capacités.
Hooks.once("ready", async () => {
  await ensureOriginsJournal();
  await ensurePlayerGuideJournal();
  await ensureGmGuideJournal();
  await ensureAwardXpMacro();
  await ensureContentImportMacro();
  await ensureTokenResyncMacro();
  await importSystemContent({ notifyIfEmpty: false });
  await ensureWildSurgeTable("barbarian");
  await ensureCharacterTokensLinked();
  await ensureTokenDisplayDefaults();
});

/** Migration ponctuelle (monde déjà en cours, cf. hook preCreateActor plus bas pour les
 *  nouveaux personnages) : relie le token au personnage joueur là où ce n'est pas déjà le cas
 *  (`prototypeToken.actorLink`) — retour de test, désynchronisation PV constatée entre un
 *  token et sa fiche. Un token déjà placé sur une scène et actuellement désynchronisé (PV
 *  différents de ceux de la fiche) n'est PAS relié automatiquement ici : la valeur "correcte"
 *  entre les deux n'est pas déterminable à coup sûr, mieux vaut laisser le MJ trancher à la
 *  main plutôt que d'écraser silencieusement l'une des deux en pleine partie. Seuls les
 *  tokens déjà synchronisés (donc sans risque) sont reliés directement. */
async function ensureCharacterTokensLinked() {
  if (!game.user.isGM) return;

  const characterUpdates = game.actors
    .filter((actor) => actor.type === "character" && !actor.prototypeToken.actorLink)
    .map((actor) => ({ _id: actor.id, "prototypeToken.actorLink": true }));
  if (characterUpdates.length) await Actor.updateDocuments(characterUpdates);

  for (const scene of game.scenes) {
    const tokenUpdates = scene.tokens
      .filter((token) => {
        if (token.actorLink || token.actor?.type !== "character") return false;
        // `token.actor` (synthétique, delta appliqué) vs l'Actor maître (game.actors.get,
        // jamais affecté par le delta d'un token précis) : ne relie que si les deux
        // s'accordent déjà sur les PV actuels, seul cas sans risque de perte de donnée.
        const masterActor = game.actors.get(token.actorId);
        return masterActor && token.actor.system.attributes.hp.value === masterActor.system.attributes.hp.value;
      })
      .map((token) => ({ _id: token.id, actorLink: true }));
    if (tokenUpdates.length) await scene.updateEmbeddedDocuments("Token", tokenUpdates);
  }
}

/** Migration ponctuelle (monde déjà en cours, cf. hook preCreateActor plus haut pour les
 *  nouveaux Actors) : même geste que ensureCharacterTokensLinked mais pour l'affichage
 *  nom/PV — sans risque de perte de donnée ici (contrairement à actorLink, changer le mode
 *  d'affichage n'écrase aucune valeur de jeu), donc appliqué à tous les Actors et tokens déjà
 *  placés, pas seulement les personnages joueurs. */
async function ensureTokenDisplayDefaults() {
  if (!game.user.isGM) return;

  const misconfigured = (doc) =>
    doc.displayName !== CONST.TOKEN_DISPLAY_MODES.ALWAYS || doc.displayBars !== CONST.TOKEN_DISPLAY_MODES.ALWAYS;

  const actorUpdates = game.actors
    .filter((actor) => misconfigured(actor.prototypeToken))
    .map((actor) => ({
      _id: actor.id,
      "prototypeToken.displayName": CONST.TOKEN_DISPLAY_MODES.ALWAYS,
      "prototypeToken.displayBars": CONST.TOKEN_DISPLAY_MODES.ALWAYS
    }));
  if (actorUpdates.length) await Actor.updateDocuments(actorUpdates);

  for (const scene of game.scenes) {
    const tokenUpdates = scene.tokens
      .filter(misconfigured)
      .map((token) => ({
        _id: token.id,
        displayName: CONST.TOKEN_DISPLAY_MODES.ALWAYS,
        displayBars: CONST.TOKEN_DISPLAY_MODES.ALWAYS
      }));
    if (tokenUpdates.length) await scene.updateEmbeddedDocuments("Token", tokenUpdates);
  }
}

// Écoute du canal socket (cf. requestActorUpdate) : un joueur sans permission de modification
// sur l'Actor ciblé (PNJ non possédé, le cas courant) délègue sa mise à jour au MJ actif, seul
// habilité à l'appliquer — même motif game.users.activeGM que les hooks updateActor plus bas,
// pour qu'un seul des MJ éventuellement connectés traite chaque requête.
Hooks.once("ready", () => {
  game.socket.on(SOCKET_EVENT, async ({ uuid, updates } = {}) => {
    if (game.users.activeGM?.id !== game.user.id) return;
    const doc = await fromUuid(uuid);
    if (doc) await doc.update(updates);
  });
});

/** Applique `updates` à `actor` : directement si le client a la permission, sinon relayée au MJ
 *  actif via socket (cf. écoute ci-dessus) — nécessaire pour un PNJ dont un joueur n'est pas
 *  propriétaire (cas courant : dégâts appliqués à un monstre ciblé, cf.
 *  applyDamageToTargets plus bas), sans quoi Actor#update lève une erreur de permission
 *  ("User lacks permission...") côté joueur au lieu d'échouer silencieusement comme espéré. */
async function requestActorUpdate(actor, updates, options = {}) {
  if (actor.isOwner) {
    await actor.update(updates, options);
    return;
  }
  if (!game.users.activeGM) {
    ui.notifications.warn(game.i18n.localize("DND_CUSTOM.Chat.NoGmOnline"));
    return;
  }
  // `options` (ex. dndCustomDamageApply, cf. preUpdateActor plus bas) n'a de sens que pour un
  // update local direct : relayé au MJ actif, c'est SON client qui appelle doc.update(), déjà
  // hors du filtre non-MJ de preUpdateActor (`game.users.get(userId)?.isGM`) — rien à transmettre.
  game.socket.emit(SOCKET_EVENT, { uuid: actor.uuid, updates });
}

// Champs de "build" du personnage (caractéristiques, maîtrises, classe/origine/niveau) :
// réservés au MJ. Filet de sécurité côté données, en complément du "disabled" côté UI
// (cf. templates/actor/character-sheet.hbs et tab-stats.hbs) — empêche toute modification
// qui ne passerait pas par le formulaire standard (macro, console).
Hooks.on("preUpdateActor", (actor, changes, options, userId) => {
  if (actor.type !== "character") return;
  if (game.users.get(userId)?.isGM) return;
  // Exception délibérée : l'assistant de création de personnage (character-creation-
  // wizard.js) est le seul flux autorisé à laisser un joueur fixer TOUS ces champs
  // lui-même, en marquant explicitement son update via cette option — jamais via le
  // formulaire normal de la fiche (qui reste verrouillé/`disabled` côté template pour un
  // non-MJ).
  if (options.dndCustomWizard) return;

  const sys = changes.system;
  if (!sys) return;

  // Montée de niveau (#onLevelUp, actor-sheet.js) : accessible à tout propriétaire de la
  // fiche depuis 0.16.0 (retour de test — bouton jusqu'ici réservé au MJ), reconnue par
  // cette option dédiée. Seul `level` passe, jamais posée en même temps que class/origin/
  // abilities/saves/skills par ce flux.
  if (options.dndCustomLevelUp) {
    delete sys.class;
    delete sys.origin;
    delete sys.subclass;
    if (sys.abilities) {
      for (const key of Object.keys(sys.abilities)) delete sys.abilities[key].value;
    }
    if (sys.saves) {
      for (const key of Object.keys(sys.saves)) delete sys.saves[key].proficient;
    }
    if (sys.skills) {
      for (const key of Object.keys(sys.skills)) delete sys.skills[key].proficient;
    }
    return;
  }

  delete sys.class;
  delete sys.origin;
  // Choix de sous-classe (select "system.subclass", character-sheet.hbs) : accessible à
  // tout propriétaire depuis 0.16.0, mais verrouillé dès qu'une sous-classe est déjà posée
  // (retour de test — le choix doit être définitif une fois fait, le template ne rend le
  // select modifiable que jusque-là). `actor.system.subclass` reflète encore l'état AVANT
  // cet update (preUpdateActor), donc sûr à vérifier ici plutôt qu'une option dédiée.
  if (actor.system.subclass) delete sys.subclass;
  if (sys.attributes) delete sys.attributes.level;
  // Retour de test (bug majeur, sécurité) : un Joueur pouvait s'appliquer lui-même des dégâts
  // en tapant directement une valeur dans le champ PV de l'en-tête (déjà `disabled` côté
  // template pour lui désormais, cf. character-sheet.hbs) — filet de sécurité côté données ici,
  // au cas où l'update viendrait d'ailleurs qu'un vrai clic (macro, console). Seule une BAISSE
  // est bloquée : la guérison (repos, objet de soin, jet de sauvegarde de la mort réussi...)
  // reste un update légitime venant directement du client Joueur, jamais marqué par une option
  // dédiée contrairement à dndCustomWizard/dndCustomLevelUp ci-dessus. `dndCustomDamageApply`
  // (posé par applyDamageToTargets ci-dessous) est la seule exception à cette baisse bloquée :
  // dégâts appliqués via un vrai jet de dés posté en chat, bouton cliqué explicitement — couvre
  // le cas légitime d'un Joueur qui s'inflige lui-même des dégâts narratifs (poison, chute...).
  // `dndCustomHpClamp` : deuxième exception légitime, cf. hook updateActor plus bas (correctif
  // PV > max après une hausse d'Exhaustion, PAS un dégât).
  if (sys.attributes?.hp?.value !== undefined && !options.dndCustomDamageApply && !options.dndCustomHpClamp) {
    if (sys.attributes.hp.value < actor.system.attributes.hp.value) delete sys.attributes.hp.value;
  }
  if (sys.abilities) {
    for (const key of Object.keys(sys.abilities)) delete sys.abilities[key].value;
  }
  if (sys.saves) {
    for (const key of Object.keys(sys.saves)) delete sys.saves[key].proficient;
  }
  if (sys.skills) {
    for (const key of Object.keys(sys.skills)) delete sys.skills[key].proficient;
  }
});

// Une Capacité de classe (feature) n'est modifiable que par le MJ (définition figée par la
// classe, cf. world-items/features.json) — un joueur ne peut agir dessus qu'en dépensant une
// charge via le bouton dédié de l'onglet Capacités (cf. #onUseFeatureCharge, actor-sheet.js),
// jamais en éditant le formulaire de sa fiche Item (verrouillée/`disabled` côté template pour
// un non-MJ, cf. feature-sheet.hbs). Filet de sécurité côté données en complément, même
// principe que le verrou preUpdateActor ci-dessus : ne laisse passer que system.uses.value.
Hooks.on("preUpdateItem", (item, changes, options, userId) => {
  if (item.type !== "feature") return;
  if (game.users.get(userId)?.isGM) return;

  const sys = changes.system;
  if (!sys) return;

  const usesValue = sys.uses?.value;
  for (const key of Object.keys(sys)) delete sys[key];
  if (usesValue !== undefined) sys.uses = { value: usesValue };
});

// Lie le token à l'Actor par défaut pour un personnage joueur (`prototypeToken.actorLink`,
// `false` par défaut côté Foundry, quel que soit le type d'Actor) — retour de test :
// désynchronisation PV constatée entre un token et sa fiche (le token affichait 0 PV, la
// fiche encore son max), symptôme classique d'un token non lié à son Actor. Pas touché pour
// les PNJ/montures (`npc`/`mount`) : plusieurs instances indépendantes du même Actor (ex.
// plusieurs gobelins avec des PV propres) restent un usage volontaire et courant côté MJ.
Hooks.on("preCreateActor", (actor) => {
  if (actor.type !== "character") return;
  actor.updateSource({ "prototypeToken.actorLink": true });
});

// Nom et PV affichés en permanence sur les tokens, pour tout le monde, quel que soit le type
// d'Actor (retour de test : par défaut Foundry n'affiche rien, `DISPLAY_MODES.NONE`, il fallait
// survoler/sélectionner un token pour identifier qui est qui en combat). `ALWAYS` = visible sans
// interaction, y compris pour les Joueurs qui ne possèdent pas le token (barre de vie du côté
// adverse comprise — un choix volontairement permissif, cohérent avec le reste du système qui ne
// masque déjà aucune information de combat). `bar1.attribute` cible `attributes.hp` (chemin
// identique sur les 4 types d'Actor, cf. character/npc/vehicle-actor-data.js) pour que la barre
// de vie ait quelque chose à afficher dès la création, sans réglage manuel du MJ.
Hooks.on("preCreateActor", (actor) => {
  actor.updateSource({
    "prototypeToken.displayName": CONST.TOKEN_DISPLAY_MODES.ALWAYS,
    "prototypeToken.displayBars": CONST.TOKEN_DISPLAY_MODES.ALWAYS,
    "prototypeToken.bar1.attribute": "attributes.hp"
  });
});

// Best-effort : empêche le dialogue natif "Créer un acteur" d'ouvrir la fiche de personnage
// juste après la création (`options.renderSheet`, posé par Document#createDialog) quand
// l'assistant va de toute façon prendre le relais ci-dessous. Gardé, mais ne plus compter
// dessus comme seule protection : retour de test répété — insuffisant à lui seul selon la
// version de Foundry (la fiche flashait quand même par-dessus l'assistant). La vraie protection
// est désormais `DndCustomActorSheet#render` (actor-sheet.js), qui refuse de se rendre tant que
// l'assistant est ouvert pour le même Actor, indépendamment de ce flag.
Hooks.on("preCreateActor", (actor, data, options, userId) => {
  if (actor.type !== "character") return;
  if (game.user.id !== userId) return;
  if (actor.system.class || actor.system.origin) return;
  options.renderSheet = false;
});

// Point d'entrée découvrable de l'assistant de création (retour de test — le bouton "Créer un
// personnage" n'existait que sur une fiche Actor déjà créée, sans lien depuis le dialogue
// natif "Créer un acteur") : à la création d'un nouvel Actor "character" encore vierge
// (Origine et Classe non définies — un import/duplicata d'un personnage déjà construit ne
// déclenche donc rien), on ouvre directement l'assistant pour guider le choix Origine/Classe/
// caractéristiques. Ne s'ouvre que pour le client à l'origine de la création (garde userId),
// pas pour tous les clients connectés.
Hooks.on("createActor", (actor, options, userId) => {
  if (actor.type !== "character") return;
  if (game.user.id !== userId) return;
  if (actor.system.class || actor.system.origin) return;

  new CharacterCreationWizard(actor).render(true);
});

// Octroie les Capacités de sous-classe dès que le joueur/MJ choisit une sous-classe sur la
// fiche (select "system.subclass", cf. character-sheet.hbs) : même mécanique que la montée de
// niveau (#onLevelUp, actor-sheet.js), rejouée ici pour ne pas attendre le prochain niveau.
// grantClassContent lit actor.system.subclass directement (pas de paramètre dédié, cf.
// helpers/class-content.js) donc ce simple ré-appel suffit à octroyer ce qui devient
// disponible. Ne s'exécute que côté client à l'origine du changement (garde sur userId).
Hooks.on("updateActor", async (actor, changes, options, userId) => {
  if (game.user.id !== userId) return;
  if (actor.type !== "character") return;
  if (changes.system?.subclass === undefined) return;

  await grantClassContent(actor, actor.system.class, actor.system.attributes.level);
});

// Seuls les contenants (sacs, `capacityBonus > 0`, cf. hook ci-dessous) peuvent être équipés
// parmi les Objets/Outils — retour de test : rien n'empêchait d'équiper n'importe quel objet
// (Trousse de soins, Torche...), sans aucun effet mécanique puisque seul le bonus de charge
// des contenants est lu (cf. carryingCapacityBonus, rules.js). Ne bloque jamais la mécanique
// d'utilisation (#onUseItem/#onUseTool, actor-sheet.js), entièrement indépendante de
// `equipped`. Les Outils n'ont pas `capacityBonus` du tout (ToolData) : toujours refusés.
Hooks.on("preUpdateItem", (item, changes, options) => {
  if (!["gear", "tool"].includes(item.type)) return;
  if (changes.system?.equipped !== true) return;
  if (!(item.system.capacityBonus > 0)) delete changes.system.equipped;
});

// Un seul contenant (sac...) équipé à la fois : équiper un objet `gear` porteur d'un bonus
// de charge déséquipe automatiquement tout autre contenant déjà équipé sur le même Actor.
// Ne s'exécute que côté client à l'origine du changement (garde sur userId), pour éviter
// que chaque client connecté ne relance le même correctif en double.
Hooks.on("updateItem", async (item, changes, options, userId) => {
  if (game.user.id !== userId) return;
  if (item.type !== "gear") return;
  if (changes.system?.equipped !== true) return;
  if (!(item.system.capacityBonus > 0)) return;
  if (!(item.parent instanceof Actor)) return;

  const others = item.parent.items.contents.filter(
    (other) => other.id !== item.id && other.type === "gear" && other.system.equipped && other.system.capacityBonus > 0
  );
  if (others.length) {
    await item.parent.updateEmbeddedDocuments(
      "Item",
      others.map((other) => ({ _id: other.id, "system.equipped": false }))
    );
  }
});

// Un emplacement d'équipement (main principale, main secondaire, armure) ne peut être occupé
// que par un seul objet à la fois : contrairement aux sacs (déséquipement automatique de
// l'ancien), équiper une arme/armure dont l'emplacement est déjà pris est ici bloqué — il
// faut déséquiper l'objet en place avant, comme demandé. Une arme à deux mains occupe les
// deux mains (cf. equipmentSlots) : impossible de l'équiper si l'une des deux est prise, et
// impossible d'équiper autre chose dans l'autre main tant qu'elle est équipée.
Hooks.on("preUpdateItem", (item, changes, options, userId) => {
  if (game.user.id !== userId) return;
  if (!["weapon", "armor"].includes(item.type)) return;
  if (changes.system?.equipped !== true) return;
  if (!(item.parent instanceof Actor)) return;

  const incomingSystem = {
    slot: changes.system?.slot ?? item.system.slot,
    properties: {
      handedness: changes.system?.properties?.handedness ?? item.system.properties?.handedness,
      light: changes.system?.properties?.light ?? item.system.properties?.light
    }
  };

  // Main secondaire réservée aux armes Légères (SRD 5e, combat à deux armes) : bloque avant
  // même de vérifier une éventuelle collision d'emplacement.
  if (item.type === "weapon" && incomingSystem.slot === "offHand" && !isOffHandEligible(incomingSystem)) {
    ui.notifications.warn(game.i18n.localize("DND_CUSTOM.Equipment.OffHandRequiresLight"));
    return false;
  }

  const incomingSlots = equipmentSlots(item.type, incomingSystem).filter((slot) => slot !== "accessory");
  if (!incomingSlots.length) return;

  const conflict = item.parent.items.contents.find((other) => {
    if (other.id === item.id || !["weapon", "armor"].includes(other.type) || !other.system.equipped) return false;
    return equipmentSlots(other.type, other.system).some((slot) => incomingSlots.includes(slot));
  });

  if (conflict) {
    ui.notifications.warn(game.i18n.format("DND_CUSTOM.Equipment.SlotOccupied", { item: conflict.name }));
    return false;
  }
});

// Pré-remplit le XP rapporté (system.xpReward) selon l'indice de dangerosité, table SRD 5e
// officielle (cf. DND_CUSTOM.challengeRatingXp) : ne s'applique que si l'indice change SANS
// que le champ XP lui-même soit modifié dans le même envoi de formulaire, pour laisser le MJ
// libre de le personnaliser ensuite sans qu'un futur changement de FI ne l'écrase.
Hooks.on("preUpdateActor", (actor, changes, options, userId) => {
  if (!["npc", "mount"].includes(actor.type)) return;
  const newChallengeRating = changes.system?.challengeRating;
  if (newChallengeRating === undefined || changes.system?.xpReward !== undefined) return;

  const xp = DND_CUSTOM.challengeRatingXp[newChallengeRating];
  if (xp !== undefined) changes.system.xpReward = xp;
});

// Mémorise les PV avant modification (cf. hooks updateActor ci-dessous, mort/agonie pour un
// personnage et distribution d'XP pour un PNJ) : preUpdateActor est le seul moment où `actor`
// reflète encore l'état AVANT l'update.
Hooks.on("preUpdateActor", (actor, changes, options) => {
  if (changes.system?.attributes?.hp?.value === undefined) return;
  options.dndCustomOldHp = actor.system.attributes.hp.value;
});

// Mort et agonie, SRD 5e : tomber à 0 PV rend Inconscient et remet à zéro les jets de
// sauvegarde de la mort ; subir des dégâts en étant déjà à 0 PV compte comme un échec
// automatique (3 échecs = mort) ; repasser au-dessus de 0 PV retire Inconscient et
// réinitialise les compteurs. Ne s'exécute que côté client à l'origine du changement.
Hooks.on("updateActor", async (actor, changes, options, userId) => {
  if (actor.type !== "character") return;
  if (game.user.id !== userId) return;
  const oldHp = options.dndCustomOldHp;
  if (oldHp === undefined) return;
  const newHp = actor.system.attributes.hp.value;

  if (newHp === 0 && oldHp > 0) {
    await actor.update({ "system.attributes.death.successes": 0, "system.attributes.death.failures": 0 });
    if (!actor.statuses.has("unconscious")) await actor.toggleStatusEffect("unconscious", { active: true });
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: game.i18n.format("DND_CUSTOM.Chat.FallsUnconscious", { name: actor.name })
    });
  } else if (newHp === 0 && oldHp === 0) {
    const death = actor.system.attributes.death;
    if (death.failures >= 3 || death.successes >= 3) return; // déjà stabilisé ou mort, rien à faire
    const failures = Math.min(3, death.failures + 1);
    await actor.update({ "system.attributes.death.failures": failures });
    if (failures >= 3) await declareDeath(actor);
  } else if (newHp > 0 && oldHp === 0) {
    await actor.update({ "system.attributes.death.successes": 0, "system.attributes.death.failures": 0 });
    if (actor.statuses.has("unconscious")) await actor.toggleStatusEffect("unconscious", { active: false });
    if (actor.statuses.has("dead")) await actor.toggleStatusEffect("dead", { active: false });
  }
});

// Empêche les PV actuels de dépasser le max, quelle qu'en soit la cause (saisie manuelle
// directe, mais aussi toute variation du max lui-même : caractéristique, niveau, Exhaustion,
// création de personnage) : après chaque update, si le max déjà recalculé par
// prepareDerivedData est désormais inférieur aux PV actuels, un update de correction les
// ramène au max. Même principe pour le pool de sorts par repos (system.spells.uses) — retour
// de test, les deux pouvaient dépasser leur max. Seul le client à l'origine du changement
// corrige (garde userId), pour ne pas déclencher la même correction depuis chaque client
// connecté.
Hooks.on("updateActor", async (actor, changes, options, userId) => {
  if (game.user.id !== userId) return;
  if (!["character", "npc", "mount"].includes(actor.type)) return;

  const updates = {};
  const hp = actor.system.attributes?.hp;
  if (hp && hp.value > hp.max) updates["system.attributes.hp.value"] = hp.max;

  if (actor.type === "character") {
    const uses = actor.system.spells?.uses;
    if (uses && uses.value > uses.max) updates["system.spells.uses.value"] = uses.max;
  }

  // `dndCustomHpClamp` : ce correctif peut faire BAISSER system.attributes.hp.value (ex. un
  // Joueur augmente lui-même son Exhaustion, cf. exhaustionIncrease/tab-stats.hbs, ce qui réduit
  // son PV max sous ses PV actuels) — à distinguer explicitement d'un vrai dégât pour ne pas se
  // faire bloquer par le filet de sécurité anti-self-dégâts de preUpdateActor ci-dessus.
  if (Object.keys(updates).length) await actor.update(updates, { dndCustomHpClamp: true });
});

// Mort d'un PNJ, SRD 5e simplifié (contrairement à un personnage : pas d'agonie ni de jet de
// sauvegarde de la mort pour un PNJ — 0 PV = mort directe) : statut "Mort" (cf. declareDeath,
// death.js), Combattant marqué "vaincu" dans le Combat Tracker s'il participe au combat en
// cours, puis distribution d'XP automatique (cf. openAwardXpDialog, xp.js), montant pré-rempli
// avec system.xpReward, plutôt que d'attendre que le MJ clique le bouton dédié de la fiche PNJ.
// Se déclenche quel que soit le client à l'origine du changement (dégâts appliqués par un
// joueur via le bouton du chat, ou modification directe des PV par le MJ) : seul le MJ actif
// (game.users.activeGM, motif standard Foundry) réagit, pour n'agir qu'une fois même si
// plusieurs MJ sont connectés.
Hooks.on("updateActor", async (actor, changes, options) => {
  if (actor.type !== "npc") return;
  if (game.users.activeGM?.id !== game.user.id) return;
  const oldHp = options.dndCustomOldHp;
  if (oldHp === undefined || oldHp === 0) return;
  if (actor.system.attributes.hp.value !== 0) return;

  await declareDeath(actor);

  const combatant = game.combat?.combatants.find((c) => c.actor?.uuid === actor.uuid);
  if (combatant && !combatant.defeated) await combatant.update({ defeated: true });

  if (actor.system.xpReward) openAwardXpDialog({ defaultAmount: actor.system.xpReward });
});

// Pas de symétrique automatique ici (contrairement au personnage ci-dessus) : un PNJ à 0 PV
// est mort définitivement par défaut, même si un sort ou un objet de soin le ramène ensuite
// au-dessus de 0 PV — un soin qui s'applique à un PNJ n'est de toute façon pas garanti de le
// ramener à la vie (retour de test/décision assumée). Le MJ reste seul juge : pour annuler la
// mort d'un PNJ, il retire manuellement le statut "Mort" (menu des états du token) et le
// marqueur "vaincu" (clic droit sur le Combattant dans le Combat Tracker).

// Régénère la réaction du personnage dont c'est désormais le tour, SRD 5e ("vous récupérez
// votre réaction au début de votre tour") — pas un reset global par round, pour rester fidèle à
// la règle. Ne réagit qu'à un changement effectif de tour/round (`turn`/`round` dans `changes`,
// pas une simple édition du Combat comme l'ajout d'un Combattant), même garde MJ actif que la
// mort de PNJ ci-dessus pour n'agir qu'une fois même à plusieurs MJ connectés.
Hooks.on("updateCombat", async (combat, changes) => {
  if (!("turn" in changes) && !("round" in changes)) return;
  if (game.users.activeGM?.id !== game.user.id) return;

  const actor = combat.combatant?.actor;
  if (actor?.type === "character" && !actor.system.combat.reactionAvailable) {
    await actor.update({ "system.combat.reactionAvailable": true });
  }

  // Décompte de la durée de Rage (cf. RAGE_DURATION_ROUNDS ci-dessus), round par round, pour
  // tout Combattant de CE combat en Rage avec un suivi actif (rageRoundsRemaining > 0, posé par
  // le hook createActiveEffect plus bas). `rageLastRound` (plutôt que `combat.previous?.round`,
  // abandonné : Foundry redéclenche "updateCombat" avec `round` dans les changements PLUSIEURS
  // FOIS lors du démarrage d'un combat, sans que sa valeur n'ait réellement progressé entre deux
  // de ces déclenchements — `combat.previous` s'est révélé peu fiable pour distinguer une
  // vraie avancée d'un redéclenchement sans effet, constaté en pratique lors des tests E2E)
  // rend le décompte idempotent : seul un `combat.round` strictement supérieur au dernier round
  // traité pour CET Actor fait avancer le compteur, quel que soit le nombre de déclenchements.
  if (!("round" in changes)) return;
  for (const combatant of combat.combatants) {
    const ragingActor = combatant.actor;
    if (ragingActor?.type !== "character" || !ragingActor.statuses.has("raging")) continue;
    const remaining = ragingActor.system.combat.rageRoundsRemaining;
    if (!remaining) continue;
    const elapsedRounds = combat.round - ragingActor.system.combat.rageLastRound;
    if (elapsedRounds <= 0) continue;

    if (remaining <= elapsedRounds) {
      await ragingActor.toggleStatusEffect("raging", { active: false });
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: ragingActor }),
        content: game.i18n.format("DND_CUSTOM.Chat.RageEnded", { name: ragingActor.name })
      });
    } else {
      await ragingActor.update({
        "system.combat.rageRoundsRemaining": remaining - elapsedRounds,
        "system.combat.rageLastRound": combat.round
      });
    }
  }
});

// Amorce le décompte de durée de Rage (cf. RAGE_DURATION_ROUNDS) dès que l'état "raging" est
// activé (Actor#toggleStatusEffect crée une ActiveEffect portant ce statut) ET qu'un combat est
// déjà démarré (`game.combat.round` > 0, cf. `Combat#round` reste à 0 avant "Démarrer le combat").
// Hors combat : rageRoundsRemaining reste à 0 (valeur par défaut du schéma), aucun suivi — la
// Rage reste alors purement manuelle, comme avant cette fonctionnalité.
Hooks.on("createActiveEffect", async (effect) => {
  const actor = effect.parent;
  if (actor?.type !== "character" || !effect.statuses?.has("raging")) return;
  if (game.users.activeGM?.id !== game.user.id) return;

  // Voie de la Magie sauvage (Barbare, cf. world-items/subclasses.json > "wildMagic") :
  // Surtenance sauvage tirée à CHAQUE activation de Rage, combat ou pas — contrairement au
  // décompte de durée ci-dessous, volontairement pas conditionné à game.combat.round.
  if (actor.system.subclass === "wildMagic") await rollWildSurge(actor, "barbarian");

  if (!game.combat?.round) return;

  await actor.update({
    "system.combat.rageRoundsRemaining": RAGE_DURATION_ROUNDS,
    "system.combat.rageLastRound": game.combat.round
  });
});

// Symétrique de la création ci-dessus : remet le compteur à zéro quand "raging" est retiré
// (bascule manuelle du joueur, ou fin automatique par le hook updateCombat ci-dessus) — pur
// nettoyage, `rageRoundsRemaining`/`rageLastRound` n'ont de sens que tant que l'état est actif.
Hooks.on("deleteActiveEffect", async (effect) => {
  const actor = effect.parent;
  if (actor?.type !== "character" || !effect.statuses?.has("raging")) return;
  if (game.users.activeGM?.id !== game.user.id) return;
  if (!actor.system.combat.rageRoundsRemaining) return;

  await actor.update({ "system.combat.rageRoundsRemaining": 0, "system.combat.rageLastRound": 0 });
});

// Filet de sécurité : ne laisse pas un personnage "réaction bloquée" une fois le combat terminé
// (ex. combat clos sans que ce soit revenu à son tour). Régénère la réaction de tous les
// personnages ayant participé, même garde MJ actif que ci-dessus.
Hooks.on("deleteCombat", async (combat) => {
  if (game.users.activeGM?.id !== game.user.id) return;

  const updates = combat.combatants
    .map((combatant) => combatant.actor)
    .filter((actor) => actor?.type === "character" && !actor.system.combat.reactionAvailable)
    .map((actor) => ({ _id: actor.id, "system.combat.reactionAvailable": true }));
  if (updates.length) await Actor.updateDocuments(updates);
});


// Ajoute un bouton "Appliquer les dégâts" sur toute carte de chat de jet de dégâts (cf.
// rollDamage dans rolls.js) : applique le total du jet aux tokens actuellement ciblés par le
// client qui clique (game.user.targets), PV temporaires absorbés en premier (SRD 5e).
// Restreint à l'auteur du jet (ou au MJ, toujours habilité) — retour de test : n'importe quel
// joueur pouvait cliquer sur le bouton d'un autre. Un joueur ciblant un PNJ qu'il ne possède
// pas (cas courant) n'a de toute façon pas la permission de le modifier lui-même —
// requestActorUpdate relaie alors la mise à jour au MJ actif via socket plutôt que de laisser
// Actor#update lever une erreur de permission. Marqué "déjà appliqué" (flag persistant sur le
// message) après un premier clic, pour empêcher toute application répétée du même jet — retour
// de test, le bouton restait cliquable indéfiniment.
Hooks.on("renderChatMessageHTML", (message, html) => {
  if (!message.getFlag(SYSTEM_ID, "damageRoll")) return;
  const amount = message.rolls?.[0]?.total;
  if (!Number.isFinite(amount)) return;

  const button = document.createElement("button");
  button.type = "button";
  button.className = "dnd-apply-damage-btn";
  button.textContent = game.i18n.format("DND_CUSTOM.Chat.ApplyDamage", { amount });

  if (message.getFlag(SYSTEM_ID, "damageApplied")) {
    button.disabled = true;
    button.title = game.i18n.localize("DND_CUSTOM.Chat.DamageAlreadyApplied");
  } else if (message.author?.id !== game.user.id && !game.user.isGM) {
    button.disabled = true;
    button.title = game.i18n.localize("DND_CUSTOM.Chat.ApplyDamageNotAuthor");
  } else {
    button.addEventListener("click", async () => {
      button.disabled = true;
      await applyDamageToTargets(amount, message.speaker?.actor);
      await message.setFlag(SYSTEM_ID, "damageApplied", true);
    });
  }
  html.querySelector(".message-content")?.appendChild(button);
});

/** `sourceActorId` : Actor à l'origine du jet de dégâts (cf. `message.speaker.actor`, ChatMessage
 *  natif Foundry) — sert uniquement à bloquer le PvP ci-dessous, jamais requis pour appliquer
 *  des dégâts à un PNJ/une monture. */
async function applyDamageToTargets(amount, sourceActorId) {
  const targets = Array.from(game.user.targets);
  if (!targets.length) {
    ui.notifications.warn(game.i18n.localize("DND_CUSTOM.Chat.NoTarget"));
    return;
  }

  const sourceActor = sourceActorId ? game.actors.get(sourceActorId) : null;

  for (const token of targets) {
    const actor = token.actor;
    const hp = actor?.system.attributes?.hp;
    if (!hp) continue;

    // PvP bloqué (retour de test) : un personnage joueur ne peut pas infliger de dégâts à un
    // autre personnage joueur (PNJ/monture non concernés).
    if (sourceActor?.type === "character" && actor.type === "character" && actor.id !== sourceActor.id) {
      ui.notifications.warn(
        game.i18n.format("DND_CUSTOM.Chat.PvpBlocked", { attacker: sourceActor.name, target: actor.name })
      );
      continue;
    }

    // Auto-dégâts (retour de test, ANOMALIES_ACTIVES.md) : un Joueur ne peut plus s'appliquer de
    // dégâts à lui-même en se ciblant lui-même — seul le MJ le peut désormais (poison, chute,
    // piège... déclenchés à sa discrétion), même bouton "Appliquer les dégâts" pour les deux,
    // seule la permission de cliquer change selon qui est connecté.
    if (sourceActor?.type === "character" && actor.type === "character" && actor.id === sourceActor.id && !game.user.isGM) {
      ui.notifications.warn(game.i18n.format("DND_CUSTOM.Chat.SelfDamageBlocked", { name: actor.name }));
      continue;
    }

    let remaining = amount;
    const updates = {};
    const temp = hp.temp ?? 0;
    if (temp > 0) {
      const absorbed = Math.min(temp, remaining);
      updates["system.attributes.hp.temp"] = temp - absorbed;
      remaining -= absorbed;
    }
    if (remaining > 0) updates["system.attributes.hp.value"] = Math.max(0, hp.value - remaining);

    // dndCustomDamageApply : seul flux autorisé à faire BAISSER system.attributes.hp.value
    // depuis un client non-MJ (cf. preUpdateActor plus bas) — un jet de dégâts réel a déjà dû
    // être posté en chat et un bouton cliqué explicitement (ex. dégâts d'un PNJ contre le
    // personnage du Joueur, source non "character" donc jamais concernée par le blocage PvP/
    // auto-dégâts ci-dessus), tout en fermant le vrai trou de sécurité signalé par un testeur :
    // taper une valeur arbitraire directement dans le champ PV de l'en-tête (character-sheet.hbs,
    // désormais `disabled` côté Joueur).
    if (Object.keys(updates).length) await requestActorUpdate(actor, updates, { dndCustomDamageApply: true });
    if (amount > 0 && actor.type === "character" && actor.system.spells.concentratingOn) {
      await checkConcentration(actor, amount);
    }
  }
}

// Ajoute un bouton "Appliquer le soin" sur toute carte de chat de jet de soin de sort (cf.
// rollHeal dans rolls.js) : applique le total du jet aux tokens actuellement ciblés par le
// client qui clique (game.user.targets) — même mécanique que "Appliquer les dégâts" ci-dessus
// (auteur/MJ uniquement, marqué "déjà appliqué" après un premier clic), en PV positifs plutôt
// que négatifs. Pas de blocage PvP (soigner un autre Joueur est toujours légitime) ni
// d'absorption de PV temporaires (SRD 5e : les PV temporaires n'interagissent qu'avec les
// dégâts, jamais avec les soins).
Hooks.on("renderChatMessageHTML", (message, html) => {
  if (!message.getFlag(SYSTEM_ID, "healRoll")) return;
  const amount = message.rolls?.[0]?.total;
  if (!Number.isFinite(amount)) return;

  const button = document.createElement("button");
  button.type = "button";
  button.className = "dnd-apply-heal-btn";
  button.textContent = game.i18n.format("DND_CUSTOM.Chat.ApplyHeal", { amount });

  if (message.getFlag(SYSTEM_ID, "healApplied")) {
    button.disabled = true;
    button.title = game.i18n.localize("DND_CUSTOM.Chat.HealAlreadyApplied");
  } else if (message.author?.id !== game.user.id && !game.user.isGM) {
    button.disabled = true;
    button.title = game.i18n.localize("DND_CUSTOM.Chat.ApplyDamageNotAuthor");
  } else {
    button.addEventListener("click", async () => {
      button.disabled = true;
      await applyHealToTargets(amount);
      await message.setFlag(SYSTEM_ID, "healApplied", true);
    });
  }
  html.querySelector(".message-content")?.appendChild(button);
});

// Effet visuel sur les coups/échecs critiques (cf. flags criticalHit/criticalFumble posés par
// rollCheck/rollDamage, rolls.js) : retour de test (lot 3, point 8) — le libellé texte déjà
// présent dans le flavor ("Coup critique !"/"Échec critique !") ne suffisait pas, ajoute une
// bordure/halo + icône sur la carte de jet (`.dice-roll`) elle-même. Styles définis dans
// dnd-custom-ai.css HORS du bloc `.dnd-custom-ai` (les messages de chat vivent dans la barre
// latérale, jamais imbriqués dans la fiche de personnage/PNJ) : jamais la couleur seule pour
// distinguer les deux cas (icône différente), conformément aux règles RGAA/WCAG.
Hooks.on("renderChatMessageHTML", (message, html) => {
  const isCriticalHit = message.getFlag(SYSTEM_ID, "criticalHit");
  const isCriticalFumble = message.getFlag(SYSTEM_ID, "criticalFumble");
  if (!isCriticalHit && !isCriticalFumble) return;

  const diceRoll = html.querySelector(".dice-roll");
  if (!diceRoll) return;
  diceRoll.classList.add(isCriticalHit ? "dnd-critical-hit" : "dnd-critical-fumble");

  const icon = document.createElement("i");
  icon.className = isCriticalHit ? "fa-solid fa-burst dnd-critical-icon" : "fa-solid fa-skull-crossbones dnd-critical-icon";
  icon.setAttribute("aria-hidden", "true");
  html.querySelector(".dice-total")?.prepend(icon);
});

async function applyHealToTargets(amount) {
  const targets = Array.from(game.user.targets);
  if (!targets.length) {
    ui.notifications.warn(game.i18n.localize("DND_CUSTOM.Chat.NoTarget"));
    return;
  }

  for (const token of targets) {
    const actor = token.actor;
    const hp = actor?.system.attributes?.hp;
    if (!hp) continue;
    await requestActorUpdate(actor, { "system.attributes.hp.value": Math.min(hp.value + amount, hp.max) });
  }
}

/** Jet de sauvegarde de Constitution pour maintenir la concentration, SRD 5e : DD = 10 ou
 *  la moitié des dégâts subis (arrondi à l'inférieur), le plus élevé des deux. Échec = perte
 *  immédiate de la concentration en cours. Automatique (pas de bouton) : la DD ne dépend que
 *  des dégâts déjà connus au moment de l'application, pas d'un choix du joueur. */
async function checkConcentration(actor, damageAmount) {
  const spellName = actor.system.spells.concentratingOn;
  const dc = Math.max(10, Math.floor(damageAmount / 2));
  const conMod = abilityModifier(actor.system.abilities.con.total);
  const profBonus = actor.system.saves.con.proficient ? proficiencyBonus(actor.system.attributes.level) : 0;

  const roll = new Roll(`1d20${formatModifier(conMod + profBonus)}`);
  await roll.evaluate();
  const success = roll.total >= dc;

  if (!success) await requestActorUpdate(actor, { "system.spells.concentratingOn": "" });

  await roll.toMessage({
    speaker: ChatMessage.getSpeaker({ actor }),
    flavor: game.i18n.format(success ? "DND_CUSTOM.Chat.ConcentrationSuccess" : "DND_CUSTOM.Chat.ConcentrationFailed", {
      name: actor.name,
      spell: spellName,
      dc
    })
  });
}

async function loadOrigins() {
  const response = await fetch(`systems/${SYSTEM_ID}/scripts/data/origins.json`);
  return response.json();
}

async function loadSpellSlotTables() {
  const response = await fetch(`systems/${SYSTEM_ID}/scripts/data/spell-slots.json`);
  return response.json();
}
