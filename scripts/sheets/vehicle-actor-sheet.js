import { carriedWeight, hitPointsPercent } from "../helpers/rules.js";
import { DND_CUSTOM } from "../helpers/config.js";
import { InventoryDragDropMixin } from "./inventory-drag-drop.js";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

const SYSTEM_ID = "dnd-custom-ai";

/** Fiche de véhicule ou de monture, avec inventaire partagé alimenté par glisser-déposer. */
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

    context.namePlaceholder = game.i18n.localize(`TYPES.Actor.${this.actor.type}`);
    context.hpPercent = hitPointsPercent(system.attributes.hp);
    // Monture : la taille, comparée par le don Combat monté.
    context.isMount = this.actor.type === "mount";
    if (context.isMount) {
      context.sizeOptions = Object.entries(DND_CUSTOM.sizes).map(([key, labelKey]) => ({
        key,
        label: game.i18n.localize(labelKey),
        selected: key === system.size
      }));
    }

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
