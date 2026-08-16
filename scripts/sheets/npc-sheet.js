import { DND_CUSTOM } from "../helpers/config.js";
import { formatModifier } from "../helpers/rules.js";
import { rollCheck } from "../helpers/rolls.js";
import { openAwardXpDialog } from "../helpers/xp.js";
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
      rollAbility: DndCustomNpcSheet.#onRollAbility,
      toggleCondition: DndCustomNpcSheet.#onToggleCondition,
      rollInitiative: DndCustomNpcSheet.#onRollInitiative,
      awardXp: DndCustomNpcSheet.#onAwardXp
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
    context.isGM = game.user.isGM;

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

    // États SRD 5e (cf. CONFIG.statusEffects, scripts/dnd-custom-ai.js) : pas d'Exhaustion à
    // paliers pour un PNJ (stats déjà simplifiées, cf. commentaire de classe ci-dessus).
    context.conditions = CONFIG.statusEffects.map((status) => ({
      id: status.id,
      label: game.i18n.localize(status.name),
      img: status.img,
      active: this.actor.statuses.has(status.id)
    }));
    // Résumé affiché dans le libellé replié de la liste déroulante (cf. npc-tab-stats.hbs) sans
    // avoir à ouvrir le menu — même principe que la fiche personnage (actor-sheet.js).
    context.activeConditions = context.conditions.filter((condition) => condition.active);

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

  /** Bascule un état (cf. CONFIG.statusEffects) : Actor#toggleStatusEffect crée/retire
   *  l'ActiveEffect correspondante (méthode native Foundry). */
  static async #onToggleCondition(event, target) {
    await this.actor.toggleStatusEffect(target.dataset.key);
  }

  /** Jet d'Initiative : cf. DndCustomActorSheet#onRollInitiative (même mécanisme natif Foundry). */
  static async #onRollInitiative() {
    await this.actor.rollInitiative({ createCombatants: true });
  }

  /** Ouvre la boîte de dialogue de distribution d'XP, montant pré-rempli avec le XP rapporté
   *  de ce PNJ (cf. scripts/helpers/xp.js). */
  static async #onAwardXp() {
    await openAwardXpDialog({ defaultAmount: this.actor.system.xpReward });
  }
}