import { DND_CUSTOM } from "../helpers/config.js";
import {
  abilityModifier,
  proficiencyBonus,
  carryingCapacity,
  carryingCapacityBonus,
  carriedWeight,
  currencyTotalInCopper,
  formatModifier,
  passivePerception,
  skillModifier,
  spellSaveDC,
  spellAttackBonus
} from "../helpers/rules.js";
import { InventoryDragDropMixin } from "./inventory-drag-drop.js";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

const SYSTEM_ID = "dnd-custom-ai";

/** Feuille de personnage joueur : un onglet Handlebars par PART, ApplicationV2/ActorSheetV2.
 *  Le glisser-déposer d'objets (InventoryDragDropMixin) permet de transférer un objet vers/
 *  depuis un autre Actor ouvert (ex. la fiche d'un véhicule). */
export class DndCustomActorSheet extends InventoryDragDropMixin(HandlebarsApplicationMixin(ActorSheetV2)) {
  static DEFAULT_OPTIONS = {
    classes: [SYSTEM_ID, "sheet", "actor", "character"],
    tag: "form",
    position: { width: 720, height: 720 },
    window: { resizable: true },
    form: { submitOnChange: true, closeOnSubmit: false },
    actions: {
      restShort: DndCustomActorSheet.#onRestShort,
      restLong: DndCustomActorSheet.#onRestLong,
      abilityIncrease: DndCustomActorSheet.#onAbilityIncrease,
      abilityDecrease: DndCustomActorSheet.#onAbilityDecrease,
      useItem: DndCustomActorSheet.#onUseItem
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
    context.isGM = game.user.isGM;
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

    // Origine choisie : bonus de caractéristiques déjà appliqués dans system.abilities.*.total
    // (cf. CharacterData#prepareDerivedData) ; avantage de compétences et trait spécial sont
    // purement informatifs (pas de système de jet de dés automatisé sur cette fiche).
    const currentOrigin = context.origins[system.origin] ?? null;
    const originAbilityBonuses = currentOrigin?.abilityBonuses ?? {};
    const originSkillAdvantages = new Set(currentOrigin?.skillAdvantages ?? []);
    context.originTrait = currentOrigin?.specialTrait ?? null;

    const hp = system.attributes.hp;
    context.hpPercent = Math.max(0, Math.min(100, Math.round((hp.value / (hp.max || 1)) * 100)));

    context.proficiencyBonus = proficiencyBonus(system.attributes.level);

    const dexMod = abilityModifier(system.abilities.dex.total);
    context.initiative = { mod: dexMod, modLabel: formatModifier(dexMod) };

    const wisMod = abilityModifier(system.abilities.wis.total);
    context.passivePerception = passivePerception(
      wisMod,
      system.skills.perception.proficient,
      context.proficiencyBonus
    );

    if (context.isSpellcaster) {
      const spellAbility = DND_CUSTOM.spellcastingAbility[system.class];
      const spellAbilityMod = abilityModifier(system.abilities[spellAbility].total);
      context.spellcasting = {
        ability: spellAbility,
        abilityLabel: DND_CUSTOM.abilities[spellAbility],
        dc: spellSaveDC(context.proficiencyBonus, spellAbilityMod),
        attackBonus: spellAttackBonus(context.proficiencyBonus, spellAbilityMod),
        attackBonusLabel: formatModifier(spellAttackBonus(context.proficiencyBonus, spellAbilityMod))
      };
    }

    context.abilities = Object.entries(system.abilities).map(([key, ability]) => {
      const mod = abilityModifier(ability.total);
      const originBonus = originAbilityBonuses[key] ?? 0;
      return {
        key,
        label: DND_CUSTOM.abilities[key],
        value: ability.value,
        total: ability.total,
        originBonus,
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
        const abilityMod = abilityModifier(system.abilities[skill.ability].total);
        const mod = abilityMod + (skill.proficient ? context.proficiencyBonus : 0);
        return {
          key,
          label: game.i18n.localize(DND_CUSTOM.skills[key]),
          originAdvantage: originSkillAdvantages.has(key),
          // Désavantage imposé par l'armure équipée (SRD 5e) : ne concerne que la Discrétion
          // (cf. CharacterData#prepareDerivedData > this.stealthDisadvantage).
          armorDisadvantage: key === "stealth" && system.stealthDisadvantage,
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
    // Onglet Inventaire scindé en deux tableaux : Armes/Armures (emplacements d'équipement,
    // cf. context.equipment) d'un côté, Objets/Outils de l'autre.
    context.weaponsAndArmor = items.filter((item) => ["weapon", "armor"].includes(item.type));
    context.gearAndTools = items.filter((item) => ["gear", "tool"].includes(item.type));
    context.inventoryItems = items.filter((item) =>
      ["weapon", "armor", "gear", "tool"].includes(item.type)
    );

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
    context.carryingCapacity =
      carryingCapacity(system.abilities.str.total, "kg") + carryingCapacityBonus(context.inventoryItems);
    context.carryingCapacityPercent = Math.min(
      100,
      Math.round((context.carriedWeight / (context.carryingCapacity || 1)) * 100)
    );
    context.overCapacity = context.carriedWeight > context.carryingCapacity;
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

  /** Repos court (simplifié, pas de dés de vie) : récupère la moitié des PV max, sans dépasser le max. */
  static async #onRestShort() {
    const hp = this.actor.system.attributes.hp;
    const newValue = Math.min(hp.value + Math.floor(hp.max / 2), hp.max);
    await this.actor.update({ "system.attributes.hp.value": newValue });
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

  /** Boutons +/- des caractéristiques (réservés au MJ, cf. `isGM` dans le template) :
   *  modifient la valeur de base ; le bonus d'origine reste appliqué séparément
   *  (cf. CharacterData#prepareDerivedData). */
  static async #onAbilityIncrease(event, target) {
    await this.#adjustAbility(target.dataset.key, 1);
  }

  static async #onAbilityDecrease(event, target) {
    await this.#adjustAbility(target.dataset.key, -1);
  }

  async #adjustAbility(key, delta) {
    const current = this.actor.system.abilities[key].value;
    const next = Math.max(1, current + delta);
    if (next === current) return;
    await this.actor.update({ [`system.abilities.${key}.value`]: next });
  }

  /** Bouton "Utiliser" de l'inventaire (objets `gear` avec `system.use.type` renseigné) :
   *  "light" allume/éteint la source sur le(s) token(s) de l'Actor sur la scène active,
   *  "heal" rend (healBase + bonus de compétence) PV. */
  static async #onUseItem(event, target) {
    const itemId = target.closest("[data-item-id]")?.dataset.itemId;
    const item = this.actor.items.get(itemId);
    const use = item?.system.use;
    if (!use || use.type === "none") return;

    if (use.type === "light") return DndCustomActorSheet.#toggleLight(this.actor, item);
    if (use.type === "heal") return DndCustomActorSheet.#applyHeal(this.actor, item);
  }

  static async #toggleLight(actor, item) {
    const tokens = actor.getActiveTokens();
    if (!tokens.length) {
      ui.notifications.warn(game.i18n.localize("DND_CUSTOM.Inventory.NoTokenOnScene"));
      return;
    }

    const turningOn = !item.system.lit;
    if (turningOn) {
      // Un token n'a qu'une seule configuration de lumière active : éteindre toute autre
      // source déjà allumée sur cet Actor avant d'allumer celle-ci.
      const others = actor.items.contents.filter(
        (other) => other.id !== item.id && other.type === "gear" && other.system.use.type === "light" && other.system.lit
      );
      if (others.length) {
        await actor.updateEmbeddedDocuments(
          "Item",
          others.map((other) => ({ _id: other.id, "system.lit": false }))
        );
      }
    }

    await item.update({ "system.lit": turningOn });

    // `dim` est stocké comme rayon SUPPLÉMENTAIRE au-delà de `bright` (formulation SRD) ;
    // le champ `light.dim` du token attend lui un rayon total depuis le token.
    const light = turningOn
      ? { bright: item.system.use.light.bright, dim: item.system.use.light.bright + item.system.use.light.dim }
      : { bright: 0, dim: 0 };
    for (const token of tokens) await token.document.update({ light });

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: game.i18n.format(turningOn ? "DND_CUSTOM.Chat.UseLightOn" : "DND_CUSTOM.Chat.UseLightOff", {
        name: actor.name,
        item: item.name
      })
    });
  }

  static async #applyHeal(actor, item) {
    const use = item.system.use;
    const bonus = skillModifier(actor.system, use.healSkill || "medicine", proficiencyBonus(actor.system.attributes.level));
    const amount = Math.max(0, use.healBase + bonus);

    const hp = actor.system.attributes.hp;
    await actor.update({ "system.attributes.hp.value": Math.min(hp.value + amount, hp.max) });

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: game.i18n.format("DND_CUSTOM.Chat.UseHeal", { name: actor.name, item: item.name, amount })
    });
  }
}