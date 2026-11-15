import { DND_CUSTOM } from "../helpers/config.js";
import { formatModifier, formatAttackLabels, hitPointsPercent, parenthesized } from "../helpers/rules.js";
import { rollCheck, rollDamage } from "../helpers/rolls.js";
import { openAwardXpDialog } from "../helpers/xp.js";
import { checkSentinelReminder } from "../helpers/sentinel.js";
import { checkGiantKillerReminder } from "../helpers/giant-killer.js";
import { recordAttackOnTargets } from "../helpers/hunters-defense.js";
import { PENDING_OPPORTUNITY_DISADVANTAGE_FLAG } from "../helpers/opportunity-attack.js";
import { isDisadvantagedByHuntedTarget } from "../helpers/relentless-hunter.js";
import { InventoryDragDropMixin } from "./inventory-drag-drop.js";
import { conditionsContext } from "../helpers/sheet-conditions.js";
import { damageAffinityGroups } from "../helpers/damage-affinity.js";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

const SYSTEM_ID = "dnd-custom-ai";

/** Fiche de PNJ (stats simplifiées), aussi utilisée pour les montures et formes sauvages ; onglet Butin. */
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
      awardXp: DndCustomNpcSheet.#onAwardXp,
      rollAttack: DndCustomNpcSheet.#onRollAttack,
      rollAttackDamage: DndCustomNpcSheet.#onRollAttackDamage,
      addNpcAttack: DndCustomNpcSheet.#onAddNpcAttack,
      removeNpcAttack: DndCustomNpcSheet.#onRemoveNpcAttack
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

  /** @override Contexte commun : options SRD (type, taille, FI) et bonus déjà formatés. */
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

    context.hpPercent = hitPointsPercent(system.attributes.hp);

    // La sauvegarde vaut le bonus de caractéristique.
    context.abilities = Object.entries(system.abilities).map(([key, ability]) => ({
      key,
      label: DND_CUSTOM.abilities[key],
      mod: ability.mod,
      modLabel: formatModifier(ability.mod)
    }));

    const items = this.actor.items.contents;
    context.lootItems = items.filter((item) => ["weapon", "armor", "gear", "tool"].includes(item.type));

    // Profils d'attaque avec `index` (boutons, champs `system.attacks.N`) et libellés formatés.
    context.attacks = system.attacks.map((attack, index) => {
      const attackAbilityMod = system.abilities[attack.ability]?.mod ?? 0;
      return {
        index,
        name: attack.name,
        defaultName: game.i18n.localize("DND_CUSTOM.Npc.AttackDefaultName"),
        abilityOptions: ["str", "dex"].map((key) => ({
          key,
          label: DND_CUSTOM.abilities[key],
          selected: attack.ability === key
        })),
        bonus: attack.bonus,
        damageDice: attack.damage.dice,
        damageBonus: attack.damage.bonus,
        damageTypeOptions: [
          { key: "", label: "", selected: !attack.damage.type },
          ...Object.entries(DND_CUSTOM.damageTypes).map(([key, label]) => ({
            key,
            label,
            selected: attack.damage.type === key
          }))
        ],
        ...formatAttackLabels(attack, attackAbilityMod),
        // Attaque magique.
        magic: attack.magic,
        // Dégâts secondaires optionnels (dés fixes).
        secondaryDamageDice: attack.secondaryDamage.dice,
        secondaryDamageTypeOptions: [
          { key: "", label: "", selected: !attack.secondaryDamage.type },
          ...Object.entries(DND_CUSTOM.damageTypes).map(([key, label]) => ({
            key,
            label,
            selected: attack.secondaryDamage.type === key
          }))
        ]
      };
    });

    // Cases d'affinités aux dégâts (champs à la racine de `system`).
    context.damageAffinityGroups = damageAffinityGroups(system);

    // États, et résumé des états actifs du libellé replié.
    Object.assign(context, conditionsContext(this.actor));

    return context;
  }

  /** Jet de caractéristique (1d20 + bonus), qui sert aussi de sauvegarde. */
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

  /** Bascule un état via `Actor#toggleStatusEffect`. */
  static async #onToggleCondition(event, target) {
    await this.actor.toggleStatusEffect(target.dataset.key);
  }

  /** Jet d'initiative natif. */
  static async #onRollInitiative() {
    await this.actor.rollInitiative({ createCombatants: true });
  }

  /**
   * Jet d'attaque du profil `target.dataset.index` contre la CA des cibles, avec avantage/désavantage
   * (Échappée de la horde, Traque implacable), critique mémorisé par attaque et rappels de réaction.
   */
  static async #onRollAttack(event, target) {
    const index = Number(target.dataset.index);
    const attack = this.actor.system.attacks[index];
    if (!attack) return;
    const abilityMod = this.actor.system.abilities[attack.ability]?.mod ?? 0;
    const hasPendingOpportunityDisadvantage = Boolean(this.actor.getFlag(SYSTEM_ID, PENDING_OPPORTUNITY_DISADVANTAGE_FLAG));
    // `setFlag(false)` car `unsetFlag` ne persiste pas sur un token non lié.
    if (hasPendingOpportunityDisadvantage) await this.actor.setFlag(SYSTEM_ID, PENDING_OPPORTUNITY_DISADVANTAGE_FLAG, false);
    const { isCriticalHit } = await rollCheck({
      actor: this.actor,
      formula: formatModifier(abilityMod + attack.bonus),
      flavor: game.i18n.format("DND_CUSTOM.Roll.WeaponAttack", {
        weapon: attack.name || game.i18n.localize("DND_CUSTOM.Npc.AttackDefaultName")
      }),
      advantage: event.shiftKey,
      disadvantage: event.ctrlKey || hasPendingOpportunityDisadvantage || isDisadvantagedByHuntedTarget(this.actor),
      compareToTargetAc: true,
      criticalRules: true
    });
    if (isCriticalHit) {
      const pending = this.actor.getFlag(SYSTEM_ID, "pendingAttackCritical") ?? {};
      await this.actor.setFlag(SYSTEM_ID, "pendingAttackCritical", { ...pending, [index]: true });
    }
    await checkSentinelReminder(this.actor);
    await checkGiantKillerReminder(this.actor);
    await recordAttackOnTargets(this.actor);
  }

  /** Jet de dégâts du profil `target.dataset.index` : dés + modificateur + bonus fixe. */
  static async #onRollAttackDamage(event, target) {
    const index = Number(target.dataset.index);
    const attack = this.actor.system.attacks[index];
    if (!attack?.damage.dice) return;
    const abilityMod = this.actor.system.abilities[attack.ability]?.mod ?? 0;
    const damageTypeLabel = attack.damage.type ? game.i18n.localize(DND_CUSTOM.damageTypes[attack.damage.type]) : "";
    const pending = this.actor.getFlag(SYSTEM_ID, "pendingAttackCritical") ?? {};
    const critical = Boolean(pending[index]);
    if (critical) {
      // Suppression de clé `-=` : une fusion d'objet ne retirerait pas l'index.
      await this.actor.update({ [`flags.${SYSTEM_ID}.pendingAttackCritical.-=${index}`]: null });
    }
    await rollDamage({
      actor: this.actor,
      dice: attack.damage.dice,
      formula: formatModifier(abilityMod + attack.damage.bonus),
      flavor: `${game.i18n.format("DND_CUSTOM.Roll.WeaponDamage", {
        weapon: attack.name || game.i18n.localize("DND_CUSTOM.Npc.AttackDefaultName")
      })}${parenthesized(damageTypeLabel)}`,
      critical,
      damageType: attack.damage.type,
      isMagicalSource: attack.magic
    });

    // Dégâts secondaires : message distinct, sans modificateur, critique appliqué.
    if (attack.secondaryDamage.dice) {
      const secondaryDamageTypeLabel = attack.secondaryDamage.type
        ? game.i18n.localize(DND_CUSTOM.damageTypes[attack.secondaryDamage.type])
        : "";
      await rollDamage({
        actor: this.actor,
        dice: attack.secondaryDamage.dice,
        formula: "",
        flavor: `${game.i18n.format("DND_CUSTOM.Roll.WeaponDamage", {
          weapon: attack.name || game.i18n.localize("DND_CUSTOM.Npc.AttackDefaultName")
        })}${parenthesized(secondaryDamageTypeLabel)}`,
        critical,
        damageType: attack.secondaryDamage.type,
        isMagicalSource: attack.magic
      });
    }
  }

  /** Ajoute un profil d'attaque vierge. */
  static async #onAddNpcAttack() {
    await this.actor.update({ "system.attacks": [...this.actor.system.attacks, {}] });
  }

  /** Retire le profil d'attaque `target.dataset.index`. */
  static async #onRemoveNpcAttack(event, target) {
    const index = Number(target.dataset.index);
    const attacks = this.actor.system.attacks.filter((_, i) => i !== index);
    await this.actor.update({ "system.attacks": attacks });
  }

  /** Ouvre le dialogue d'XP pré-rempli avec l'XP rapporté du PNJ. */
  static async #onAwardXp() {
    await openAwardXpDialog({ defaultAmount: this.actor.system.xpReward });
  }
}