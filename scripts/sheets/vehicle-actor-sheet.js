import { carriedWeight } from "../helpers/rules.js";
import { InventoryDragDropMixin } from "./inventory-drag-drop.js";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

const SYSTEM_ID = "dnd-custom-ai";

/** Fiche de véhicule (charrette, bateau...) : le minimum (nom, vitesse, PV, capacité de
 *  charge) + un inventaire partagé qu'on peut peupler par glisser-déposer depuis une fiche
 *  de personnage ouverte (ou vider de même) — cf. InventoryDragDropMixin. */
export class VehicleActorSheet extends InventoryDragDropMixin(HandlebarsApplicationMixin(ActorSheetV2)) {
  static DEFAULT_OPTIONS = {
    classes: [SYSTEM_ID, "sheet", "actor", "vehicle"],
    tag: "form",
    position: { width: 480, height: "auto" },
    window: { resizable: true },
    form: { submitOnChange: true, closeOnSubmit: false }
  };

  static PARTS = {
    form: { template: `systems/${SYSTEM_ID}/templates/actor/vehicle-sheet.hbs` }
  };

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const system = this.actor.system;

    context.actor = this.actor;
    context.system = system;

    context.hpPercent = Math.max(0, Math.min(100, Math.round((system.attributes.hp.value / (system.attributes.hp.max || 1)) * 100)));

    context.inventoryItems = this.actor.items.filter((item) =>
      ["weapon", "armor", "gear", "tool"].includes(item.type)
    );
    context.carriedWeight = carriedWeight(context.inventoryItems);
    context.carryingCapacityPercent = Math.min(
      100,
      Math.round((context.carriedWeight / (system.carryCapacity || 1)) * 100)
    );
    context.overCapacity = context.carriedWeight > system.carryCapacity;

    return context;
  }
}
