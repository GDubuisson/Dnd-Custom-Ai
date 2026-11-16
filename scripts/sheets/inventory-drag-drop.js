import {
  carryingCapacity,
  carryingCapacityBonus,
  carriedWeight,
  isOffHandEligible,
  missingRequiredLanguage
} from "../helpers/rules.js";
import { DND_CUSTOM } from "../helpers/config.js";
import { itemFromTarget } from "../helpers/sheet-items.js";

const { DialogV2 } = foundry.applications.api;

// Types d'Item physiques (avec quantité).
const PHYSICAL_TYPES = new Set(["weapon", "armor", "gear", "tool"]);
// Types physiques empilables ; armes et armures gardent une ligne chacune.
const STACKABLE_PHYSICAL_TYPES = new Set(["gear", "tool"]);
const TRANSFERABLE_TYPES = new Set([...PHYSICAL_TYPES, "feature", "spell", "language"]);

/** Indique si un Sort peut être glissé sur `actor` (sort de sa classe, ou données incomplètes). */
function isSpellAllowedForActor(item, actor) {
  if (item.type !== "spell" || actor.type !== "character") return true;
  if (!item.system.classes.size || !actor.system.class) return true;
  return item.system.classes.has(actor.system.class);
}

/** Indique si l'ajout de `item` (ou de `addedQuantity` unités) dépasse la capacité de charge d'un personnage. */
function wouldExceedCarryingCapacity(item, actor, addedQuantity = null) {
  if (actor.type !== "character" || !PHYSICAL_TYPES.has(item.type)) return false;

  const addedWeight = (item.system.weight ?? 0) * (addedQuantity ?? item.system.quantity ?? 1);
  if (addedWeight <= 0) return false;

  const items = actor.items.contents;
  const capacity = carryingCapacity(actor.system.abilities.str.total, "kg") + carryingCapacityBonus(items);
  return carriedWeight(items) + addedWeight > capacity;
}

/** Emplacements proposés au joueur pour équiper `item` (arme à une main Légère seulement), sinon `{}`. */
function equipSlotOptionsFor(item) {
  if (item.type !== "weapon") return {};
  if (item.system.properties?.handedness === "twoHanded") return {};
  return isOffHandEligible(item.system) ? DND_CUSTOM.weaponSlotOptions : {};
}

/**
 * Mixin d'inventaire : glisser-déposer entre fiches, édition directe des lignes (quantité, équipé)
 * et bouton « Voir ». Le drop passe par le `_onDropItem` natif d'ActorSheetV2.
 */
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

    /** @override Expose `context.tab` aux templates de part. */
    async _preparePartContext(partId, context) {
      context = await super._preparePartContext(partId, context);
      if (context.tabs?.[partId]) context.tab = context.tabs[partId];
      return context;
    }

    /** Branche le glisser des lignes d'inventaire et l'édition directe (listener délégué unique). */
    #attachInventoryRowListeners() {
      const root = this.element;

      root.querySelectorAll("[data-item-id]").forEach((row) => {
        row.setAttribute("draggable", "true");
        row.addEventListener("dragstart", (event) => {
          const item = itemFromTarget(this.actor, row);
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
      const item = itemFromTarget(this.actor, target);
      if (!item) return;

      if (target.matches("[data-item-quantity]")) {
        const newQuantity = Math.max(0, Math.trunc(Number(target.value) || 0));
        const delta = newQuantity - (item.system.quantity ?? 0);
        // Hausse de quantité bloquée en cas de surcharge.
        if (delta > 0 && wouldExceedCarryingCapacity(item, this.actor, delta)) {
          ui.notifications.warn(game.i18n.localize("DND_CUSTOM.Inventory.OverCapacityBlocked"));
          target.value = item.system.quantity ?? 0;
          return;
        }
        await item.update({ "system.quantity": newQuantity });
      } else if (target.matches("[data-item-equipped]")) {
        if (!target.checked) {
          await item.update({ "system.equipped": false });
          return;
        }

        // Choix de l'emplacement s'il y en a plusieurs légaux.
        const slotOptions = equipSlotOptionsFor(item);
        const optionKeys = Object.keys(slotOptions);
        const updates = { "system.equipped": true };

        if (optionKeys.length > 1) {
          const chosenSlot = await this.#offerEquipSlotDialog(item, slotOptions);
          if (!chosenSlot) {
            target.checked = false; // fenêtre annulée/fermée : rien à équiper.
            return;
          }
          updates["system.slot"] = chosenSlot;
        } else if (optionKeys.length === 1) {
          updates["system.slot"] = optionKeys[0];
        }

        await item.update(updates);
        // Resynchronise la case avec l'état réel (conflit d'emplacement possible).
        target.checked = item.system.equipped;
      }
    }

    /**
     * Dialogue de choix d'emplacement parmi `slotOptions`.
     * @returns {Promise<string|null|undefined>} clé choisie
     */
    async #offerEquipSlotDialog(item, slotOptions) {
      const keys = Object.keys(slotOptions);
      const defaultKey = keys.includes(item.system.slot) ? item.system.slot : keys[0];
      const rows = keys
        .map(
          (key) => `
        <label class="checkbox-row">
          <input type="radio" name="equipSlot" value="${key}" ${key === defaultKey ? "checked" : ""}>
          ${game.i18n.localize(slotOptions[key])}
        </label>`
        )
        .join("");

      return DialogV2.prompt({
        window: { title: game.i18n.localize("DND_CUSTOM.Equipment.ChooseSlotTitle") },
        content: `<div style="display:flex;flex-direction:column;gap:0.4rem;">${rows}</div>`,
        ok: {
          label: game.i18n.localize("DND_CUSTOM.Equipment.ChooseSlotConfirm"),
          callback: (event, button) => button.form.elements.equipSlot?.value
        }
      });
    }

    /** @override Empile par nom si possible et déplace l'Item depuis son Actor d'origine. */
    async _onDropItem(event, item) {
      if (!this.actor.isOwner) return null;
      if (this.actor.uuid === item.parent?.uuid) return super._onDropItem(event, item);
      if (!TRANSFERABLE_TYPES.has(item.type)) return null;
      if (!isSpellAllowedForActor(item, this.actor)) {
        ui.notifications.warn(
          game.i18n.format("DND_CUSTOM.Inventory.SpellWrongClass", { spell: item.name })
        );
        return null;
      }
      const requiredLanguage = missingRequiredLanguage(item, this.actor.items.contents);
      if (requiredLanguage) {
        ui.notifications.warn(
          game.i18n.format("DND_CUSTOM.Inventory.LanguageRequired", { language: item.name, required: requiredLanguage })
        );
        return null;
      }
      if (wouldExceedCarryingCapacity(item, this.actor)) {
        ui.notifications.warn(game.i18n.localize("DND_CUSTOM.Inventory.OverCapacityBlocked"));
        return null;
      }

      try {
        const existing = this.actor.items.contents.find(
          (candidate) => candidate.type === item.type && candidate.name === item.name
        );

        let result;
        if (existing && STACKABLE_PHYSICAL_TYPES.has(item.type)) {
          const addedQuantity = item.system.quantity ?? 1;
          await existing.update({ "system.quantity": (existing.system.quantity ?? 0) + addedQuantity });
          result = existing;
        } else if (existing && !PHYSICAL_TYPES.has(item.type)) {
          // Capacité ou Sort déjà possédé : conservé tel quel.
          result = existing;
        } else {
          // Nouvel objet, ou arme/armure jamais empilée.
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
      itemFromTarget(this.actor, target)?.delete();
    }

    static #onViewItem(event, target) {
      itemFromTarget(this.actor, target)?.sheet.render(true);
    }
  };
}
