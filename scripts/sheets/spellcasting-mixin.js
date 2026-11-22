import { DND_CUSTOM } from "../helpers/config.js";
import {
  abilityModifier,
  proficiencyBonus,
  formatModifier,
  hasFeature,
  spellSaveDC,
  spellAttackBonus,
  targetSaveModifier,
  parenthesized
} from "../helpers/rules.js";
import { d20Die, rollCheck, rollDamage, rollHeal, sheetRollFlags } from "../helpers/rolls.js";
import { attackRollOptions, conditionRollEffects } from "../helpers/roll-modifiers.js";
import { setTokensLight } from "../helpers/token-light.js";
import { itemFromTarget } from "../helpers/sheet-items.js";
import { consumeActionEconomy } from "../helpers/action-economy.js";
import { chooseSpellSlotLevel } from "../helpers/spell-slot-choice.js";
import { chooseMetamagicOption } from "../helpers/metamagic.js";
import { chooseSculptSpellsTarget } from "../helpers/sculpt-spells.js";
import { rollWildSurge } from "../helpers/wild-magic-tables.js";
import { recordAttackOnTargets, hasMultiattackDefenseAdvantage, hasSteadfastAdvantage } from "../helpers/hunters-defense.js";
import { requestActorUpdate, requestToggleStatusEffect } from "../helpers/actor-relay.js";

const SYSTEM_ID = "dnd-custom-ai";

/** Caractéristique d'incantation : celle de la classe, ou le Charisme pour une classe non lanceuse (sorts d'Éclat). */
function spellcastingAbilityKey(classKey) {
  return DND_CUSTOM.spellcastingAbility[classKey] ?? "cha";
}

// Capacités d'Incantation rituelle : sorts rituels lancés sans emplacement.
const RITUAL_CASTING_FEATURES = ["Incantation rituelle (Clerc)", "Incantation rituelle (Druide)"];

/** Mémorise sur la cible le résultat de sa sauvegarde contre ce sort, via le relais MJ, pour les dégâts. */
function setPendingSpellSaveOutcome(targetActor, item, success) {
  return requestActorUpdate(targetActor, {
    [`flags.${SYSTEM_ID}.pendingSpellSaveOutcome`]: {
      success,
      halfOnSave: item.system.save.halfOnSave,
      ability: item.system.save.ability,
      spellLevel: item.system.level,
      spellName: item.name
    }
  });
}

/** Jet de sauvegarde d'une cible contre un sort ; Sort Élevé impose le désavantage et annule son avantage. */
async function rollSpellSaveForTarget(casterActor, item, targetActor, { dc, abilityLabel, heightened }) {
  const mod = targetSaveModifier(targetActor.system, item.system.save.ability);
  // Avantage de la cible : Défense contre les attaques multiples ou Volonté de fer.
  const multiattackDefense = hasMultiattackDefenseAdvantage(targetActor, casterActor);
  const hasDefenseAdvantage =
    (multiattackDefense || hasSteadfastAdvantage(targetActor, item.system.save.appliesCondition)) && !heightened;
  const useDisadvantage = heightened && !multiattackDefense;
  const roll = new Roll(`${d20Die(hasDefenseAdvantage, useDisadvantage)}${formatModifier(mod)}`);
  await roll.evaluate();
  const success = roll.total >= dc;
  // État appliqué sur échec.
  if (!success && item.system.save.appliesCondition) {
    await requestToggleStatusEffect(targetActor, item.system.save.appliesCondition, true);
  }
  await setPendingSpellSaveOutcome(targetActor, item, success);
  const successKey = item.system.save.halfOnSave ? "DND_CUSTOM.Roll.SaveSuccessHalf" : "DND_CUSTOM.Roll.SaveSuccess";
  const resultKey = success ? successKey : "DND_CUSTOM.Roll.SaveFail";
  await roll.toMessage({
    speaker: ChatMessage.getSpeaker({ actor: targetActor }),
    flavor:
      game.i18n.format(resultKey, { name: targetActor.name, spell: item.name, ability: abilityLabel, dc }) +
      parenthesized(hasDefenseAdvantage ? game.i18n.localize("DND_CUSTOM.Roll.Advantage") : ""),
    flags: sheetRollFlags({ savingThrowRoll: true })
  });
}

/**
 * Sauvegarde d'une cible contre un sort : réussite automatique (Sort Prudent, Sculpteur de sorts)
 * ou jet, résultat mémorisé dans les deux cas.
 * @param {Actor} casterActor
 * @param {Item} item - sort lancé
 * @param {Actor} targetActor
 * @param {object} save
 * @param {number} save.dc
 * @param {string} save.abilityLabel - caractéristique localisée
 * @param {"careful"|"heightened"|null} save.metamagicOption - métamagie appliquée à cette cible
 * @param {boolean} save.sculpted - cible protégée par Sculpteur de sorts
 */
async function resolveSpellSaveForTarget(casterActor, item, targetActor, { dc, abilityLabel, metamagicOption, sculpted }) {
  let autoSuccessKey = null;
  if (metamagicOption === "careful") autoSuccessKey = "DND_CUSTOM.Roll.MetamagicCarefulSuccess";
  else if (sculpted) autoSuccessKey = "DND_CUSTOM.Roll.SculptSpellsSuccess";
  if (!autoSuccessKey) {
    await rollSpellSaveForTarget(casterActor, item, targetActor, { dc, abilityLabel, heightened: metamagicOption === "heightened" });
    return;
  }
  await setPendingSpellSaveOutcome(targetActor, item, true);
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: targetActor }),
    content: game.i18n.format(autoSuccessKey, { name: targetActor.name, spell: item.name })
  });
}

/** Mixin de fiche de personnage : incantation (coût, concentration, lumière, effet par type de sort) et dégâts de sort. */
export function SpellcastingSheetMixin(Base) {
  return class SpellcastingSheet extends Base {
    static DEFAULT_OPTIONS = {
      actions: {
        castSpell: SpellcastingSheet.#onCastSpell,
        rollSpellDamage: SpellcastingSheet.#onRollSpellDamage,
        dropConcentration: SpellcastingSheet.#onDropConcentration
      }
    };

  
    /** Lance un sort : coût en emplacement, concentration, lumière, puis effet selon son type (attaque, sauvegarde, soin, état). */
    static async #onCastSpell(event, target) {
      const item = itemFromTarget(this.actor, target);
      if (item?.type !== "spell") return;
      if (!(await consumeActionEconomy(this.actor, item))) return;
  
      const effectiveSpellLevel = await this.#resolveSpellSlotCost(item);
      if (effectiveSpellLevel === null) return;
  
      await this.#applySpellConcentration(item);
  
      // Sort lumineux : allume les tokens du lanceur, qui annonce déjà le lancer.
      const hasLight = Boolean(item.system.light?.bright || item.system.light?.dim);
      if (hasLight) {
        await setTokensLight(this.actor, item.name, item.system.light);
        if (!item.system.attack) return;
      }
  
      if (item.system.attack) {
        await this.#castAttackSpell(item, event);
        return;
      }
  
      if (item.system.save?.ability) {
        await this.#castSaveSpell(item, event);
        return;
      }
  
      if (item.system.heal?.dice) {
        await this.#castHealSpell(item, effectiveSpellLevel);
        return;
      }
  
      if (item.system.grantsCondition) await this.#applySpellCondition(item);
  
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: this.actor }),
        content: game.i18n.format("DND_CUSTOM.Chat.CastSpell", { name: this.actor.name, spell: item.name })
      });
    }
  
    /**
     * Dépense l'emplacement du lancer (surclassement possible) sauf sort gratuit (rituel, sous-classe, Magie d'initié).
     * @returns {Promise<number|null>} palier dépensé, `null` si aucun emplacement disponible
     */
    async #resolveSpellSlotCost(item) {
      // Sort rituel gratuit avec la Capacité Incantation rituelle de la classe.
      const castsAsFreeRitual =
        item.system.ritual && RITUAL_CASTING_FEATURES.some((name) => hasFeature(this.actor.items.contents, name));
      const grantingFeatures = this.actor.items.filter(
        (feature) => feature.type === "feature" && feature.system.grantsSpells?.has?.(item.name)
      );
      // Don à utilisations limitées (Éclats) : gratuit tant qu'il lui reste une utilisation.
      const isLimitedGrant = (feature) => !feature.system.class && feature.system.uses?.max > 0;
      // Sorts accordés par une Capacité de sous-classe : toujours gratuits.
      const castsAsFreeSubclassSpell = grantingFeatures.some((feature) => !isLimitedGrant(feature));
      const limitedGrantFeature = grantingFeatures.find(
        (feature) => isLimitedGrant(feature) && feature.system.uses.value > 0
      );
      // Sort de Magie d'initié : gratuit une fois par repos long.
      const initiateFeature = this.actor.items.find(
        (feature) => feature.type === "feature" && feature.system.chosenLevelOneSpell === item.name
      );
      const castsAsFreeInitiateSpell = initiateFeature?.system.uses.value > 0;
      // Palier réellement dépensé (bonus de Disciple de la vie).
      let effectiveSpellLevel = item.system.level;
      const castsForFree = castsAsFreeRitual || castsAsFreeSubclassSpell || castsAsFreeInitiateSpell || !!limitedGrantFeature;
      if (item.system.level > 0 && !castsForFree) {
        const slots = this.actor.system.spells.slots;
        // Palier exact, ou surclassement choisi ; `null` si impossible ou annulé.
        const chosenLevel = await chooseSpellSlotLevel(item.name, item.system.level, slots);
        if (chosenLevel === null) {
          ui.notifications.warn(game.i18n.localize("DND_CUSTOM.Spells.NoSlotAvailable"));
          return null;
        }
        effectiveSpellLevel = chosenLevel;
        await this.actor.update({ [`system.spells.slots.${chosenLevel}.value`]: slots[chosenLevel].value - 1 });
  
        // Magie sauvage (Ensorceleur) : Surtenance sauvage à chaque emplacement dépensé.
        if (this.actor.system.subclass === "wildSorcery") await rollWildSurge(this.actor, "sorcerer");
      } else if (item.system.level > 0 && castsAsFreeInitiateSpell) {
        await initiateFeature.update({ "system.uses.value": 0 });
      } else if (item.system.level > 0 && limitedGrantFeature && !castsAsFreeRitual && !castsAsFreeSubclassSpell) {
        await limitedGrantFeature.update({ "system.uses.value": limitedGrantFeature.system.uses.value - 1 });
      }
      return effectiveSpellLevel;
    }
  
    /** Concentration : le nouveau sort remplace celui en cours. */
    async #applySpellConcentration(item) {
      if (!item.system.concentration) return;
      const previous = this.actor.system.spells.concentratingOn;
      await this.actor.update({ "system.spells.concentratingOn": item.name });
      if (previous && previous !== item.name) {
        await ChatMessage.create({
          speaker: ChatMessage.getSpeaker({ actor: this.actor }),
          content: game.i18n.format("DND_CUSTOM.Chat.ConcentrationBroken", { name: this.actor.name, spell: previous })
        });
      }
    }
  
    /** Jet d'attaque de sort ; un critique est mémorisé pour les dégâts de ce sort. */
    async #castAttackSpell(item, event) {
      const system = this.actor.system;
      const spellAbility = spellcastingAbilityKey(system.class);
      const spellAbilityMod = spellAbility ? abilityModifier(system.abilities[spellAbility].total) : 0;
      const attackBonus = spellAttackBonus(proficiencyBonus(system.attributes.level), spellAbilityMod);
      const cond = conditionRollEffects(this.actor, "attack");
      const { isCriticalHit } = await rollCheck({
        actor: this.actor,
        formula: formatModifier(attackBonus) + cond.bonus,
        flavor: game.i18n.format("DND_CUSTOM.Roll.SpellAttack", { spell: item.name }),
        ...attackRollOptions(this.actor, event, cond)
      });
      if (isCriticalHit) await item.setFlag(SYSTEM_ID, "pendingCritical", true);
      await recordAttackOnTargets(this.actor);
    }
  
    /** Sort à sauvegarde : jet automatique de chaque cible contre le DD du lanceur, résultat mémorisé pour les dégâts. */
    async #castSaveSpell(item, event) {
      const system = this.actor.system;
      const spellAbility = spellcastingAbilityKey(system.class);
      const spellAbilityMod = spellAbility ? abilityModifier(system.abilities[spellAbility].total) : 0;
      const dc = spellSaveDC(proficiencyBonus(system.attributes.level), spellAbilityMod);
      const abilityLabel = game.i18n.localize(DND_CUSTOM.abilities[item.system.save.ability]);
      const targets = Array.from(game.user.targets);
  
      if (!targets.length) {
        await ChatMessage.create({
          speaker: ChatMessage.getSpeaker({ actor: this.actor }),
          content: game.i18n.format("DND_CUSTOM.Chat.SaveSpellNoTarget", { spell: item.name, ability: abilityLabel, dc })
        });
        return;
      }
  
      // Métamagie : Sort Prudent (Maj) ou Sort Élevé (Ctrl) sur une cible.
      const metamagic = await chooseMetamagicOption(this.actor, targets, {
        careful: event.shiftKey,
        heightened: event.ctrlKey
      });
      // Sculpteur de sorts : Maj-clic gratuit.
      const sculptedTargetId = await chooseSculptSpellsTarget(this.actor, targets, { careful: event.shiftKey });
  
      for (const token of targets) {
        const targetActor = token.actor;
        if (!targetActor?.system?.abilities) continue;
        await resolveSpellSaveForTarget(this.actor, item, targetActor, { // NOSONAR : séquentiel voulu
          dc,
          abilityLabel,
          metamagicOption: metamagic?.targetActorId === targetActor.id ? metamagic.option : null,
          sculpted: sculptedTargetId === targetActor.id
        });
      }
    }

    /** Sort de soin : dés + modificateur d'incantation, avec bouton « Appliquer le soin ». */
    async #castHealSpell(item, effectiveSpellLevel) {
      const system = this.actor.system;
      const spellAbility = spellcastingAbilityKey(system.class);
      const spellAbilityMod = spellAbility ? abilityModifier(system.abilities[spellAbility].total) : 0;
      // Disciple de la vie : +2 + palier au-delà du 1er, sorts de niveau 1+.
      const disciplineOfLifeBonus =
        effectiveSpellLevel >= 1 && hasFeature(this.actor.items.contents, "Disciple de la vie")
          ? 2 + (effectiveSpellLevel - 1)
          : 0;
      await rollHeal({
        actor: this.actor,
        dice: item.system.heal.dice,
        formula: formatModifier(spellAbilityMod + disciplineOfLifeBonus),
        flavor: game.i18n.format("DND_CUSTOM.Roll.SpellHeal", { spell: item.name })
      });
    }
  
    /** Pose l'état du sort sur chaque cible ciblée, sans jet. */
    async #applySpellCondition(item) {
      const targets = Array.from(game.user.targets);
      if (!targets.length) {
        ui.notifications.warn(game.i18n.localize("DND_CUSTOM.Chat.NoTarget"));
        return;
      }
      for (const token of targets) {
        if (!token.actor) continue;
        // Relais MJ : la cible peut ne pas appartenir au lanceur.
        await requestToggleStatusEffect(token.actor, item.system.grantsCondition, true); // NOSONAR : séquentiel voulu
      }
    }
  
  
    /** Jet de dégâts d'un sort, avec bonus de Salve implacable ou d'Affinité élémentaire. */
    static async #onRollSpellDamage(event, target) {
      const item = itemFromTarget(this.actor, target);
      if (item?.type !== "spell" || !item.system.damage.dice) return;
  
      const damageTypeLabel = item.system.damage.type
        ? game.i18n.localize(DND_CUSTOM.damageTypes[item.system.damage.type])
        : "";
      const critical = Boolean(item.getFlag(SYSTEM_ID, "pendingCritical"));
      if (critical) await item.unsetFlag(SYSTEM_ID, "pendingCritical");
  
      const boostFeature = this.actor.items.contents.find(
        (candidate) => candidate.type === "feature" && candidate.system.boostsSpellDamage === item.name
      );
      const boostMod = boostFeature
        ? abilityModifier(this.actor.system.abilities[boostFeature.system.boostsSpellDamageAbility].total)
        : 0;
  
      // Affinité élémentaire : +Cha aux sorts du type du lignage draconique.
      const hasElementalAffinity = hasFeature(this.actor.items.contents, "Affinité élémentaire");
      const elementalAffinityMod =
        hasElementalAffinity && item.system.damage.type && item.system.damage.type === this.actor.system.combat.draconicResistanceType
          ? abilityModifier(this.actor.system.abilities.cha.total)
          : 0;
      const totalBoostMod = boostMod + elementalAffinityMod;
  
      await rollDamage({
        actor: this.actor,
        dice: item.system.damage.dice,
        formula: totalBoostMod ? formatModifier(totalBoostMod) : "",
        critical,
        flavor: `${game.i18n.format("DND_CUSTOM.Roll.SpellDamage", { spell: item.name })}${parenthesized(damageTypeLabel)}`,
        damageType: item.system.damage.type,
        isSpellDamage: true,
        spellName: item.name,
        // Un sort est toujours une source magique.
        isMagicalSource: true
      });
    }
  
    /** Rompt volontairement la concentration en cours (SRD 5e : possible à tout moment). */
    static async #onDropConcentration() {
      await this.actor.update({ "system.spells.concentratingOn": "" });
    }
  };
}
