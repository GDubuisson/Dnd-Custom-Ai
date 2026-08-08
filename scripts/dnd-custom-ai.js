import { CharacterData } from "./data/character-data.js";
import { NpcData } from "./data/npc-data.js";
import { WeaponData, ArmorData, GearData, FeatureData } from "./data/item-data.js";
import { DndCustomActorSheet } from "./sheets/actor-sheet.js";
import { DndCustomNpcSheet } from "./sheets/npc-sheet.js";

const SYSTEM_ID = "dnd-custom-ai";

Hooks.once("init", async () => {
  console.log(`${SYSTEM_ID} | Initialisation du système`);

  // Types déclarés dans system.json ("documentTypes") ; le schéma de chaque type
  // vient de son DataModel, pas d'un template.json (approche dépréciée depuis la V12/V13).
  CONFIG.Actor.dataModels.character = CharacterData;
  CONFIG.Actor.dataModels.npc = NpcData;
  CONFIG.Item.dataModels.weapon = WeaponData;
  CONFIG.Item.dataModels.armor = ArmorData;
  CONFIG.Item.dataModels.gear = GearData;
  CONFIG.Item.dataModels.feature = FeatureData;

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

  // Données de jeu externalisées en JSON (cf. convention "pas en dur dans le JS").
  game.dndCustomAi = {
    origins: await loadOrigins()
  };
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

async function loadOrigins() {
  const response = await fetch(`systems/${SYSTEM_ID}/scripts/data/origins.json`);
  return response.json();
}
