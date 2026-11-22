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
import { syncGmGuideJournal } from "./helpers/gm-guide-journal.js";
import { syncItemLoreJournal } from "./helpers/item-lore-journal.js";
import { syncStoneSitesJournal } from "./helpers/stone-sites-journal.js";
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

const { DocumentSheetConfig } = foundry.applications.apps;

Hooks.once("init", async () => {
  console.log(`${SYSTEM_ID} | Initialisation du système`);

  // Schéma de chaque type déclaré dans system.json fourni par son DataModel.
  CONFIG.Actor.dataModels.character = CharacterData;
  CONFIG.Actor.dataModels.npc = NpcData;
  // Montures : même modèle et fiche que les PNJ.
  CONFIG.Actor.dataModels.mount = NpcData;
  // Formes sauvages du Druide : même modèle et fiche que les PNJ.
  CONFIG.Actor.dataModels.wildShapeForm = NpcData;
  CONFIG.Actor.dataModels.vehicle = VehicleActorData;
  CONFIG.Item.dataModels.weapon = WeaponData;
  CONFIG.Item.dataModels.armor = ArmorData;
  CONFIG.Item.dataModels.gear = GearData;
  CONFIG.Item.dataModels.feature = FeatureData;
  CONFIG.Item.dataModels.tool = ToolData;
  CONFIG.Item.dataModels.spell = SpellData;
  CONFIG.Item.dataModels.language = LanguageData;
  CONFIG.Item.dataModels.origin = OriginData;
  CONFIG.Item.dataModels.class = ClassData;
  // Sous-classe : même schéma que la classe.
  CONFIG.Item.dataModels.subclass = ClassData;

  // Vidé puis repeuplé (Proxy indexé par id), jamais réaffecté.
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

  // Une fiche dédiée par type d'Item.
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

  // Préchargement des partials hors PARTS : en-têtes de classe et parties communes des fiches d'Item.
  await foundry.applications.handlebars.loadTemplates([
    `systems/${SYSTEM_ID}/templates/actor/abilities/class-flavor.hbs`,
    `systems/${SYSTEM_ID}/templates/item/parts/header.hbs`,
    `systems/${SYSTEM_ID}/templates/item/parts/price.hbs`,
    `systems/${SYSTEM_ID}/templates/item/parts/description.hbs`,
    `systems/${SYSTEM_ID}/templates/item/parts/reaction-trigger.hbs`,
    `systems/${SYSTEM_ID}/templates/item/parts/damage-affinities.hbs`
  ]);

  // Données de jeu chargées depuis le JSON.
  game.dndCustomAi = {
    origins: await loadSystemJson("scripts/data/origins.json"),
    spellSlotTables: await loadSystemJson("scripts/data/spell-slots.json"),
    // Glossaire (slug -> définition) des infobulles de la fiche.
    glossary: await loadGlossary(),
    openAwardXpDialog,
    importSystemContent,
    resyncControlledToken
  };
});

// Au chargement : Journaux, macros, import du contenu de référence et migrations.
Hooks.once("ready", async () => {
  await ensureOriginsJournal();
  await ensurePlayerGuideJournal();
  await syncGmGuideJournal();
  await syncItemLoreJournal();
  await syncStoneSitesJournal();
  await ensureAwardXpMacro();
  await ensureContentImportMacro();
  await ensureTokenResyncMacro();
  await importSystemContent({ notifyIfEmpty: false });
  // Fin de l'import automatique (création ET resynchronisation), attendue par les tests E2E.
  game.dndCustomAi.contentImported = true;
  await ensureWildSurgeTable("barbarian");
  await ensureWildSurgeTable("sorcerer");
  await ensureCharacterTokensLinked();
  await ensureTokenDisplayDefaults();
  await ensureNpcAttacksArray();
});

/** Relie leur token aux personnages joueurs, sauf les tokens dont les PV divergent de la fiche. */
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
        // Relie seulement si token et Actor ont les mêmes PV.
        const masterActor = game.actors.get(token.actorId);
        return masterActor && token.actor.system.attributes.hp.value === masterActor.system.attributes.hp.value;
      })
      .map((token) => ({ _id: token.id, actorLink: true }));
    if (tokenUpdates.length) await scene.updateEmbeddedDocuments("Token", tokenUpdates); // NOSONAR : séquentiel voulu
  }
}

/** Applique l'affichage permanent nom/PV aux Actors et tokens existants. */
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
    if (tokenUpdates.length) await scene.updateEmbeddedDocuments("Token", tokenUpdates); // NOSONAR : séquentiel voulu
  }
}

/** Convertit l'ancien profil `system.attack` d'un PNJ en premier élément de `system.attacks`. */
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

// Écoutes socket des relais MJ.
Hooks.once("ready", () => {
  registerActorUpdateRelay();
  registerStatusEffectRelay();
  ensureBeastCompanionRequestListener();
  registerWildShapeFormRequestListener();
  registerOpportunityAttackHooks();
});

// Hooks de règles du système, chacun détaillé dans son module helpers/*-hooks.js.
registerSecurityHooks();
registerTokenActorHooks();
registerEquipmentHooks();
registerHitPointHooks();
registerCombatEffectHooks();
registerChatMessageHooks();

async function loadGlossary() {
  const entries = await loadSystemJson("scripts/data/glossary.json");
  // Indexé par slug pour le helper `glossaryTip`.
  return new Map(entries.map((entry) => [entry.key, entry.definition]));
}
