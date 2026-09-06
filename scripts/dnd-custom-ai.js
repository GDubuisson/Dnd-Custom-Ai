import { CharacterData } from "./data/character-data.js";
import { NpcData } from "./data/npc-data.js";
import { VehicleActorData } from "./data/vehicle-actor-data.js";
import { WeaponData, ArmorData, GearData, FeatureData, ToolData, SpellData, LanguageData } from "./data/item-data.js";
import { OriginData } from "./data/origin-data.js";
import { ClassData } from "./data/class-data.js";
import { DndCustomActorSheet } from "./sheets/actor-sheet.js";
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
import { ensureWildSurgeTable } from "./helpers/wild-magic-tables.js";
import { ensureBeastCompanionRequestListener } from "./helpers/companion.js";
import { registerWildShapeFormRequestListener } from "./helpers/wild-shape-form.js";
import { registerOpportunityAttackHooks } from "./helpers/opportunity-attack.js";
import { registerHandlebarsHelpers } from "./helpers/handlebars-helpers.js";
import { DND_CUSTOM } from "./helpers/config.js";
import { registerActorUpdateRelay, registerStatusEffectRelay } from "./helpers/actor-relay.js";
import { registerChatMessageHooks } from "./helpers/chat-message-hooks.js";
import { registerSecurityHooks } from "./helpers/security-hooks.js";
import { registerTokenActorHooks } from "./helpers/token-actor-hooks.js";
import { registerEquipmentHooks } from "./helpers/equipment-hooks.js";
import { registerHitPointHooks } from "./helpers/hit-point-hooks.js";
import { registerCombatEffectHooks } from "./helpers/combat-effect-hooks.js";
import { loadSystemJson } from "./helpers/system-json.js";

const SYSTEM_ID = "dnd-custom-ai";

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
  // Idem pour les partials communs aux fiches d'Item (templates/item/parts/*.hbs) : référencés
  // par `{{> "systems/dnd-custom-ai/templates/item/parts/xxx.hbs"}}` dans templates/item/*.hbs,
  // jamais des PARTS, donc à précharger explicitement sous leur chemin système complet.
  await foundry.applications.handlebars.loadTemplates([
    `systems/${SYSTEM_ID}/templates/actor/abilities/class-flavor.hbs`,
    `systems/${SYSTEM_ID}/templates/item/parts/header.hbs`,
    `systems/${SYSTEM_ID}/templates/item/parts/price.hbs`,
    `systems/${SYSTEM_ID}/templates/item/parts/description.hbs`,
    `systems/${SYSTEM_ID}/templates/item/parts/reaction-trigger.hbs`
  ]);

  // Données de jeu externalisées en JSON (cf. convention "pas en dur dans le JS").
  game.dndCustomAi = {
    origins: await loadSystemJson("scripts/data/origins.json"),
    spellSlotTables: await loadSystemJson("scripts/data/spell-slots.json"),
    // Glossaire des termes de jeu (scripts/data/glossary.json) : même source que la page
    // "Glossaire" du Guide du Joueur, réutilisée ici en infobulles sur la fiche via le helper
    // Handlebars `glossaryTip` (cf. handlebars-helpers.js). Map terme -> définition pour un
    // accès direct au rendu.
    glossary: await loadGlossary(),
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
  await ensureNpcAttacksArray();
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

/** Migration ponctuelle (monde déjà en cours) : `NpcData#attack` (profil d'attaque UNIQUE) est
 *  devenu `NpcData#attacks` (liste — chantier "mécaniques jamais modélisées" point 4/6,
 *  2026-08-25, cadré avec l'utilisateur : un vrai bloc de statistiques SRD 5e a souvent
 *  plusieurs attaques distinctes). Un Actor déjà créé sous l'ancien schéma a son ancien profil
 *  encore présent dans `actor._source.system.attack` (données brutes telles que sauvegardées,
 *  jamais retraitées par un changement de DataModel) alors que `actor.system.attacks` (données
 *  PRÉPARÉES sous le nouveau schéma) est déjà revenu à son défaut `[{}]` — le champ inconnu
 *  `attack` est silencieusement ignoré par le nettoyage de schéma, jamais migré tout seul.
 *  Convertit l'ancien profil en premier élément de la nouvelle liste, une seule fois par Actor
 *  (ne touche jamais un Actor qui a déjà un vrai profil dans `attacks`, y compris un profil créé
 *  après coup par le MJ). S'applique à tout type d'Actor utilisant `NpcData` (`npc`/`mount`/
 *  `wildShapeForm`, cf. Hooks.once("init") plus haut) — détecté par la présence même du champ
 *  `attack` dans les données brutes, jamais par le type d'Actor en dur. */
async function ensureNpcAttacksArray() {
  if (!game.user.isGM) return;

  const hasContent = (attack) => attack && (attack.name || attack.bonus || attack.damage?.dice);
  const updates = game.actors
    .filter((actor) => {
      const rawSystem = actor._source.system ?? {};
      return hasContent(rawSystem.attack) && !rawSystem.attacks?.length;
    })
    .map((actor) => ({ _id: actor.id, "system.attacks": [actor._source.system.attack] }));
  if (updates.length) await Actor.updateDocuments(updates);
}

// Écoute du canal socket de relais d'update (cf. requestActorUpdate, helpers/actor-relay.js) et
// des autres canaux dédiés — un seul enregistrement, au ready.
Hooks.once("ready", () => {
  registerActorUpdateRelay();
  registerStatusEffectRelay();
  ensureBeastCompanionRequestListener();
  registerWildShapeFormRequestListener();
  registerOpportunityAttackHooks();
});

// Filets de sécurité côté données (verrous de champs non-MJ) : cf. helpers/security-hooks.js.
registerSecurityHooks();

// Cycle de vie d'un Actor (liaison token, affichage, entrée assistant, contenu de sous-classe) :
// cf. helpers/token-actor-hooks.js.
registerTokenActorHooks();

// Règles d'équipement (contenants, collisions d'emplacement) : cf. helpers/equipment-hooks.js.
registerEquipmentHooks();

// PV / mort / agonie / XP de PNJ / retour de Forme sauvage vidée : cf. helpers/hit-point-hooks.js.
registerHitPointHooks();

// Combat + ActiveEffect (régénération d'économie d'action, durée de Rage, immunités de
// condition, fin de combat) : cf. helpers/combat-effect-hooks.js.
registerCombatEffectHooks();


// Boutons d'action sur une carte de chat (Appliquer les dégâts/le soin/la réduction, Point de
// Chance/Chance du Fiélon/Indomptable, Point d'inspiration) et style visuel des jets/critiques :
// cf. helpers/chat-message-hooks.js (extrait d'ici, chantier clean architecture) pour le détail
// de chaque hook ; helpers/damage-resolution.js pour la résolution des dégâts/soins/résistances
// qu'ils déclenchent (applyDamageToTargets/applyHealToTargets/damageTypeMultiplier).
registerChatMessageHooks();

async function loadGlossary() {
  const entries = await loadSystemJson("scripts/data/glossary.json");
  // Indexé par `key` (slug ASCII stable, ex. "ca", "pv-temporaires") : les templates passent ce
  // slug au helper `glossaryTip` sans avoir à échapper les apostrophes/parenthèses du `term`.
  return new Map(entries.map((entry) => [entry.key, entry.definition]));
}
