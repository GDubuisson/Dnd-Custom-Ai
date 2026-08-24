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
import { ensureBeastCompanionRequestListener } from "./helpers/companion.js";
import { registerOpportunityAttackHooks } from "./helpers/opportunity-attack.js";
import { declareDeath } from "./helpers/death.js";
import { grantClassContent } from "./helpers/class-content.js";
import { registerHandlebarsHelpers } from "./helpers/handlebars-helpers.js";
import { isImmuneToCondition, suspendExistingImmunizedConditions } from "./helpers/condition-immunity.js";
import { tokenCenter, distanceBetweenPoints } from "./helpers/tactical-distance.js";
import {
  equipmentSlots,
  isOffHandEligible,
  abilityModifier,
  proficiencyBonus,
  formatModifier,
  SPELL_LEVELS,
  hasFeature
} from "./helpers/rules.js";
import { DND_CUSTOM } from "./helpers/config.js";
import { registerActorUpdateRelay, requestActorUpdate } from "./helpers/actor-relay.js";

const SYSTEM_ID = "dnd-custom-ai";

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
  // Formes de Forme sauvage (Druide, chantier "Forme sauvage", 2026-08-23) : même principe que
  // "mount" ci-dessus — même NpcData/DndCustomNpcSheet réutilisés tels quels, seul le type
  // d'Actor et le libellé de fiche diffèrent. Liée au personnage via
  // system.combat.wildShapeActorId (character-data.js) ; sa propre réserve de PV sert de 2e
  // réserve de PV pendant la transformation.
  CONFIG.Actor.dataModels.wildShapeForm = NpcData;
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

  DocumentSheetConfig.registerSheet(Actor, SYSTEM_ID, DndCustomNpcSheet, {
    types: ["wildShapeForm"],
    makeDefault: true,
    width: 726,
    label: "DND_CUSTOM.SheetLabels.WildShapeForm"
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
  await ensureWildSurgeTable("sorcerer");
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

// Écoute du canal socket de relais d'update (cf. requestActorUpdate, helpers/actor-relay.js) et
// des autres canaux dédiés — un seul enregistrement, au ready.
Hooks.once("ready", () => {
  registerActorUpdateRelay();
  ensureBeastCompanionRequestListener();
  registerOpportunityAttackHooks();
});

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
  if (!["npc", "mount", "wildShapeForm"].includes(actor.type)) return;
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
// ramène au max. Même principe pour chaque palier d'emplacement de sort (system.spells.slots) —
// retour de test, les deux pouvaient dépasser leur max (ex. changement de classe qui réduit le
// max d'un palier déjà entamé). Seul le client à l'origine du changement corrige (garde
// userId), pour ne pas déclencher la même correction depuis chaque client connecté.
Hooks.on("updateActor", async (actor, changes, options, userId) => {
  if (game.user.id !== userId) return;
  if (!["character", "npc", "mount", "wildShapeForm"].includes(actor.type)) return;

  const updates = {};
  const hp = actor.system.attributes?.hp;
  if (hp && hp.value > hp.max) updates["system.attributes.hp.value"] = hp.max;

  if (actor.type === "character") {
    const slots = actor.system.spells?.slots;
    for (const level of SPELL_LEVELS) {
      const slot = slots?.[level];
      if (slot && slot.value > slot.max) updates[`system.spells.slots.${level}.value`] = slot.max;
    }
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

// Retour automatique à la forme normale quand les PV d'une Forme sauvage (chantier "Forme
// sauvage", 2026-08-23) tombent à 0, SRD 5e — les dégâts excédentaires ne sont JAMAIS reportés
// sur le personnage (contrairement à un PNJ ci-dessus, cette forme n'est jamais "morte" pour de
// bon : juste vidée, l'Actor wildShapeForm lui-même reste réutilisable). Cherche le personnage
// qui a actuellement cette forme active (system.combat.wildShapeActorId) et vide ce champ. Même
// garde MJ actif que la mort de PNJ ci-dessus, pour n'agir qu'une fois même à plusieurs MJ
// connectés.
Hooks.on("updateActor", async (actor, changes, options) => {
  if (actor.type !== "wildShapeForm") return;
  if (game.users.activeGM?.id !== game.user.id) return;
  const oldHp = options.dndCustomOldHp;
  if (oldHp === undefined || oldHp === 0) return;
  if (actor.system.attributes.hp.value !== 0) return;

  const character = game.actors.find(
    (candidate) => candidate.type === "character" && candidate.system.combat.wildShapeActorId === actor.id
  );
  if (!character) return;

  await character.update({ "system.combat.wildShapeActorId": "" });
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: character }),
    content: game.i18n.format("DND_CUSTOM.Chat.WildShapeEnded", { name: character.name, form: actor.name })
  });
});

// Régénère la réaction, l'Action, l'Action bonus et la liste "déjà attaqué ce round" du
// personnage dont c'est désormais le tour, SRD 5e ("vous récupérez votre réaction/action/action
// bonus au début de votre tour") — pas un reset global par round, pour rester fidèle à la règle.
// Ne réagit qu'à un changement effectif de tour/round (`turn`/`round` dans `changes`, pas une
// simple édition du Combat comme l'ajout d'un Combattant), même garde MJ actif que la mort de
// PNJ ci-dessus pour n'agir qu'une fois même à plusieurs MJ connectés.
Hooks.on("updateCombat", async (combat, changes) => {
  if (!("turn" in changes) && !("round" in changes)) return;
  if (game.users.activeGM?.id !== game.user.id) return;

  const actor = combat.combatant?.actor;
  if (actor?.type === "character") {
    const updates = {};
    if (!actor.system.combat.reactionAvailable) updates["system.combat.reactionAvailable"] = true;
    if (!actor.system.combat.actionAvailable) updates["system.combat.actionAvailable"] = true;
    if (!actor.system.combat.bonusActionAvailable) updates["system.combat.bonusActionAvailable"] = true;
    // Défense contre les attaques multiples (Tactiques défensives, Rôdeur Hunter — chantier "8
    // sous-classes déjà à ≥1 mécanique", 2026-08-23) : "déjà attaqué CE round" redevient vide au
    // début du round suivant, même schéma que les 3 champs ci-dessus.
    if (actor.system.combat.attackedByThisRound.size) updates["system.combat.attackedByThisRound"] = [];
    if (Object.keys(updates).length) await actor.update(updates);
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

  // Rage sans esprit (Berserker, SRD 5e — chantier "8 sous-classes déjà à ≥1 mécanique",
  // 2026-08-23) : suspend Charmé/Effrayé déjà actifs à l'instant où la Rage démarre, combat ou
  // pas — même logique que la Surtenance sauvage ci-dessus, pas conditionnée à game.combat.round.
  await suspendExistingImmunizedConditions(actor);

  if (!game.combat?.round) return;

  await actor.update({
    "system.combat.rageRoundsRemaining": RAGE_DURATION_ROUNDS,
    "system.combat.rageLastRound": game.combat.round
  });
});

// Rage sans esprit (Berserker)/Aura de dévotion (Devotion) — chantier "8 sous-classes déjà à
// ≥1 mécanique", 2026-08-23 : bloque la création d'une ActiveEffect Charmé/Effrayé sur un
// personnage actuellement immunisé (cf. isImmuneToCondition, helpers/condition-immunity.js).
// Pas de garde MJ actif ici (contrairement aux hooks réactifs ci-dessus) : même principe que le
// blocage de conflit d'emplacement d'équipement plus bas (preUpdateItem) — un hook "pre" qui
// annule la création s'évalue localement chez le client à l'origine de la tentative, jamais
// besoin de le restreindre à un seul MJ actif pour éviter un doublon.
Hooks.on("preCreateActiveEffect", (effect) => {
  const actor = effect.parent;
  if (!(actor instanceof Actor)) return;
  const conditionId = [...(effect.statuses ?? [])][0];
  if (!conditionId || !isImmuneToCondition(actor, conditionId)) return;

  ui.notifications.info(
    game.i18n.format("DND_CUSTOM.Chat.ConditionBlockedByImmunity", {
      name: actor.name,
      condition: game.i18n.localize(DND_CUSTOM.conditions.find((c) => c.id === conditionId)?.name ?? conditionId)
    })
  );
  return false;
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

// Filet de sécurité : ne laisse pas un personnage "réaction/action/action bonus bloquée" une fois
// le combat terminé (ex. combat clos sans que ce soit revenu à son tour). Régénère les quatre
// champs pour tous les personnages ayant participé, même garde MJ actif que ci-dessus.
Hooks.on("deleteCombat", async (combat) => {
  if (game.users.activeGM?.id !== game.user.id) return;

  const updates = combat.combatants
    .map((combatant) => combatant.actor)
    .filter((actor) => actor?.type === "character")
    .map((actor) => {
      const update = { _id: actor.id };
      if (!actor.system.combat.reactionAvailable) update["system.combat.reactionAvailable"] = true;
      if (!actor.system.combat.actionAvailable) update["system.combat.actionAvailable"] = true;
      if (!actor.system.combat.bonusActionAvailable) update["system.combat.bonusActionAvailable"] = true;
      if (actor.system.combat.attackedByThisRound.size) update["system.combat.attackedByThisRound"] = [];
      return update;
    })
    .filter((update) => Object.keys(update).length > 1);
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
      await applyDamageToTargets(
        amount,
        message.speaker?.actor,
        message.getFlag(SYSTEM_ID, "damageType"),
        Boolean(message.getFlag(SYSTEM_ID, "isSpellDamage")),
        message.getFlag(SYSTEM_ID, "spellName") ?? "",
        Boolean(message.getFlag(SYSTEM_ID, "isMagicalSource"))
      );
      await message.setFlag(SYSTEM_ID, "damageApplied", true);
    });
  }
  html.querySelector(".message-content")?.appendChild(button);
});

// Rage (Barbare, SRD 5e — Niveau C, 2026-08-24) + chantier "types de dégâts" (Phase 1,
// 2026-08-24) : les 3 types de dégâts physiques SRD — servent à la fois à la résistance de Rage
// ci-dessous et à la nuance "contre les attaques non magiques" du champ générique
// damageResistances/Immunities/Vulnerabilities (cf. damageTypeMultiplier plus bas).
const PHYSICAL_DAMAGE_TYPES = new Set(["bludgeoning", "piercing", "slashing"]);

// Voile des anciens (Paladin, Serment des Anciens — Niveau C, 2026-08-24) : zone de 3 m autour
// du Paladin ayant activé la bascule "ancientsVeil" (config.js), même mécanisme de portée que
// isProtectedByDevotionAura (helpers/condition-immunity.js) mais pour une résistance aux dégâts
// plutôt qu'une immunité à une condition.
const ANCIENTS_VEIL_METERS = 3;

/** Voile des anciens : `actor` (le Paladin qui a activé la bascule inclus, distance à lui-même
 *  valant toujours 0) est protégé s'il existe un personnage avec l'état "ancientsVeil" actif à
 *  3 m ou moins. Contrairement à Aura de dévotion (bascule passive liée à la possession d'une
 *  Capacité), "ancientsVeil" est une bascule manuelle temporaire — cohérent avec le reste des
 *  conditions homebrew (blessed/guided/raging...), aucun décompte de durée. */
function isProtectedByAncientsVeil(actor) {
  const actorToken = actor.getActiveTokens()[0]?.document;
  if (!actorToken) return false;
  const actorCenter = tokenCenter(actorToken);

  return game.actors.some((paladin) => {
    if (paladin.type !== "character" || !paladin.statuses.has("ancientsVeil")) return false;
    const paladinToken = paladin.getActiveTokens()[0]?.document;
    if (!paladinToken) return false;
    return distanceBetweenPoints(actorCenter, tokenCenter(paladinToken)) <= ANCIENTS_VEIL_METERS;
  });
}

/** Vrai si `actor` possède `field` ("damageResistances"/"damageImmunities"/
 *  "damageVulnerabilities", cf. damageAffinitySchema, shared-schema.js) pour `damageType`.
 *  CharacterData range ce champ sous `system.combat` (comme ses voisins draconicResistanceType/
 *  favoredEnemyType) tandis que NpcData (pas de sous-objet `combat`) le garde à la racine — testé
 *  dans cet ordre plutôt que d'imposer le même emplacement aux deux DataModel. Un PNJ/PJ sans le
 *  champ (Actor non encore préparé, cas théorique) ne plante jamais, `false` par défaut. */
function hasGenericDamageAffinity(actor, damageType, field) {
  const set = actor.system.combat?.[field] ?? actor.system[field];
  return set?.has?.(damageType) ?? false;
}

/** Multiplicateur final (0 immunité, 0.5 résistance, 1 normal, 2 vulnérabilité) des dégâts de
 *  `damageType` subis par `actor` — combine les résistances déjà câblées en dur par Capacité/
 *  état (Rage, Résilience draconique, Affinité de la tempête, Voile des anciens) et le champ
 *  générique réglable par le MJ (chantier "types de dégâts", Phase 1, 2026-08-24 —
 *  damageResistances/Immunities/Vulnerabilities, cf. damageAffinitySchema, shared-schema.js).
 *
 *  `isSpellDamage` (Voile des anciens) : contrairement aux autres cas, cette résistance ne
 *  dépend d'AUCUN `damageType` précis (le SRD résiste à "les dégâts des sorts" quel que soit
 *  leur type).
 *
 *  `isMagicalSource` (chantier "types de dégâts", Phase 1) : pour les 3 types PHYSIQUES
 *  UNIQUEMENT, une source magique (sort — toujours magique — ou arme/attaque de PNJ dont la case
 *  "Magique" est cochée) contourne le champ GÉNÉRIQUE, fidèle à la nuance SRD "contre les
 *  attaques non magiques" propre aux monstres. Les résistances déjà câblées en dur (Rage
 *  incluse) n'ONT PAS cette nuance au SRD 5e et restent donc TOUJOURS actives quelle que soit
 *  `isMagicalSource` — seul le champ générique en tient compte.
 *
 *  Immunité prioritaire sur tout le reste ; résistance ET vulnérabilité sur le MÊME type
 *  s'annulent (dégâts normaux), règle SRD 5e explicite. */
function damageTypeMultiplier(actor, damageType, { isSpellDamage = false, isMagicalSource = false } = {}) {
  const genericBypassed = Boolean(damageType && PHYSICAL_DAMAGE_TYPES.has(damageType) && isMagicalSource);

  const immune = !genericBypassed && damageType && hasGenericDamageAffinity(actor, damageType, "damageImmunities");
  if (immune) return 0;

  const resistant =
    (isSpellDamage && isProtectedByAncientsVeil(actor)) ||
    // Résilience draconique (Ensorceleur, Lignage draconique) : type choisi par le joueur, stocké
    // sur l'Actor (jamais sur un PNJ/une monture dont CharacterData n'a pas ce champ).
    Boolean(damageType && actor.system.combat?.draconicResistanceType === damageType) ||
    // Affinité de la tempête (Ensorceleur, Tempête 1, SRD 5e) : résistance passive fixe (toujours
    // active, pas un choix) aux dégâts de foudre/tonnerre.
    Boolean(
      damageType &&
        (damageType === "lightning" || damageType === "thunder") &&
        hasFeature(actor.items.contents, "Affinité de la tempête")
    ) ||
    // Rage (Barbare, SRD 5e) : résistance aux dégâts contondants/perforants/tranchants tant que
    // "raging" est actif, quel que soit le champ générique.
    Boolean(damageType && PHYSICAL_DAMAGE_TYPES.has(damageType) && actor.statuses?.has("raging")) ||
    Boolean(!genericBypassed && damageType && hasGenericDamageAffinity(actor, damageType, "damageResistances"));

  const vulnerable = !genericBypassed && damageType && hasGenericDamageAffinity(actor, damageType, "damageVulnerabilities");

  if (resistant && vulnerable) return 1;
  if (resistant) return 0.5;
  if (vulnerable) return 2;
  return 1;
}

// Prérequis Évasion/Tour de magie renforcé (Niveau C, 2026-08-24) : cf. spellSaveDamageMultiplier
// ci-dessous pour le détail des 2 exceptions posées par-dessus la règle SRD par défaut.
const EVASION_FEAT_NAME = "Évasion";
const POTENT_CANTRIP_FEAT_NAME = "Tour de magie renforcé";

/** Fraction (0, 0.5 ou 1) des dégâts d'un sort à sauvegarde réellement subie par `targetActor`,
 *  selon le résultat de SON jet (`outcome.success`), si le sort réduit normalement de moitié en
 *  cas de réussite (`outcome.halfOnSave`) — jusqu'ici jamais appliqué du tout (le bouton
 *  "Appliquer les dégâts" ignorait entièrement le résultat de la sauvegarde, cf.
 *  ClaudeFiles/MECANIQUES_A_AUTOMATISER.md > "Évasion"/"Tour de magie renforcé").
 *
 *  Règle SRD par défaut : réussite → moitié si `halfOnSave`, sinon 0 ; échec → dégâts pleins.
 *
 *  - **Évasion** (Roublard 7) : `targetActor` la possède, sauvegarde de Dextérité, `halfOnSave`
 *    vrai → réussite = AUCUN dégât (au lieu de moitié), échec = moitié (au lieu de plein).
 *  - **Tour de magie renforcé** (Magicien Évocation 6) : `sourceActor` (le lanceur) la possède,
 *    sort de niveau 0 (tour de magie), `halfOnSave` FAUX (le cas par défaut où une réussite
 *    n'inflige normalement AUCUN dégât) → réussite = moitié (au lieu d'aucun) ; échec inchangé.
 *    Les deux exceptions sont mutuellement exclusives par construction (`halfOnSave` opposé),
 *    jamais besoin d'arbitrer un conflit entre elles. */
function spellSaveDamageMultiplier(targetActor, sourceActor, outcome) {
  const { success, halfOnSave, ability, spellLevel } = outcome;
  if (ability === "dex" && halfOnSave && hasFeature(targetActor.items.contents, EVASION_FEAT_NAME)) {
    return success ? 0 : 0.5;
  }
  if (!halfOnSave && spellLevel === 0 && sourceActor && hasFeature(sourceActor.items.contents, POTENT_CANTRIP_FEAT_NAME)) {
    return success ? 0.5 : 1;
  }
  if (success) return halfOnSave ? 0.5 : 0;
  return 1;
}

async function applyDamageToTargets(
  amount,
  sourceActorId,
  damageType = "",
  isSpellDamage = false,
  spellName = "",
  isMagicalSource = false
) {
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

    // halfOnSave (chantier "prérequis Évasion/Tour de magie renforcé", Niveau C, 2026-08-24) :
    // n'agit QUE sur des dégâts de sort (`isSpellDamage`, jamais une attaque d'arme/PNJ) ET
    // seulement si le flag posé sur CETTE cible par #onCastSpell (`pendingSpellSaveOutcome`)
    // correspond au MÊME sort que ce jet de dégâts (`spellName`, cf. commentaire de rollDamage#
    // spellName, rolls.js) — sinon dégâts pleins, comportement identique à avant ce chantier, et
    // le flag n'est PAS consommé (laissé disponible pour le jet de dégâts qui lui correspond
    // vraiment, s'il arrive plus tard). Toujours consommé (unset) dès qu'utilisé, qu'il s'agisse
    // d'une réussite/d'un échec — jamais réutilisable pour un dégât ultérieur.
    const pendingSaveOutcome = isSpellDamage ? actor.getFlag(SYSTEM_ID, "pendingSpellSaveOutcome") : null;
    const matchesPendingSave = pendingSaveOutcome && pendingSaveOutcome.spellName === spellName;
    const saveMultiplier = matchesPendingSave ? spellSaveDamageMultiplier(actor, sourceActor, pendingSaveOutcome) : 1;
    if (matchesPendingSave) await actor.unsetFlag(SYSTEM_ID, "pendingSpellSaveOutcome");

    // Résistance/immunité/vulnérabilité de type (cf. damageTypeMultiplier ci-dessus) appliquée
    // APRÈS la réduction de sauvegarde ci-dessus, chacune arrondie à l'inférieur séparément —
    // cumul de réductions multiples conforme au SRD 5e (jamais une simple multiplication des
    // fractions en un seul arrondi). `isMagicalSource` : cf. WeaponData#magic (item-data.js)/
    // NpcData#attack.magic pour une attaque, toujours vrai pour un sort (rollDamage#isSpellDamage
    // déjà posé par #onRollSpellDamage).
    const typeMultiplier = damageTypeMultiplier(actor, damageType, { isSpellDamage, isMagicalSource });
    let targetAmount = saveMultiplier === 1 ? amount : Math.floor(amount * saveMultiplier);
    targetAmount = typeMultiplier === 1 ? targetAmount : Math.floor(targetAmount * typeMultiplier);

    let remaining = targetAmount;
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
    if (targetAmount > 0 && actor.type === "character" && actor.system.spells.concentratingOn) {
      await checkConcentration(actor, targetAmount);
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

// Ajoute un bouton "Appliquer la réduction" sur toute carte de chat de jet de Capacité qui
// réduit les dégâts subis (ex. Déviation de projectiles, Flamme protectrice — cf.
// FeatureData#reducesDamage, item-data.js ; #onRollFeature, actor-sheet.js) : réutilise
// directement applyHealToTargets (même effet mécanique qu'un soin, ajoute des PV à la cible
// actuellement ciblée, plafonné au max) — seul le libellé du bouton diffère pour rester clair
// en jeu, aucune nouvelle logique d'application. Fonctionne quel que soit l'ordre réel des
// dégâts/de la réaction (le MJ peut cliquer avant ou après avoir appliqué les dégâts bruts, le
// résultat net est le même).
Hooks.on("renderChatMessageHTML", (message, html) => {
  if (!message.getFlag(SYSTEM_ID, "damageReduction")) return;
  const amount = message.rolls?.[0]?.total;
  if (!Number.isFinite(amount)) return;

  const button = document.createElement("button");
  button.type = "button";
  button.className = "dnd-apply-heal-btn";
  button.textContent = game.i18n.format("DND_CUSTOM.Chat.ApplyDamageReduction", { amount });

  if (message.getFlag(SYSTEM_ID, "damageReductionApplied")) {
    button.disabled = true;
    button.title = game.i18n.localize("DND_CUSTOM.Chat.DamageReductionAlreadyApplied");
  } else if (message.author?.id !== game.user.id && !game.user.isGM) {
    button.disabled = true;
    button.title = game.i18n.localize("DND_CUSTOM.Chat.ApplyDamageNotAuthor");
  } else {
    button.addEventListener("click", async () => {
      button.disabled = true;
      await applyHealToTargets(amount);
      await message.setFlag(SYSTEM_ID, "damageReductionApplied", true);
    });
  }
  html.querySelector(".message-content")?.appendChild(button);
});

// Don "Chanceux" (SRD 5e, world-items/feats.json) : ajoute un bouton "Point de Chance" sur tout
// jet de d20 posté via rollCheck (test de caractéristique/compétence, sauvegarde, attaque — cf.
// flags luckRoll/luckFormula/luckActorId posés dans rolls.js) SI l'acteur qui a lancé possède le
// don et lui reste au moins une charge (`system.uses.value` de l'Item "Chanceux") — jamais un
// bouton grisé permanent sur chaque jet, contrairement à "Appliquer le soin"/"Appliquer les
// dégâts" ci-dessus qui, eux, s'appliquent toujours : ici, pas de charge restante = pas de
// bouton du tout, pour ne pas polluer le journal de jets d'un personnage n'ayant pas (ou plus)
// le don. Relance la MÊME formule que le jet d'origine (die + modificateur, avantage/désavantage
// compris) et garde le meilleur des deux totaux — la règle SRD laisse le joueur choisir lequel
// des deux d20 utiliser, mais dépenser un point de chance n'a jamais d'intérêt à choisir le plus
// bas : simplification sans perte réelle de choix. Poste un second message plutôt que de
// modifier le premier (Foundry ne permet pas de rejouer proprement l'affichage d'un Roll déjà
// résolu) et marque l'original `luckApplied` pour ne proposer qu'UNE relance par jet (SRD : "un
// seul point de chance peut être dépensé par jet").
Hooks.on("renderChatMessageHTML", (message, html) => {
  if (!message.getFlag(SYSTEM_ID, "luckRoll") || message.getFlag(SYSTEM_ID, "luckApplied")) return;
  // Garde-fou anti-doublon : Foundry peut re-déclencher ce hook pour un même message déjà rendu
  // (ex. la barre latérale re-rend son journal de chat) — sans ce garde, un second appel
  // ajouterait un second bouton identique au même `.message-content`.
  if (html.querySelector(".dnd-spend-luck-btn")) return;

  const actor = game.actors.get(message.getFlag(SYSTEM_ID, "luckActorId"));
  const luckyFeat = actor?.items.find((item) => item.type === "feature" && item.name === "Chanceux");
  if (!luckyFeat || luckyFeat.system.uses.value <= 0) return;
  if (!actor.isOwner && !game.user.isGM) return;

  const button = document.createElement("button");
  button.type = "button";
  button.className = "dnd-spend-luck-btn";
  button.textContent = game.i18n.format("DND_CUSTOM.Chat.SpendLuck", { remaining: luckyFeat.system.uses.value });
  button.addEventListener("click", async () => {
    button.disabled = true;
    const formula = message.getFlag(SYSTEM_ID, "luckFormula");
    const reroll = new Roll(formula);
    await reroll.evaluate();
    const originalTotal = message.rolls?.[0]?.total ?? -Infinity;
    const kept = reroll.total > originalTotal ? reroll.total : originalTotal;
    await reroll.toMessage({
      speaker: message.speaker,
      flavor: game.i18n.format("DND_CUSTOM.Chat.LuckyReroll", { name: actor.name, kept })
    });
    await luckyFeat.update({ "system.uses.value": luckyFeat.system.uses.value - 1 });
    await message.setFlag(SYSTEM_ID, "luckApplied", true);
  });
  html.querySelector(".message-content")?.appendChild(button);
});

// Capacité "Chance du Fiélon" (sous-classe Occultiste, world-items/features.json) : même famille
// que le don Chanceux ci-dessus (réutilise les mêmes flags luckRoll/luckActorId posés dans
// rolls.js, indépendant du don lui-même) mais mécanique différente — SRD : "+1d10 au résultat"
// plutôt qu'une relance complète. Poste un petit message de complément ("+1d10 = X, nouveau
// total Y") plutôt que de modifier le message d'origine (même raison que Chanceux : Foundry ne
// permet pas de rejouer proprement l'affichage d'un Roll déjà résolu). Flag dédié
// (`fiendLuckApplied`, jamais `luckApplied`) : un personnage qui posséderait les deux (don ET
// Capacité) pourrait en théorie cumuler les deux sur un même jet, chacun avec sa propre limite
// d'usage — aucune règle SRD ne l'interdit explicitement.
Hooks.on("renderChatMessageHTML", (message, html) => {
  if (!message.getFlag(SYSTEM_ID, "luckRoll") || message.getFlag(SYSTEM_ID, "fiendLuckApplied")) return;
  if (html.querySelector(".dnd-spend-luck-btn")) return;

  const actor = game.actors.get(message.getFlag(SYSTEM_ID, "luckActorId"));
  const fiendLuckFeat = actor?.items.find((item) => item.type === "feature" && item.name === "Chance du Fiélon");
  if (!fiendLuckFeat || fiendLuckFeat.system.uses.value <= 0) return;
  if (!actor.isOwner && !game.user.isGM) return;

  const button = document.createElement("button");
  button.type = "button";
  button.className = "dnd-spend-luck-btn";
  button.textContent = game.i18n.format("DND_CUSTOM.Chat.SpendFiendLuck", { remaining: fiendLuckFeat.system.uses.value });
  button.addEventListener("click", async () => {
    button.disabled = true;
    const bonus = new Roll("1d10");
    await bonus.evaluate();
    const originalTotal = message.rolls?.[0]?.total ?? 0;
    await bonus.toMessage({
      speaker: message.speaker,
      flavor: game.i18n.format("DND_CUSTOM.Chat.FiendLuckBonus", { name: actor.name, newTotal: originalTotal + bonus.total })
    });
    await fiendLuckFeat.update({ "system.uses.value": fiendLuckFeat.system.uses.value - 1 });
    await message.setFlag(SYSTEM_ID, "fiendLuckApplied", true);
  });
  html.querySelector(".message-content")?.appendChild(button);
});

// Capacité "Indomptable" (Guerrier 9, SRD 5e) : même famille que Chanceux/Chance du Fiélon
// ci-dessus (flag `luckRoll`/`luckActorId`, ignorant du nom de Capacité), mais réservé aux jets
// de SAUVEGARDE (flag `savingThrowRoll`, posé uniquement par #onRollSave, cf. rolls.js) et
// mécanique différente — SRD : relance complète, résultat obligatoirement conservé (contrairement
// à Chanceux qui garde le meilleur des deux). Ce système ne comparant déjà aucune sauvegarde à un
// DD (le MJ juge à l'œil), le bouton reste proposé sur CHAQUE jet de sauvegarde éligible, au
// joueur de décider si le résultat "ne lui convient pas" — même logique que Chanceux.
Hooks.on("renderChatMessageHTML", (message, html) => {
  if (!message.getFlag(SYSTEM_ID, "savingThrowRoll") || message.getFlag(SYSTEM_ID, "indomitableApplied")) return;
  if (html.querySelector(".dnd-spend-luck-btn")) return;

  const actor = game.actors.get(message.getFlag(SYSTEM_ID, "luckActorId"));
  const indomitableFeat = actor?.items.find((item) => item.type === "feature" && item.name === "Indomptable");
  if (!indomitableFeat || indomitableFeat.system.uses.value <= 0) return;
  if (!actor.isOwner && !game.user.isGM) return;

  const button = document.createElement("button");
  button.type = "button";
  button.className = "dnd-spend-luck-btn";
  button.textContent = game.i18n.format("DND_CUSTOM.Chat.SpendIndomitable", { remaining: indomitableFeat.system.uses.value });
  button.addEventListener("click", async () => {
    button.disabled = true;
    const formula = message.getFlag(SYSTEM_ID, "luckFormula");
    const reroll = new Roll(formula);
    await reroll.evaluate();
    await reroll.toMessage({
      speaker: message.speaker,
      flavor: game.i18n.format("DND_CUSTOM.Chat.IndomitableReroll", { name: actor.name })
    });
    await indomitableFeat.update({ "system.uses.value": indomitableFeat.system.uses.value - 1 });
    await message.setFlag(SYSTEM_ID, "indomitableApplied", true);
  });
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
