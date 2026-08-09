import { DND_CUSTOM } from "../helpers/config.js";
import { formatModifier } from "../helpers/rules.js";
import { rollCheck } from "../helpers/rolls.js";
import { InventoryDragDropMixin } from "./inventory-drag-drop.js";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

const SYSTEM_ID = "dnd-custom-ai";

/** Feuille d'ennemi/PNJ : ApplicationV2/ActorSheetV2, stats simplifiées (bonus direct,
 *  sauvegarde = bonus). Réutilisée telle quelle pour le type "mount" (montures vivantes,
 *  cf. dnd-custom-ai.js) : même fiche, juste un type d'Actor et un libellé différents. Le
 *  glisser-déposer (InventoryDragDropMixin) permet d'ajouter/retirer du butin ou de la
 *  sellerie via l'onglet "Butin". */
export class DndCustomNpcSheet extends InventoryDragDropMixin(HandlebarsApplicationMixin(ActorSheetV2)) {
  static DEFAULT_OPTIONS = {
    classes: [SYSTEM_ID, "sheet", "actor", "npc"],
    tag: "form",
    position: { width: 640, height: 620 },
    window: { resizable: true },
    form: { submitOnChange: true, closeOnSubmit: false },
    actions: {
      rollAbility: DndCustomNpcSheet.#onRollAbility
    }
  };

  static PARTS = {
    header: { template: `systems/${SYSTEM_ID}/templates/actor/npc-sheet.hbs` },
    tabs: { template: "templates/generic/tab-navigation.hbs" },
    stats: { template: `systems/${SYSTEM_ID}/templates/actor/npc-tab-stats.hbs` },
    abilities: { template: `systems/${SYSTEM_ID}/templates/actor/npc-tab-abilities.hbs` },
    loot: { template: `systems/${SYSTEM_ID}/templates/actor/npc-tab-loot.hbs` }
  };

  static TABS = {
    primary: {
      tabs: [
        { id: "stats", icon: "fa-solid fa-chart-simple" },
        { id: "abilities", icon: "fa-solid fa-book-sparkles" },
        { id: "loot", icon: "fa-solid fa-sack" }
      ],
      initial: "stats",
      labelPrefix: "DND_CUSTOM.Tabs"
    }
  };

  /** @override
   * Contexte partagé par tous les onglets : options des listes SRD (type, taille, FI)
   * et bonus de caractéristiques déjà formatés, pour garder les templates .hbs sans logique.
   */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const system = this.actor.system;

    context.actor = this.actor;
    context.system = system;
    context.config = DND_CUSTOM;

    context.creatureTypeOptions = Object.entries(DND_CUSTOM.creatureTypes).map(([key, labelKey]) => ({
      key,
      label: labelKey,
      selected: system.creatureType === key
    }));

    context.sizeOptions = Object.entries(DND_CUSTOM.sizes).map(([key, labelKey]) => ({
      key,
      label: labelKey,
      selected: system.size === key
    }));

    context.challengeRatingOptions = DND_CUSTOM.challengeRatings.map((cr) => ({
      value: cr,
      selected: system.challengeRating === cr
    }));

    const hp = system.attributes.hp;
    context.hpPercent = Math.max(0, Math.min(100, Math.round((hp.value / (hp.max || 1)) * 100)));

    // Sauvegarde = bonus de caractéristique (pas de score ni de maîtrise séparée pour un PNJ).
    context.abilities = Object.entries(system.abilities).map(([key, ability]) => ({
      key,
      label: DND_CUSTOM.abilities[key],
      mod: ability.mod,
      modLabel: formatModifier(ability.mod)
    }));

    const items = this.actor.items.contents;
    context.lootItems = items.filter((item) => ["weapon", "armor", "gear", "tool"].includes(item.type));

    return context;
  }

  /** @override */
  async _preparePartContext(partId, context) {
    context = await super._preparePartContext(partId, context);
    if (context.tabs?.[partId]) context.tab = context.tabs[partId];
    return context;
  }

  /** Jet de caractéristique (1d20 + bonus) : sert aussi de jet de sauvegarde, identiques
   *  pour un PNJ (pas de maîtrise séparée, cf. commentaire de classe). */
  static async #onRollAbility(event, target) {
    const key = target.dataset.key;
    const mod = this.actor.system.abilities[key].mod;
    await rollCheck({
      actor: this.actor,
      formula: formatModifier(mod),
      flavor: game.i18n.format("DND_CUSTOM.Roll.AbilityCheck", {
        ability: game.i18n.localize(DND_CUSTOM.abilities[key])
      }),
      advantage: event.shiftKey,
      disadvantage: event.ctrlKey
    });
  }
}