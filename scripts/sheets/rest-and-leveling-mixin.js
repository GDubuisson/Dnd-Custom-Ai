import { DND_CUSTOM } from "../helpers/config.js";
import { spellSlotFillUpdates } from "../helpers/rules.js";
import { chooseSpellSlotRecovery } from "../helpers/spell-slot-choice.js";
import { grantClassContent } from "../helpers/class-content.js";
import { offerAbilityScoreOrFeatDialog } from "../helpers/level-up-choice.js";
import { offerSubclassChoiceDialog } from "../helpers/subclass-choice.js";

/** Mixin de fiche de personnage : repos, montée de niveau et ajustement manuel des caractéristiques. */
export function RestAndLevelingSheetMixin(Base) {
  return class RestAndLevelingSheet extends Base {
    static DEFAULT_OPTIONS = {
      actions: {
        restShort: RestAndLevelingSheet.#onRestShort,
        restLong: RestAndLevelingSheet.#onRestLong,
        levelUp: RestAndLevelingSheet.#onLevelUp,
        resolvePendingAsi: RestAndLevelingSheet.#onResolvePendingAsi,
        abilityIncrease: RestAndLevelingSheet.#onAbilityIncrease,
        abilityDecrease: RestAndLevelingSheet.#onAbilityDecrease
      }
    };

    /** Indique si le personnage est mort (repos impossibles). */
    #isDead() {
      return this.actor.system.attributes.death.failures >= 3;
    }
  
    /**
     * Repos court : rend la moitié des PV max et les emplacements de Pacte.
     * À partir du 4e repos court depuis le dernier repos long, ajoute 1 point d'Épuisement.
     */
    static async #onRestShort() {
      if (this.#isDead()) return;
      const attributes = this.actor.system.attributes;
      const shortRestCount = attributes.shortRestCount + 1;
      const gainsExhaustion = shortRestCount > 3;
      const updates = {
        "system.attributes.hp.value": Math.min(attributes.hp.value + Math.floor(attributes.hp.max / 2), attributes.hp.max),
        "system.attributes.shortRestCount": shortRestCount,
        ...(gainsExhaustion ? { "system.attributes.exhaustion": Math.min(6, attributes.exhaustion + 1) } : {})
      };
      if (this.actor.system.class === "warlock") Object.assign(updates, this.#spellSlotResetUpdates());
      // Seul flux joueur autorisé à modifier l'Épuisement.
      await this.actor.update(updates, { dndCustomExhaustionChange: true });
      await this.#resetFeatureUses(["shortRest"]);
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: this.actor }),
        content: game.i18n.format("DND_CUSTOM.Chat.RestShort", { name: this.actor.name })
      });
      if (gainsExhaustion) {
        await ChatMessage.create({
          speaker: ChatMessage.getSpeaker({ actor: this.actor }),
          content: game.i18n.format("DND_CUSTOM.Chat.TooManyShortRests", { name: this.actor.name, count: shortRestCount })
        });
      }
      await this.#offerSpellSlotRecoveries();
    }
  
    /** Récupération arcanique/naturelle au repos court ; la charge n'est consommée que si une répartition est validée. */
    async #offerSpellSlotRecoveries() {
      const features = this.actor.items.contents.filter(
        (item) => item.type === "feature" && item.system.recoversSpellSlots && item.system.uses.value > 0
      );
      for (const feature of features) {
        const roll = new Roll(feature.system.rollFormula, this.actor.getRollData());
        await roll.evaluate(); // NOSONAR : séquentiel voulu
        if (!roll.total) continue;
  
        const distribution = await chooseSpellSlotRecovery(feature.name, roll.total, this.actor.system.spells.slots); // NOSONAR : séquentiel voulu
        if (!distribution) continue;
  
        const slotUpdates = {};
        const parts = [];
        for (const [level, amount] of Object.entries(distribution)) {
          const slot = this.actor.system.spells.slots[level];
          slotUpdates[`system.spells.slots.${level}.value`] = Math.min(slot.max, slot.value + amount);
          parts.push(game.i18n.format("DND_CUSTOM.Spells.RecoveryLevelResult", { level, amount }));
        }
        await this.actor.update(slotUpdates); // NOSONAR : séquentiel voulu
        await feature.update({ "system.uses.value": 0 }); // NOSONAR : séquentiel voulu
        await ChatMessage.create({ // NOSONAR : séquentiel voulu
          speaker: ChatMessage.getSpeaker({ actor: this.actor }),
          content: game.i18n.format("DND_CUSTOM.Chat.SpellSlotsRecovered", {
            name: this.actor.name,
            feature: feature.name,
            list: parts.join(", ")
          })
        });
      }
    }
  
    /** Repos long : réduit l'Épuisement de 1, rend tous les PV, emplacements et charges. */
    static async #onRestLong() {
      if (this.#isDead()) return;

      // Épuisement réduit d'abord : les PV max en dépendent.
      if (this.actor.system.attributes.exhaustion > 0) {
        await this.actor.update(
          { "system.attributes.exhaustion": this.actor.system.attributes.exhaustion - 1 },
          { dndCustomExhaustionChange: true }
        );
      }

      const updates = {
        "system.attributes.hp.value": this.actor.system.attributes.hp.max,
        // Remise à zéro du compteur de repos courts.
        "system.attributes.shortRestCount": 0,
        ...this.#spellSlotResetUpdates()
      };
      await this.actor.update(updates, { dndCustomExhaustionChange: true });
      // Le repos long inclut les bénéfices du repos court.
      await this.#resetFeatureUses(["shortRest", "longRest"]);
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: this.actor }),
        content: game.i18n.format("DND_CUSTOM.Chat.RestLong", { name: this.actor.name })
      });
    }
  
    #spellSlotResetUpdates() {
      return spellSlotFillUpdates(this.actor);
    }
  
    /** Recharge les Capacités dont le type de récupération figure dans `rechargeTypes`. */
    async #resetFeatureUses(rechargeTypes) {
      const updates = this.actor.items.contents
        .filter(
          (item) =>
            item.type === "feature" && item.system.uses.max > 0 && rechargeTypes.includes(item.system.uses.recharge)
        )
        .map((item) => ({ _id: item.id, "system.uses.value": item.system.uses.max }));
      if (updates.length) await this.actor.updateEmbeddedDocuments("Item", updates);
    }
  
    /** Boutons +/- d'une caractéristique de base (MJ). */
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
  
    /** Monte d'un niveau : rend les PV, remplit les emplacements, octroie le contenu et propose les choix dus. */
    static async #onLevelUp() {
      const system = this.actor.system;
      const next = system.attributes.level + 1;
      await this.actor.update({ "system.attributes.level": next }, { dndCustomLevelUp: true });
      await this.actor.update({
        "system.attributes.hp.value": this.actor.system.attributes.hp.max,
        ...spellSlotFillUpdates(this.actor)
      });
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: this.actor }),
        content: game.i18n.format("DND_CUSTOM.Chat.LevelUp", { name: this.actor.name, level: next })
      });
  
      // Capacités et Sorts du nouveau niveau, annoncés en chat.
      const grantedNames = await grantClassContent(this.actor, this.actor.system.class, next);
      if (grantedNames.length) {
        await ChatMessage.create({
          speaker: ChatMessage.getSpeaker({ actor: this.actor }),
          content: game.i18n.format("DND_CUSTOM.Chat.ClassContentGranted", {
            name: this.actor.name,
            names: grantedNames.join(", ")
          })
        });
      }
  
      // Choix de sous-classe au niveau requis.
      await offerSubclassChoiceDialog(this.actor, this.actor.system.class, next);
  
      // Amélioration/Don à ce niveau, plus les choix encore dus.
      if (DND_CUSTOM.abilityScoreImprovementLevels.includes(next)) {
        await this.actor.update({ "system.attributes.pendingAsiChoices": this.actor.system.attributes.pendingAsiChoices + 1 });
      }
      await this.#resolvePendingAsiChoices();
    }
  
    /** Repropose les choix Amélioration/Don dus, jusqu'à une fermeture sans choix. */
    async #resolvePendingAsiChoices() {
      while (this.actor.system.attributes.pendingAsiChoices > 0) {
        const applied = await offerAbilityScoreOrFeatDialog(this.actor); // NOSONAR : séquentiel voulu
        if (!applied) return;
        await this.actor.update({ "system.attributes.pendingAsiChoices": this.actor.system.attributes.pendingAsiChoices - 1 }); // NOSONAR : séquentiel voulu
      }
    }
  
    /** Bouton d'en-tête pour résoudre un choix Amélioration/Don dû. */
    static async #onResolvePendingAsi() {
      await this.#resolvePendingAsiChoices();
    }
  };
}
