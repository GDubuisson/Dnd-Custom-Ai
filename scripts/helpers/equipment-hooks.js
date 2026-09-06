import { equipmentSlots, isOffHandEligible } from "./rules.js";

/** Hooks de règles d'équipement (`preUpdateItem`/`updateItem`) : seuls les contenants (`gear`
 *  à `capacityBonus > 0`) peuvent être équipés parmi Objets/Outils, un seul contenant équipé à
 *  la fois (déséquipement auto de l'ancien), et un emplacement d'équipement arme/armure ne peut
 *  être occupé que par un objet à la fois (collision bloquée, main secondaire réservée aux armes
 *  Légères). Extrait de dnd-custom-ai.js (découpe pré-1.0) — appelé au chargement du module, à la
 *  position historique de ces hooks. */
export function registerEquipmentHooks() {
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
}
