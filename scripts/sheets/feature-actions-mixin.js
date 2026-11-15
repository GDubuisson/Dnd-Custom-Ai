import { DND_CUSTOM } from "../helpers/config.js";
import {
  abilityModifier,
  proficiencyBonus,
  formatModifier,
  hasFeature,
  spellSaveDC,
  targetSaveModifier,
  opposedCheckModifier
} from "../helpers/rules.js";
import { sheetRollFlags } from "../helpers/rolls.js";
import { consumeActionEconomy } from "../helpers/action-economy.js";
import { consumeFeatureCharge } from "../helpers/feature-charges.js";
import { itemFromTarget } from "../helpers/sheet-items.js";
import { hasMultiattackDefenseAdvantage, hasSteadfastAdvantage } from "../helpers/hunters-defense.js";
import {
  RELENTLESS_HUNTER_FEATURE_NAME,
  HUNTED_BY_ACTOR_ID_FLAG
} from "../helpers/relentless-hunter.js";
import { chooseInitiateMagicSpells } from "../helpers/initiate-magic-choice.js";
import { requestBeastCompanion } from "../helpers/companion.js";
import { isUndeadDestroyed } from "../helpers/turn-undead.js";
import { SKILL_ABILITIES } from "../data/character-data.js";

const { DialogV2 } = foundry.applications.api;
const SYSTEM_ID = "dnd-custom-ai";

// Table d'options de chaque valeur de FeatureData#grantsChoice.
const CHOICE_OPTIONS_TABLES = {
  totemSpirit: DND_CUSTOM.totemSpirits,
  draconicResistanceType: DND_CUSTOM.draconicResistanceTypes,
  huntersDefense: DND_CUSTOM.huntersDefenses,
  favoredEnemyType: DND_CUSTOM.creatureTypes
};

/** Capacité qui porte les charges de `item` : elle-même, ou la réserve nommée par `costsResource`. */
function resourceChargeHolder(actor, item) {
  if (!item.system.costsResource) return item;
  return actor.items.contents.find(
    (candidate) => candidate.type === "feature" && candidate.name === item.system.costsResource
  );
}

/** DD d'une Capacité à sauvegarde : `saveDCAbility`, sinon la caractéristique d'incantation de la classe. */
function featureSaveDC(system, item) {
  const dcAbility = item.system.saveDCAbility || DND_CUSTOM.spellcastingAbility[system.class];
  const dcAbilityMod = dcAbility ? abilityModifier(system.abilities[dcAbility].total) : 0;
  return spellSaveDC(proficiencyBonus(system.attributes.level), dcAbilityMod);
}

/** Destruction des morts-vivants : la cible morte-vivante est détruite si son FI est sous le seuil. */
function destroysUndeadTarget(sourceActor, item, targetActor) {
  return (
    item.system.requiresCreatureTypes.has("undead") &&
    targetActor.system.creatureType === "undead" &&
    hasFeature(sourceActor.items.contents, "Destruction des morts-vivants") &&
    isUndeadDestroyed(sourceActor.system.attributes.level, targetActor.system.challengeRating)
  );
}

/** Sauvegarde d'une cible contre la Capacité `item` : mauvais type refusé, état ou destruction sur échec. */
async function rollFeatureSaveForTarget(sourceActor, item, targetActor, { dc, abilityLabel }) {
  if (item.system.requiresCreatureTypes.size && !item.system.requiresCreatureTypes.has(targetActor.system.creatureType)) {
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: targetActor }),
      content: game.i18n.format("DND_CUSTOM.Chat.FeatureSaveWrongCreatureType", { name: targetActor.name, feature: item.name })
    });
    return;
  }

  const mod = targetSaveModifier(targetActor.system, item.system.savingThrow);
  // Tactiques défensives : avantage de la cible (Volonté de fer, Défense contre les attaques multiples).
  const hasDefenseAdvantage =
    hasSteadfastAdvantage(targetActor, item.system.appliesCondition) ||
    hasMultiattackDefenseAdvantage(targetActor, sourceActor);
  const roll = new Roll(`${hasDefenseAdvantage ? "2d20kh1" : "1d20"}${formatModifier(mod)}`);
  await roll.evaluate();
  const success = roll.total >= dc;
  const destroysUndead = destroysUndeadTarget(sourceActor, item, targetActor);
  if (!success && destroysUndead) {
    await targetActor.update({ "system.attributes.hp.value": 0 });
    if (!targetActor.statuses.has("dead")) await targetActor.toggleStatusEffect("dead", { active: true });
  } else if (!success && item.system.appliesCondition) {
    await targetActor.toggleStatusEffect(item.system.appliesCondition, { active: true });
  }
  const failKey = destroysUndead ? "DND_CUSTOM.Roll.SaveFailUndeadDestroyed" : "DND_CUSTOM.Roll.SaveFail";
  const resultKey = success ? "DND_CUSTOM.Roll.SaveSuccess" : failKey;
  const advantageNote = hasDefenseAdvantage ? ` (${game.i18n.localize("DND_CUSTOM.Roll.Advantage")})` : "";
  await roll.toMessage({
    speaker: ChatMessage.getSpeaker({ actor: targetActor }),
    flavor: `${game.i18n.format(resultKey, { name: targetActor.name, spell: item.name, ability: abilityLabel, dc })}${advantageNote}`,
    flags: sheetRollFlags({ savingThrowRoll: true })
  });
}

/** Dialogue du choix de l'effet de Bousculer ; `null` si fermé. */
async function chooseShoveEffect(item) {
  const rows = Object.entries(DND_CUSTOM.shoveEffects)
    .map(
      ([key, labelKey], index) => `
      <label class="checkbox-row">
        <input type="radio" name="shoveEffect" value="${key}" ${index === 0 ? "checked" : ""}>
        ${game.i18n.localize(labelKey)}
      </label>`
    )
    .join("");
  const effect = await DialogV2.prompt({
    window: { title: item.name },
    content: `<div style="display:flex;flex-direction:column;gap:0.4rem;">${rows}</div>`,
    ok: {
      label: game.i18n.localize("DND_CUSTOM.Abilities.ChooseOptionConfirm"),
      callback: (ev, button) => button.form.elements.shoveEffect?.value
    }
  });
  return effect || null;
}

/** Mixin de fiche de personnage : actions liées aux Capacités (jets, sauvegardes, charges, choix, techniques). */
export function FeatureActionsSheetMixin(Base) {
  return class FeatureActionsSheet extends Base {
    static DEFAULT_OPTIONS = {
      actions: {
        rollFeature: FeatureActionsSheet.#onRollFeature,
        rollFeatureSave: FeatureActionsSheet.#onRollFeatureSave,
        grantFeatureCondition: FeatureActionsSheet.#onGrantFeatureCondition,
        rollOpposedCheck: FeatureActionsSheet.#onRollOpposedCheck,
        useFeatureCharge: FeatureActionsSheet.#onUseFeatureCharge,
        useResourceTechnique: FeatureActionsSheet.#onUseResourceTechnique,
        useConditionalFeature: FeatureActionsSheet.#onUseConditionalFeature,
        chooseFeatureOption: FeatureActionsSheet.#onChooseFeatureOption,
        chooseInitiateMagic: FeatureActionsSheet.#onChooseInitiateMagic,
        summonCompanion: FeatureActionsSheet.#onSummonCompanion,
        useManeuver: FeatureActionsSheet.#onUseManeuver,
        useOpenHandTechnique: FeatureActionsSheet.#onUseOpenHandTechnique,
        toggleReaction: FeatureActionsSheet.#onToggleReaction,
        toggleAction: FeatureActionsSheet.#onToggleAction,
        toggleBonusAction: FeatureActionsSheet.#onToggleBonusAction
      }
    };

    /** Jet libre d'une Capacité (`rollFormula` résolue sur l'Actor), avec charge et bouton de soin, réduction ou dégâts. */
    static async #onRollFeature(event, target) {
      const item = itemFromTarget(this.actor, target);
      if (item?.type !== "feature" || !item.system.requiresRoll || !item.system.rollFormula) return;
      if (!(await consumeActionEconomy(this.actor, item))) return;
  
      const remaining = await consumeFeatureCharge(item);
      if (remaining === null) return;
  
      const roll = new Roll(item.system.rollFormula, this.actor.getRollData());
      await roll.evaluate();
      const flavor = remaining === undefined ? item.name : `${item.name} (${remaining}/${item.system.uses.max})`;
      await roll.toMessage({
        speaker: ChatMessage.getSpeaker({ actor: this.actor }),
        flavor,
        flags: sheetRollFlags({
          ...(item.system.healsTarget ? { healRoll: true } : {}),
          ...(item.system.reducesDamage ? { damageReduction: true } : {}),
          ...(item.system.dealsDamage ? { damageRoll: true } : {})
        })
      });
    }
  
    /**
     * Capacité imposant une sauvegarde à chaque cible ciblée du bon type, contre le DD du personnage ;
     * état appliqué sur échec. Peut consommer la réserve d'une autre Capacité (`costsResource`).
     */
    static async #onRollFeatureSave(event, target) {
      const item = itemFromTarget(this.actor, target);
      if (item?.type !== "feature" || !item.system.savingThrow) return;
      if (!(await consumeActionEconomy(this.actor, item))) return;
  
      const chargeHolder = resourceChargeHolder(this.actor, item);
      if (!chargeHolder) return;

      const remaining = await consumeFeatureCharge(chargeHolder);
      if (remaining === null) return;

      const dc = featureSaveDC(this.actor.system, item);
      const abilityLabel = game.i18n.localize(DND_CUSTOM.abilities[item.system.savingThrow]);
      const targets = Array.from(game.user.targets);

      if (!targets.length) {
        await ChatMessage.create({
          speaker: ChatMessage.getSpeaker({ actor: this.actor }),
          content: game.i18n.format("DND_CUSTOM.Chat.SaveSpellNoTarget", { spell: item.name, ability: abilityLabel, dc })
        });
        return;
      }

      for (const token of targets) {
        const targetActor = token.actor;
        if (!targetActor?.system?.abilities) continue;
        await rollFeatureSaveForTarget(this.actor, item, targetActor, { dc, abilityLabel }); // NOSONAR : séquentiel voulu
      }
    }

    /**
     * Pose l'état de la Capacité sur chaque cible ciblée, sans jet.
     * Traque implacable mémorise aussi le Paladin sur la cible (`HUNTED_BY_ACTOR_ID_FLAG`).
     */
    static async #onGrantFeatureCondition(event, target) {
      const item = itemFromTarget(this.actor, target);
      if (item?.type !== "feature" || !item.system.grantsCondition) return;
      if (!(await consumeActionEconomy(this.actor, item))) return;
  
      const chargeHolder = resourceChargeHolder(this.actor, item);
      if (!chargeHolder) return;
  
      const remaining = await consumeFeatureCharge(chargeHolder);
      if (remaining === null) return;
  
      const targets = Array.from(game.user.targets);
      if (!targets.length) {
        ui.notifications.warn(game.i18n.localize("DND_CUSTOM.Chat.NoTarget"));
        return;
      }
  
      for (const token of targets) {
        if (!token.actor) continue;
        await token.actor.toggleStatusEffect(item.system.grantsCondition, { active: true }); // NOSONAR : séquentiel voulu
        if (item.name === RELENTLESS_HUNTER_FEATURE_NAME) {
          await token.actor.setFlag(SYSTEM_ID, HUNTED_BY_ACTOR_ID_FLAG, this.actor.id); // NOSONAR : séquentiel voulu
        }
      }
  
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: this.actor }),
        content: game.i18n.format("DND_CUSTOM.Chat.UseFeature", {
          name: this.actor.name,
          feature: item.name,
          remaining,
          max: chargeHolder.system.uses.max
        })
      });
    }
  
    /** Test opposé Agripper/Bousculer contre une seule cible : jet de chaque camp puis message de résolution. */
    static async #onRollOpposedCheck(event, target) {
      const item = itemFromTarget(this.actor, target);
      if (item?.type !== "feature" || !item.system.opposedCheckType) return;
      if (!(await consumeActionEconomy(this.actor, item))) return;
  
      const targets = Array.from(game.user.targets);
      if (targets.length !== 1) {
        ui.notifications.warn(
          game.i18n.localize(targets.length ? "DND_CUSTOM.Chat.OpposedCheckSingleTargetOnly" : "DND_CUSTOM.Chat.NoTarget")
        );
        return;
      }
      const targetActor = targets[0].actor;
      if (!targetActor?.system?.abilities) return;
  
      // Effet de Bousculer choisi avant le jet.
      const isShove = item.system.opposedCheckType === "shove";
      const chosenShoveEffect = isShove ? await chooseShoveEffect(item) : null;
      if (isShove && !chosenShoveEffect) return;

      const attackerMod = opposedCheckModifier(this.actor.system, "athletics", SKILL_ABILITIES.athletics);
      const athleticsMod = opposedCheckModifier(targetActor.system, "athletics", SKILL_ABILITIES.athletics);
      const acrobaticsMod = opposedCheckModifier(targetActor.system, "acrobatics", SKILL_ABILITIES.acrobatics);
      const defenderSkillKey = athleticsMod >= acrobaticsMod ? "athletics" : "acrobatics";
      const defenderMod = Math.max(athleticsMod, acrobaticsMod);
  
      const attackerRoll = new Roll(`1d20${formatModifier(attackerMod)}`);
      await attackerRoll.evaluate();
      await attackerRoll.toMessage({
        speaker: ChatMessage.getSpeaker({ actor: this.actor }),
        flavor: game.i18n.format("DND_CUSTOM.Roll.OpposedCheckAttacker", { name: this.actor.name, feature: item.name }),
        flags: sheetRollFlags()
      });
  
      const defenderRoll = new Roll(`1d20${formatModifier(defenderMod)}`);
      await defenderRoll.evaluate();
      await defenderRoll.toMessage({
        speaker: ChatMessage.getSpeaker({ actor: targetActor }),
        flavor: game.i18n.format("DND_CUSTOM.Roll.OpposedCheckDefender", {
          name: targetActor.name,
          skill: game.i18n.localize(DND_CUSTOM.skills[defenderSkillKey])
        }),
        flags: sheetRollFlags()
      });
  
      // L'attaquant doit dépasser strictement la cible.
      const success = attackerRoll.total > defenderRoll.total;
  
      // Repoussé : mentionné seulement dans le message.
      const appliedCondition = item.system.opposedCheckType === "grapple" ? "grappled" : chosenShoveEffect;
      if (success && ["grappled", "prone"].includes(appliedCondition)) {
        await targetActor.toggleStatusEffect(appliedCondition, { active: true });
      }
  
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: this.actor }),
        content: game.i18n.format(success ? "DND_CUSTOM.Chat.OpposedCheckSuccess" : "DND_CUSTOM.Chat.OpposedCheckFail", {
          attacker: this.actor.name,
          defender: targetActor.name,
          feature: item.name,
          effect: game.i18n.localize(
            chosenShoveEffect ? DND_CUSTOM.shoveEffects[chosenShoveEffect] : "DND_CUSTOM.Conditions.grappled"
          )
        })
      });
    }
  
    /** Utilise une charge d'une Capacité sans jet et l'annonce en chat. */
    static async #onUseFeatureCharge(event, target) {
      const item = itemFromTarget(this.actor, target);
      if (item?.type !== "feature" || !item.system.uses.max) return;
      if (!(await consumeActionEconomy(this.actor, item))) return;
  
      const remaining = await consumeFeatureCharge(item);
      if (remaining === null) return;
  
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: this.actor }),
        content: game.i18n.format("DND_CUSTOM.Chat.UseFeature", {
          name: this.actor.name,
          feature: item.name,
          remaining,
          max: item.system.uses.max
        })
      });
    }
  
    /** Bascule manuellement la disponibilité de la réaction. */
    static async #onToggleReaction() {
      const available = this.actor.system.combat.reactionAvailable;
      await this.actor.update({ "system.combat.reactionAvailable": !available });
    }
  
    /** Bascule manuellement la disponibilité de l'Action ou de l'Action bonus. */
    static async #onToggleAction() {
      const available = this.actor.system.combat.actionAvailable;
      await this.actor.update({ "system.combat.actionAvailable": !available });
    }
  
    static async #onToggleBonusAction() {
      const available = this.actor.system.combat.bonusActionAvailable;
      await this.actor.update({ "system.combat.bonusActionAvailable": !available });
    }
  
    /** Technique consommant une charge de la Capacité réservoir `costsResource` (ex. Ki). */
    static async #onUseResourceTechnique(event, target) {
      const item = itemFromTarget(this.actor, target);
      if (item?.type !== "feature" || !item.system.costsResource) return;
      if (!(await consumeActionEconomy(this.actor, item))) return;
  
      const resource = resourceChargeHolder(this.actor, item);
      if (!resource) return;
  
      const remaining = await consumeFeatureCharge(resource);
      if (remaining === null) return;
  
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: this.actor }),
        content: game.i18n.format("DND_CUSTOM.Chat.UseResourceTechnique", {
          name: this.actor.name,
          technique: item.name,
          resource: resource.name,
          remaining,
          max: resource.system.uses.max
        })
      });
    }
  
    /** Capacité gratuite exigeant un état actif (ex. Frénésie en Rage), annoncée en chat. */
    static async #onUseConditionalFeature(event, target) {
      const item = itemFromTarget(this.actor, target);
      if (item?.type !== "feature" || !item.system.requiresState) return;
      if (!this.actor.statuses.has(item.system.requiresState)) return;
      if (!(await consumeActionEconomy(this.actor, item))) return;
  
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: this.actor }),
        content: game.i18n.format("DND_CUSTOM.Chat.UseConditionalFeature", {
          name: this.actor.name,
          feature: item.name
        })
      });
    }
  
    /** Dialogue du choix définitif d'une Capacité, stocké dans `system.combat.<grantsChoice>`. */
    static async #onChooseFeatureOption(event, target) {
      const item = itemFromTarget(this.actor, target);
      const fieldKey = item?.system.grantsChoice;
      if (!fieldKey || this.actor.system.combat[fieldKey]) return;
  
      const options = CHOICE_OPTIONS_TABLES[fieldKey];
      const rows = Object.entries(options)
        .map(
          ([key, labelKey], index) => `
          <label class="checkbox-row">
            <input type="radio" name="chosenOption" value="${key}" ${index === 0 ? "checked" : ""}>
            ${game.i18n.localize(labelKey)}
          </label>`
        )
        .join("");
  
      const chosenKey = await DialogV2.prompt({
        window: { title: item.name },
        content: `<div style="display:flex;flex-direction:column;gap:0.4rem;">${rows}</div>`,
        ok: {
          label: game.i18n.localize("DND_CUSTOM.Abilities.ChooseOptionConfirm"),
          callback: (ev, button) => button.form.elements.chosenOption?.value
        }
      });
      if (!chosenKey) return;
  
      await this.actor.update({ [`system.combat.${fieldKey}`]: chosenKey });
    }
  
    /** Magie d'initié : octroie les sorts choisis et règle la charge du sort de niveau 1 gratuit. */
    static async #onChooseInitiateMagic(event, target) {
      const item = itemFromTarget(this.actor, target);
      if (!item?.system.offersSpellChoice || item.system.chosenLevelOneSpell) return;
  
      const choice = await chooseInitiateMagicSpells();
      if (!choice) return;
  
      await this.actor.createEmbeddedDocuments("Item", [
        ...choice.cantripItems.map((spell) => spell.toObject()),
        choice.levelOneSpellItem.toObject()
      ]);
      await item.update({
        "system.chosenSpellClass": choice.classKey,
        "system.chosenCantrips": choice.cantripItems.map((spell) => spell.name),
        "system.chosenLevelOneSpell": choice.levelOneSpellItem.name,
        "system.uses": { max: 1, value: 1, recharge: "longRest" }
      });
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: this.actor }),
        content: game.i18n.format("DND_CUSTOM.Chat.InitiateMagicGranted", {
          name: this.actor.name,
          class: game.i18n.localize(DND_CUSTOM.classes[choice.classKey]),
          cantrip1: choice.cantripItems[0].name,
          cantrip2: choice.cantripItems[1].name,
          spell: choice.levelOneSpellItem.name
        })
      });
    }
  
    /** Invoque une seule fois le compagnon animal. */
    static async #onSummonCompanion(event, target) {
      const item = itemFromTarget(this.actor, target);
      if (!item?.system.summonsCompanion) return;
      if (this.actor.getFlag(SYSTEM_ID, "beastCompanionCreated")) return;
  
      await requestBeastCompanion(this.actor);
    }
  
    /** Dépense un dé de manœuvre après choix de la manœuvre. */
    static async #onUseManeuver(event, target) {
      const item = itemFromTarget(this.actor, target);
      if (!item?.system.offersManeuverChoice) return;
      if (!(await consumeActionEconomy(this.actor, item))) return;
  
      const options = DND_CUSTOM.maneuvers;
      const rows = Object.entries(options)
        .map(
          ([key, labelKey], index) => `
          <label class="checkbox-row">
            <input type="radio" name="maneuver" value="${key}" ${index === 0 ? "checked" : ""}>
            ${game.i18n.localize(labelKey)}
          </label>`
        )
        .join("");
      const chosenKey = await DialogV2.prompt({
        window: { title: item.name },
        content: `<div style="display:flex;flex-direction:column;gap:0.4rem;">${rows}</div>`,
        ok: {
          label: game.i18n.localize("DND_CUSTOM.Abilities.ChooseOptionConfirm"),
          callback: (ev, button) => button.form.elements.maneuver?.value
        }
      });
      if (!chosenKey) return;
  
      const remaining = await consumeFeatureCharge(item);
      if (remaining === null) return;
  
      const roll = new Roll(item.system.rollFormula, this.actor.getRollData());
      await roll.evaluate();
      await roll.toMessage({
        speaker: ChatMessage.getSpeaker({ actor: this.actor }),
        flavor: `${item.name} — ${game.i18n.localize(options[chosenKey])} (${remaining}/${item.system.uses.max})`,
        flags: sheetRollFlags()
      });
    }
  
    /**
     * Technique de la Main ouverte : effet choisi, puis sauvegarde de Dex de chaque cible contre le DD du Moine.
     * Échec : À terre, ou perte de la réaction pour un personnage ; Repoussé reste au MJ.
     */
    static async #onUseOpenHandTechnique(event, target) {
      const item = itemFromTarget(this.actor, target);
      if (!item?.system.offersOpenHandTechnique) return;
  
      const options = DND_CUSTOM.openHandEffects;
      const rows = Object.entries(options)
        .map(
          ([key, labelKey], index) => `
          <label class="checkbox-row">
            <input type="radio" name="openHandEffect" value="${key}" ${index === 0 ? "checked" : ""}>
            ${game.i18n.localize(labelKey)}
          </label>`
        )
        .join("");
      const chosenEffect = await DialogV2.prompt({
        window: { title: item.name },
        content: `<div style="display:flex;flex-direction:column;gap:0.4rem;">${rows}</div>`,
        ok: {
          label: game.i18n.localize("DND_CUSTOM.Abilities.ChooseOptionConfirm"),
          callback: (ev, button) => button.form.elements.openHandEffect?.value
        }
      });
      if (!chosenEffect) return;
  
      const system = this.actor.system;
      const wisMod = abilityModifier(system.abilities.wis.total);
      const dc = spellSaveDC(proficiencyBonus(system.attributes.level), wisMod);
      const targets = Array.from(game.user.targets);
  
      if (!targets.length) {
        await ChatMessage.create({
          speaker: ChatMessage.getSpeaker({ actor: this.actor }),
          content: game.i18n.format("DND_CUSTOM.Chat.SaveSpellNoTarget", {
            spell: item.name,
            ability: game.i18n.localize(DND_CUSTOM.abilities.dex),
            dc
          })
        });
        return;
      }
  
      for (const token of targets) {
        const targetActor = token.actor;
        if (!targetActor?.system?.abilities) continue;
  
        const mod = targetSaveModifier(targetActor.system, "dex");
        const roll = new Roll(`1d20${formatModifier(mod)}`);
        await roll.evaluate(); // NOSONAR : séquentiel voulu
        const success = roll.total >= dc;
        if (!success) {
          if (chosenEffect === "prone") await targetActor.toggleStatusEffect("prone", { active: true }); // NOSONAR : séquentiel voulu
          else if (chosenEffect === "noReaction" && targetActor.type === "character") {
            await targetActor.update({ "system.combat.reactionAvailable": false }); // NOSONAR : séquentiel voulu
          }
        }
        const resultKey = success ? "DND_CUSTOM.Roll.SaveSuccess" : "DND_CUSTOM.Roll.SaveFail";
        await roll.toMessage({ // NOSONAR : séquentiel voulu
          speaker: ChatMessage.getSpeaker({ actor: targetActor }),
          flavor: `${game.i18n.format(resultKey, {
            name: targetActor.name,
            spell: item.name,
            ability: game.i18n.localize(DND_CUSTOM.abilities.dex),
            dc
          })} — ${game.i18n.localize(options[chosenEffect])}`,
          flags: sheetRollFlags({ savingThrowRoll: true })
        });
      }
    }
  };
}
