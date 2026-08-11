// Objets physiques (quantité empilable) + Capacités/Sorts/Langues (ni quantité ni doublon
// voulu, cf. _onDropItem ci-dessous) : ces derniers étaient absents de cette liste jusqu'ici,
// ce qui bloquait silencieusement tout glisser-déposer d'une Capacité/d'un Sort/d'une Langue
// depuis un compendium ou une autre fiche vers la fiche de personnage (retour de test).
const PHYSICAL_TYPES = ["weapon", "armor", "gear", "tool"];
const TRANSFERABLE_TYPES = [...PHYSICAL_TYPES, "feature", "spell", "language"];

/** Mixin ApplicationV2 : glisser-déposer d'objet entre deux fiches ouvertes (personnage ↔
 *  véhicule, ou depuis un compendium/le monde), édition directe des lignes d'inventaire
 *  (quantité, équipé) et bouton "Voir" par ligne pour ouvrir la fiche de l'Item.
 *
 *  Le drop lui-même s'appuie sur le hook protégé `_onDropItem(event, item)` que Foundry
 *  fournit déjà nativement sur `ActorSheetV2` (branché via `this._dragDrop`, lui-même lié
 *  dans `_onRender` de la classe de base) plutôt que sur des listeners `dragover`/`drop`
 *  maison : Foundry attache toujours les siens sur `this.element` (racine de la fiche) dès
 *  que `ActorSheetV2._onRender` tourne, donc des listeners HTML5 additionnels sur ce même
 *  élément s'exécutaient EN PLUS des siens et dupliquaient l'Item créé à chaque drop. */
export function InventoryDragDropMixin(Base) {
  return class InventoryDragDrop extends Base {
    static DEFAULT_OPTIONS = {
      actions: {
        deleteItem: InventoryDragDrop.#onDeleteItem,
        viewItem: InventoryDragDrop.#onViewItem
      }
    };

    /** @override */
    _onRender(context, options) {
      super._onRender(context, options);
      this.#attachInventoryRowListeners();
    }

    /** Glisser une ligne d'inventaire (dragstart) : Foundry ne gère nativement que les
     *  éléments matchant son sélecteur `.draggable` (cf. ActorSheetV2#_dragDrop), pas
     *  l'attribut HTML `draggable` posé ici — pas de doublon possible avec le sien.
     *  Branche aussi l'édition directe (quantité, équipé) via un listener `change` délégué
     *  sur le root, borné une seule fois (flag) pour survivre aux lignes recréées à chaque
     *  render sans jamais s'empiler. */
    #attachInventoryRowListeners() {
      const root = this.element;

      root.querySelectorAll("[data-item-id]").forEach((row) => {
        row.setAttribute("draggable", "true");
        row.addEventListener("dragstart", (event) => {
          const item = this.actor.items.get(row.dataset.itemId);
          if (!item) return;
          event.dataTransfer.setData("text/plain", JSON.stringify({ type: "Item", uuid: item.uuid }));
        });
      });

      if (root.dataset.dndInventoryBound) return;
      root.dataset.dndInventoryBound = "true";
      root.addEventListener("change", (event) => this.#onInventoryFieldChange(event));
    }

    async #onInventoryFieldChange(event) {
      const target = event.target;
      const itemId = target.closest("[data-item-id]")?.dataset.itemId;
      const item = itemId ? this.actor.items.get(itemId) : null;
      if (!item) return;

      if (target.matches("[data-item-quantity]")) {
        await item.update({ "system.quantity": Math.max(0, Math.trunc(Number(target.value) || 0)) });
      } else if (target.matches("[data-item-equipped]")) {
        await item.update({ "system.equipped": target.checked });
      } else if (target.matches("[data-item-prepared]")) {
        await item.update({ "system.prepared": target.checked });
      }
    }

    /** @override
     *  Remplace le comportement par défaut de Foundry (crée toujours un nouvel Item, même si
     *  un exemplaire du même nom existe déjà sur l'Actor) : regroupe en quantité s'il y a
     *  déjà un Item de même type/nom, et retire l'Item de sa fiche source s'il était déjà
     *  possédé par un autre Actor (déplacement, pas copie). Le tri au sein du même Actor
     *  (glisser une ligne sur elle-même) reste géré par Foundry (`super`). */
    async _onDropItem(event, item) {
      if (!this.actor.isOwner) return null;
      if (this.actor.uuid === item.parent?.uuid) return super._onDropItem(event, item);
      if (!TRANSFERABLE_TYPES.includes(item.type)) return null;

      try {
        const existing = this.actor.items.contents.find(
          (candidate) => candidate.type === item.type && candidate.name === item.name
        );

        let result;
        if (existing && PHYSICAL_TYPES.includes(item.type)) {
          const addedQuantity = item.system.quantity ?? 1;
          await existing.update({ "system.quantity": (existing.system.quantity ?? 0) + addedQuantity });
          result = existing;
        } else if (existing) {
          // Capacité/Sort : pas de champ quantité (FeatureData/SpellData), un exemplaire de
          // plus n'a pas de sens (ex. Rage ou Boule de feu en double) — on garde l'existant
          // tel quel plutôt que de tenter d'écrire system.quantity dessus.
          result = existing;
        } else {
          const [created] = await this.actor.createEmbeddedDocuments("Item", [item.toObject()]);
          result = created;
        }

        if (item.actor) await item.delete();
        return result ?? null;
      } catch (error) {
        console.error(error);
        ui.notifications.warn(game.i18n.localize("DND_CUSTOM.Inventory.DropError"));
        return null;
      }
    }

    static #onDeleteItem(event, target) {
      const itemId = target.closest("[data-item-id]")?.dataset.itemId;
      this.actor.items.get(itemId)?.delete();
    }

    static #onViewItem(event, target) {
      const itemId = target.closest("[data-item-id]")?.dataset.itemId;
      this.actor.items.get(itemId)?.sheet.render(true);
    }
  };
}
