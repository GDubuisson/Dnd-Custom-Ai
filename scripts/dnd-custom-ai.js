import { CharacterData } from "./data/character-data.js";
import { NpcData } from "./data/npc-data.js";
import { VehicleActorData } from "./data/vehicle-actor-data.js";
import { WeaponData, ArmorData, GearData, FeatureData, ToolData } from "./data/item-data.js";
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
  ToolItemSheet
} from "./sheets/item-sheets.js";
import { ensureOriginsJournal } from "./helpers/origins-journal.js";
import { registerHandlebarsHelpers } from "./helpers/handlebars-helpers.js";
import { equipmentSlots, isOffHandEligible } from "./helpers/rules.js";

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
  CONFIG.Actor.dataModels.vehicle = VehicleActorData;
  CONFIG.Item.dataModels.weapon = WeaponData;
  CONFIG.Item.dataModels.armor = ArmorData;
  CONFIG.Item.dataModels.gear = GearData;
  CONFIG.Item.dataModels.feature = FeatureData;
  CONFIG.Item.dataModels.tool = ToolData;
  // Destinés aux compendiums (system.json > packs), remplis à la main par le MJ depuis
  // l'interface Foundry (cf. données actuelles dans scripts/data/origins.json pour "origin").
  CONFIG.Item.dataModels.origin = OriginData;
  CONFIG.Item.dataModels.class = ClassData;

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

  // Une fiche Handlebars dédiée par type d'Item (cf. ClaudeFiles/ITEMS.md).
  DocumentSheetConfig.registerSheet(Item, SYSTEM_ID, WeaponItemSheet, { types: ["weapon"], makeDefault: true });
  DocumentSheetConfig.registerSheet(Item, SYSTEM_ID, ArmorItemSheet, { types: ["armor"], makeDefault: true });
  DocumentSheetConfig.registerSheet(Item, SYSTEM_ID, GearItemSheet, { types: ["gear"], makeDefault: true });
  DocumentSheetConfig.registerSheet(Item, SYSTEM_ID, FeatureItemSheet, { types: ["feature"], makeDefault: true });
  DocumentSheetConfig.registerSheet(Item, SYSTEM_ID, OriginItemSheet, { types: ["origin"], makeDefault: true });
  DocumentSheetConfig.registerSheet(Item, SYSTEM_ID, ClassItemSheet, { types: ["class"], makeDefault: true });
  DocumentSheetConfig.registerSheet(Item, SYSTEM_ID, ToolItemSheet, { types: ["tool"], makeDefault: true });

  registerHandlebarsHelpers();

  // Données de jeu externalisées en JSON (cf. convention "pas en dur dans le JS").
  game.dndCustomAi = {
    origins: await loadOrigins()
  };
});

// Journal de référence (MJ) récapitulant les différences entre Origines : créé une seule
// fois, au premier chargement du monde, à partir des mêmes données que le sélecteur
// "Origine" de la fiche de personnage.
Hooks.once("ready", async () => {
  await ensureOriginsJournal();
});

// Champs de "build" du personnage (caractéristiques, maîtrises, classe/origine/niveau) :
// réservés au MJ. Filet de sécurité côté données, en complément du "disabled" côté UI
// (cf. templates/actor/character-sheet.hbs et tab-stats.hbs) — empêche toute modification
// qui ne passerait pas par le formulaire standard (macro, console).
Hooks.on("preUpdateActor", (actor, changes, options, userId) => {
  if (actor.type !== "character") return;
  if (game.users.get(userId)?.isGM) return;

  const sys = changes.system;
  if (!sys) return;

  delete sys.class;
  delete sys.origin;
  if (sys.attributes) delete sys.attributes.level;
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

async function loadOrigins() {
  const response = await fetch(`systems/${SYSTEM_ID}/scripts/data/origins.json`);
  return response.json();
}
