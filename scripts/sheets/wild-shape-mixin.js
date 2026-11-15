import { DND_CUSTOM } from "../helpers/config.js";
import { hasFeature, formatModifier, parenthesized } from "../helpers/rules.js";
import { rollCheck, rollDamage } from "../helpers/rolls.js";
import { consumeActionEconomy, noteActionEconomyUsage } from "../helpers/action-economy.js";
import { consumeFeatureCharge } from "../helpers/feature-charges.js";
import { itemFromTarget } from "../helpers/sheet-items.js";
import { recordAttackOnTargets } from "../helpers/hunters-defense.js";
import { isDisadvantagedByHuntedTarget } from "../helpers/relentless-hunter.js";
import { offerWildShapeFormDialog } from "../helpers/wild-shape-choice.js";
import { requestWildShapeTransformation } from "../helpers/wild-shape-form.js";

const SYSTEM_ID = "dnd-custom-ai";

/** Mixin de fiche de personnage : Combat monté et Forme sauvage (attaques avec le profil de la forme). */
export function WildShapeSheetMixin(Base) {
  return class WildShapeSheet extends Base {
    static DEFAULT_OPTIONS = {
      actions: {
        mount: WildShapeSheet.#onMount,
        dismount: WildShapeSheet.#onDismount,
        enterWildShape: WildShapeSheet.#onEnterWildShape,
        revertWildShape: WildShapeSheet.#onRevertWildShape,
        rollWildShapeAttack: WildShapeSheet.#onRollWildShapeAttack,
        rollWildShapeAttackDamage: WildShapeSheet.#onRollWildShapeAttackDamage
      }
    };

    /** Monte la créature « mount » ciblée (don Combat monté). */
    static async #onMount() {
      const target = [...game.user.targets][0];
      if (target?.actor?.type !== "mount") {
        ui.notifications.warn(game.i18n.localize("DND_CUSTOM.Chat.MountNoTarget"));
        return;
      }
      await this.actor.update({ "system.combat.mountedActorId": target.actor.id });
    }

    /** Descend de sa monture actuelle (cf. #onMount ci-dessus). */
    static async #onDismount() {
      await this.actor.update({ "system.combat.mountedActorId": "" });
    }

    /** Prend une forme sauvage choisie dans un dialogue, avant de consommer action et charge. */
    static async #onEnterWildShape(event, target) {
      const item = itemFromTarget(this.actor, target);
      if (item?.type !== "feature" || !item.system.entersWildShape) return;

      const chosenFormName = await offerWildShapeFormDialog(this.actor);
      if (!chosenFormName) return;

      if (!(await consumeActionEconomy(this.actor, item))) return;

      const remaining = await consumeFeatureCharge(item);
      if (remaining === null) return;

      // Forme sauvage de combat : PV temporaires de la forme = 2 × niveau du Druide.
      const combatWildShapeBonus = hasFeature(this.actor.items.contents, "Forme sauvage de combat")
        ? 2 * this.actor.system.attributes.level
        : undefined;

      await requestWildShapeTransformation(this.actor, chosenFormName, combatWildShapeBonus);
    }

    /** Redevient soi-même ; la charge consommée n'est pas rendue. */
    static async #onRevertWildShape() {
      await this.actor.update({ "system.combat.wildShapeActorId": "" });
    }

    /** Jet d'attaque avec le profil de la forme sauvage, au nom du personnage. */
    static async #onRollWildShapeAttack(event, target) {
      const formActor = game.actors.get(this.actor.system.combat.wildShapeActorId);
      const index = Number(target.dataset.index);
      const attack = formActor?.system.attacks[index];
      if (!attack) return;

      const abilityMod = formActor.system.abilities[attack.ability]?.mod ?? 0;
      const { isCriticalHit } = await rollCheck({
        actor: this.actor,
        formula: formatModifier(abilityMod + attack.bonus),
        flavor: game.i18n.format("DND_CUSTOM.Roll.WeaponAttack", { weapon: attack.name }),
        advantage: event.shiftKey,
        disadvantage: event.ctrlKey || isDisadvantagedByHuntedTarget(this.actor),
        compareToTargetAc: true,
        criticalRules: true
      });
      if (isCriticalHit) {
        const pending = this.actor.getFlag(SYSTEM_ID, "pendingWildShapeAttackCritical") ?? {};
        await this.actor.setFlag(SYSTEM_ID, "pendingWildShapeAttackCritical", { ...pending, [index]: true });
      }
      await noteActionEconomyUsage(this.actor, "action", { isWeaponAttack: true });
      await recordAttackOnTargets(this.actor);
    }

    /** Jet de dégâts d'une attaque de forme sauvage. */
    static async #onRollWildShapeAttackDamage(event, target) {
      const formActor = game.actors.get(this.actor.system.combat.wildShapeActorId);
      const index = Number(target.dataset.index);
      const attack = formActor?.system.attacks[index];
      if (!attack?.damage.dice) return;

      const abilityMod = formActor.system.abilities[attack.ability]?.mod ?? 0;
      const damageTypeLabel = attack.damage.type ? game.i18n.localize(DND_CUSTOM.damageTypes[attack.damage.type]) : "";
      const pending = this.actor.getFlag(SYSTEM_ID, "pendingWildShapeAttackCritical") ?? {};
      const critical = Boolean(pending[index]);
      if (critical) await this.actor.update({ [`flags.${SYSTEM_ID}.pendingWildShapeAttackCritical.-=${index}`]: null });

      await rollDamage({
        actor: this.actor,
        dice: attack.damage.dice,
        formula: formatModifier(abilityMod + attack.damage.bonus),
        flavor: `${game.i18n.format("DND_CUSTOM.Roll.WeaponDamage", { weapon: attack.name })}${parenthesized(damageTypeLabel)}`,
        critical,
        damageType: attack.damage.type,
        isMagicalSource: attack.magic
      });
    }
  };
}
