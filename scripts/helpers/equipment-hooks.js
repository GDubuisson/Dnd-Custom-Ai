import { equipmentSlots, isOffHandEligible } from "./rules.js";

/** Enregistre les hooks de règles d'équipement (contenants, emplacements, main secondaire). */
export function registerEquipmentHooks() {
  // Parmi Objets et Outils, seuls les contenants (`capacityBonus > 0`) s'équipent.
  Hooks.on("preUpdateItem", (item, changes) => {
    if (!["gear", "tool"].includes(item.type)) return;
    if (changes.system?.equipped !== true) return;
    if ((item.system.capacityBonus ?? 0) <= 0) delete changes.system.equipped;
  });
  
  // Un seul contenant équipé à la fois : déséquipe les autres.
  Hooks.on("updateItem", async (item, changes, options, userId) => {
    if (game.user.id !== userId) return;
    if (item.type !== "gear") return;
    if (changes.system?.equipped !== true) return;
    if ((item.system.capacityBonus ?? 0) <= 0) return;
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
  
  // Bloque l'équipement d'une arme/armure dont l'emplacement (ou une des deux mains) est déjà occupé.
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
  
    // Main secondaire réservée aux armes Légères.
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
}
