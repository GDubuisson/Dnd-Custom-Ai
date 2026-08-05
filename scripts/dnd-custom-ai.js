import { CharacterData } from "./data/character-data.js";
import { WeaponData, ArmorData, GearData, FeatureData } from "./data/item-data.js";
import { DndCustomActorSheet } from "./sheets/actor-sheet.js";

const SYSTEM_ID = "dnd-custom-ai";

Hooks.once("init", async () => {
  console.log(`${SYSTEM_ID} | Initialisation du système`);

  // Types déclarés dans system.json ("documentTypes") ; le schéma de chaque type
  // vient de son DataModel, pas d'un template.json (approche dépréciée depuis la V12/V13).
  CONFIG.Actor.dataModels.character = CharacterData;
  CONFIG.Item.dataModels.weapon = WeaponData;
  CONFIG.Item.dataModels.armor = ArmorData;
  CONFIG.Item.dataModels.gear = GearData;
  CONFIG.Item.dataModels.feature = FeatureData;

  DocumentSheetConfig.registerSheet(Actor, SYSTEM_ID, DndCustomActorSheet, {
    types: ["character"],
    makeDefault: true,
    label: "DND_CUSTOM.SheetLabels.Character"
  });

  // Données de jeu externalisées en JSON (cf. convention "pas en dur dans le JS").
  game.dndCustomAi = {
    origins: await loadOrigins()
  };
});

async function loadOrigins() {
  const response = await fetch(`systems/${SYSTEM_ID}/scripts/data/origins.json`);
  return response.json();
}
