const TRANSFERABLE_TYPES = ["weapon", "armor", "gear", "tool"];

/** Mixin ApplicationV2 : glisser-déposer HTML5 natif (pas de dépendance à la classe interne
 *  `DragDrop` de Foundry, pour rester stable d'une version à l'autre) permettant de
 *  transférer un Item entre deux fiches ouvertes (personnage ↔ véhicule, ou depuis un
 *  compendium/le monde). Si l'Item déposé était déjà possédé par un autre Actor, il est
 *  déplacé (retiré de la source) plutôt que dupliqué — simule "prendre un objet quelque part
 *  pour le ranger ailleurs". Ajoute aussi le bouton de suppression par ligne d'inventaire
 *  (`data-action="deleteItem"` sur un élément portant `data-item-id`). */
export function InventoryDragDropMixin(Base) {
  return class InventoryDragDrop extends Base {
    static DEFAULT_OPTIONS = {
      actions: {
        deleteItem: InventoryDragDrop.#onDeleteItem
      }
    };

    /** @override */
    _onRender(context, options) {
      super._onRender(context, options);
      this.#attachInventoryDragDrop();
    }

    #attachInventoryDragDrop() {
      const root = this.element;

      root.querySelectorAll("[data-item-id]").forEach((row) => {
        row.setAttribute("draggable", "true");
        row.addEventListener("dragstart", (event) => {
          const item = this.actor.items.get(row.dataset.itemId);
          if (!item) return;
          event.dataTransfer.setData("text/plain", JSON.stringify({ type: "Item", uuid: item.uuid }));
        });
      });

      root.addEventListener("dragover", (event) => event.preventDefault());
      root.addEventListener("drop", (event) => this.#onDropItem(event));
    }

    async #onDropItem(event) {
      event.preventDefault();

      let data;
      try {
        data = JSON.parse(event.dataTransfer.getData("text/plain"));
      } catch {
        return;
      }
      if (data?.type !== "Item") return;

      const item = await fromUuid(data.uuid);
      if (!item || item.parent?.id === this.actor.id) return;
      if (!TRANSFERABLE_TYPES.includes(item.type)) return;

      try {
        await this.actor.createEmbeddedDocuments("Item", [item.toObject()]);
        if (item.actor) await item.delete();
      } catch (error) {
        console.error(error);
        ui.notifications.warn(game.i18n.localize("DND_CUSTOM.Inventory.DropError"));
      }
    }

    static #onDeleteItem(event, target) {
      const itemId = target.closest("[data-item-id]")?.dataset.itemId;
      this.actor.items.get(itemId)?.delete();
    }
  };
}
