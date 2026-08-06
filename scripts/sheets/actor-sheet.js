import { DND_CUSTOM } from "../helpers/config.js";
import {
  abilityModifier,
  proficiencyBonus,
  carryingCapacity,
  carriedWeight,
  currencyTotalInCopper,
  formatModifier
} from "../helpers/rules.js";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

const SYSTEM_ID = "dnd-custom-ai";

/** Feuille de personnage joueur : un onglet Handlebars par PART, ApplicationV2/ActorSheetV2. */
export class DndCustomActorSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: [SYSTEM_ID, "sheet", "actor", "character"],
    tag: "form",
    position: { width: 720, height: 720 },
    window: { resizable: true },
    form: { submitOnChange: true, closeOnSubmit: false },
    actions: {
      restShort: DndCustomActorSheet.#onRestShort,
      restLong: DndCustomActorSheet.#onRestLong
    }
  };

  static PARTS = {
    header: { template: `systems/${SYSTEM_ID}/templates/actor/character-sheet.hbs` },
    tabs: { template: "templates/generic/tab-navigation.hbs" },
    stats: { template: `systems/${SYSTEM_ID}/templates/actor/tab-stats.hbs` },
    equipment: { template: `systems/${SYSTEM_ID}/templates/actor/tab-equipment.hbs` },
    inventory: { template: `systems/${SYSTEM_ID}/templates/actor/tab-inventory.hbs` },
    abilities: { template: `systems/${SYSTEM_ID}/templates/actor/tab-abilities.hbs` },
    journal: { template: `systems/${SYSTEM_ID}/templates/actor/tab-journal.hbs` }
  };

  static TABS = {
    primary: {
      tabs: [
        { id: "stats", icon: "fa-solid fa-chart-simple" },
        { id: "equipment", icon: "fa-solid fa-shield-halved" },
        { id: "inventory", icon: "fa-solid fa-sack" },
        { id: "abilities", icon: "fa-solid fa-book-sparkles" },
        { id: "journal", icon: "fa-solid fa-feather" }
      ],
      initial: "stats",
      labelPrefix: "DND_CUSTOM.Tabs"
    }
  };

  /** @override
   * Construit le contexte partagé par tous les onglets (PARTS) : valeurs brutes du système
   * + valeurs dérivées (modificateurs, bonus de maîtrise, poids, richesse) calculées ici
   * pour garder les templates .hbs sans logique.
   */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const system = this.actor.system;

    context.actor = this.actor;
    context.system = system;
    context.config = DND_CUSTOM;
    // Chargées une fois au démarrage par le hook "init" (voir dnd-custom-ai.js).
    context.origins = game.dndCustomAi?.origins ?? {};
    context.originOptions = Object.entries(context.origins).map(([key, origin]) => ({
      key,
      label: origin.label,
      selected: system.origin === key
    }));

    context.classOptions = Object.entries(DND_CUSTOM.classes).map(([key, labelKey]) => ({
      key,
      label: labelKey,
      selected: system.class === key
    }));

    context.isSpellcaster = DND_CUSTOM.spellcastingClasses.includes(system.class);

    context.proficiencyBonus = proficiencyBonus(system.attributes.level);

    context.abilities = Object.entries(system.abilities).map(([key, ability]) => {
      const mod = abilityModifier(ability.value);
      return {
        key,
        label: DND_CUSTOM.abilities[key],
        value: ability.value,
        mod,
        modLabel: formatModifier(mod),
        save: {
          proficient: system.saves[key].proficient,
          mod: mod + (system.saves[key].proficient ? context.proficiencyBonus : 0)
        }
      };
    });

    context.skills = Object.entries(system.skills)
      .map(([key, skill]) => {
        const abilityMod = abilityModifier(system.abilities[skill.ability].value);
        const mod = abilityMod + (skill.proficient ? context.proficiencyBonus : 0);
        return {
          key,
          label: game.i18n.localize(DND_CUSTOM.skills[key]),
          ability: skill.ability,
          proficient: skill.proficient,
          mod,
          modLabel: formatModifier(mod)
        };
      })
      .sort((a, b) => a.label.localeCompare(b.label, game.i18n.lang));

    const items = this.actor.items.contents;
    context.weapons = items.filter((item) => item.type === "weapon");
    context.armors = items.filter((item) => item.type === "armor");
    context.gear = items.filter((item) => item.type === "gear");
    context.features = items.filter((item) => item.type === "feature");
    context.inventoryItems = items.filter((item) => ["weapon", "armor", "gear"].includes(item.type));

    // Répartit les armes/armures équipées dans leurs emplacements (main principale/secondaire,
    // armure, accessoires) pour l'onglet "Équipement".
    const equippedWeaponsAndArmor = [...context.weapons, ...context.armors].filter(
      (item) => item.system.equipped
    );
    context.equipment = {
      mainHand: equippedWeaponsAndArmor.find((item) => item.system.slot === "mainHand") ?? null,
      offHand: equippedWeaponsAndArmor.find((item) => item.system.slot === "offHand") ?? null,
      armor: equippedWeaponsAndArmor.find((item) => item.system.slot === "armor") ?? null,
      accessories: equippedWeaponsAndArmor.filter((item) => item.system.slot === "accessory")
    };

    context.carriedWeight = carriedWeight(context.inventoryItems);
    context.carryingCapacity = carryingCapacity(system.abilities.str.value);
    context.currencyTotalCopper = currencyTotalInCopper(system.currency);

    return context;
  }

  /** @override
   * Expose le tab actif de chaque PART sous `context.tab` (utilisé par les .hbs
   * pour poser `data-tab`/la classe CSS "active" sur leur élément racine).
   */
  async _preparePartContext(partId, context) {
    context = await super._preparePartContext(partId, context);
    if (context.tabs?.[partId]) context.tab = context.tabs[partId];
    return context;
  }

  /** Repos court : pas de mécanique automatisée pour l'instant (voir PROJECT.md, scope V1). */
  static async #onRestShort() {
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      content: game.i18n.format("DND_CUSTOM.Chat.RestShort", { name: this.actor.name })
    });
  }

  /** Repos long : soigne intégralement (SRD 5e, "Resting" - a long rest restores all hit points). */
  static async #onRestLong() {
    const hp = this.actor.system.attributes.hp;
    await this.actor.update({ "system.attributes.hp.value": hp.max });
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      content: game.i18n.format("DND_CUSTOM.Chat.RestLong", { name: this.actor.name })
    });
  }
}