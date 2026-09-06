import { DND_CUSTOM } from "../helpers/config.js";
import { hasFeature, formatModifier } from "../helpers/rules.js";
import { rollCheck, rollDamage } from "../helpers/rolls.js";
import { consumeActionEconomy, noteActionEconomyUsage } from "../helpers/action-economy.js";
import { consumeFeatureCharge } from "../helpers/feature-charges.js";
import { itemFromTarget } from "../helpers/sheet-items.js";
import { recordAttackOnTargets } from "../helpers/hunters-defense.js";
import { isDisadvantagedByHuntedTarget } from "../helpers/relentless-hunter.js";
import { offerWildShapeFormDialog } from "../helpers/wild-shape-choice.js";
import { requestWildShapeTransformation } from "../helpers/wild-shape-form.js";

const SYSTEM_ID = "dnd-custom-ai";

/** Mixin ApplicationV2 de la fiche de personnage : Combat monté (don SRD 5e) et Forme sauvage
 *  (Druide) — monter/descendre d'une monture, prendre/quitter une forme, et les jets d'attaque/
 *  dégâts effectués DEPUIS la fiche du personnage avec le profil d'attaque de la forme liée
 *  (`system.combat.wildShapeActorId`). Extrait de `DndCustomActorSheet` (chantier de découpe
 *  pré-1.0). `static DEFAULT_OPTIONS.actions` est fusionné par ApplicationV2 sur toute la chaîne
 *  de mixins (cf. `InventoryDragDropMixin`). */
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

    /** Monte la créature actuellement ciblée (Combat monté, don SRD 5e — chantier "Combat
     *  automatisé avancé", 2026-08-23) : même convention que les Capacités à cible
     *  (`game.user.targets`) plutôt qu'un select dédié. Réservé aux Actors de type "mount"
     *  (créature vivante, `CONFIG.Actor.dataModels.mount = NpcData`, dnd-custom-ai.js) — jamais
     *  "vehicle" (schéma trop pauvre pour ce don : pas de taille). */
    static async #onMount() {
      const target = [...game.user.targets][0];
      if (!target?.actor || target.actor.type !== "mount") {
        ui.notifications.warn(game.i18n.localize("DND_CUSTOM.Chat.MountNoTarget"));
        return;
      }
      await this.actor.update({ "system.combat.mountedActorId": target.actor.id });
    }

    /** Descend de sa monture actuelle (cf. #onMount ci-dessus). */
    static async #onDismount() {
      await this.actor.update({ "system.combat.mountedActorId": "" });
    }

    /** Prend une forme choisie dans un dialogue (Forme sauvage, Druide — refonte 2026-09-04,
     *  cf. offerWildShapeFormDialog, wild-shape-choice.js) : plus de ciblage de token, le joueur
     *  choisit directement parmi les formes disponibles à son niveau. Le dialogue s'affiche AVANT
     *  de consommer l'Action/Action bonus et la charge de Capacité (consumeActionEconomy,
     *  helpers/action-economy.js / consumeFeatureCharge, helpers/feature-charges.js, comme toute autre Capacité), pour ne rien décompter si le joueur
     *  ferme le dialogue sans choisir. `item` est la Capacité "Forme sauvage" elle-même
     *  (`system.entersWildShape`, item-data.js). La création/réutilisation de l'Actor de la forme
     *  et la pose des PV temporaires de "Forme sauvage de combat" (Cercle de la Lune) sont
     *  déléguées à requestWildShapeTransformation (wild-shape-form.js), qui gère aussi le relais
     *  MJ nécessaire pour créer un Actor (permission que le Joueur n'a pas). */
    static async #onEnterWildShape(event, target) {
      const item = itemFromTarget(this.actor, target);
      if (!item || item.type !== "feature" || !item.system.entersWildShape) return;

      const chosenFormName = await offerWildShapeFormDialog(this.actor);
      if (!chosenFormName) return;

      if (!(await consumeActionEconomy(this.actor, item))) return;

      const remaining = await consumeFeatureCharge(item);
      if (remaining === null) return;

      // Forme sauvage de combat (Cercle de la Lune, Druide 2, SRD 5e) : PV temporaires égaux à 2×
      // le niveau du Druide au moment de la transformation, posés sur la FORME (system.attributes
      // .hp.temp, NpcData) puisque c'est sa réserve de PV qui sert de 2e réserve pendant la
      // transformation (cf. commentaire de wildShapeActorId, character-data.js) — jamais sur le
      // personnage lui-même. Calculé ici (niveau du Druide connu côté Joueur) mais appliqué dans
      // requestWildShapeTransformation, seule habilitée à écrire sur l'Actor de la forme.
      const combatWildShapeBonus = hasFeature(this.actor.items.contents, "Forme sauvage de combat")
        ? 2 * this.actor.system.attributes.level
        : undefined;

      await requestWildShapeTransformation(this.actor, chosenFormName, combatWildShapeBonus);
    }

    /** Redevient soi-même (cf. #onEnterWildShape ci-dessus) : volontaire, à tout moment — jamais
     *  bloquant, contrairement au retour AUTOMATIQUE à 0 PV de forme (hook updateActor,
     *  dnd-custom-ai.js). Ne rend jamais la charge de Capacité déjà consommée (SRD 5e : reprendre
     *  une forme, même la même, en recoûte une). */
    static async #onRevertWildShape() {
      await this.actor.update({ "system.combat.wildShapeActorId": "" });
    }

    /** Jet d'attaque avec la Forme sauvage actuellement prise (refonte 2026-09-04) : profil
     *  d'attaque `target.dataset.index` lu sur l'Actor lié (system.combat.wildShapeActorId), pas
     *  sur `this.actor` — même lecture que #onRollAttack (npc-sheet.js), mais exécutée depuis la
     *  fiche du PERSONNAGE pour éviter d'avoir à ouvrir la fiche PNJ de la forme en combat. `actor:
     *  this.actor` passé à rollCheck (pas la forme) : c'est le PERSONNAGE qui est Combattant du
     *  combat en cours (criticalRules > isActorInCombat) et qui parle dans le chat, la forme n'a en
     *  général ni jeton ni entrée dans le Suivi de combat. Le flag de critique en attente est donc
     *  posé sur `this.actor` (`pendingWildShapeAttackCritical`, objet par index) plutôt que sur la
     *  forme, qui n'est pas forcément possédée par le Joueur (cf. requestWildShapeTransformation,
     *  wild-shape-form.js). */
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

    /** Jet de dégâts d'une attaque de Forme sauvage (cf. #onRollWildShapeAttack ci-dessus) — même
     *  moteur (rollDamage, rolls.js) que les armes/attaques de PNJ, dés/type lus sur la forme
     *  liée. */
    static async #onRollWildShapeAttackDamage(event, target) {
      const formActor = game.actors.get(this.actor.system.combat.wildShapeActorId);
      const index = Number(target.dataset.index);
      const attack = formActor?.system.attacks[index];
      if (!attack || !attack.damage.dice) return;

      const abilityMod = formActor.system.abilities[attack.ability]?.mod ?? 0;
      const damageTypeLabel = attack.damage.type ? game.i18n.localize(DND_CUSTOM.damageTypes[attack.damage.type]) : "";
      const pending = this.actor.getFlag(SYSTEM_ID, "pendingWildShapeAttackCritical") ?? {};
      const critical = Boolean(pending[index]);
      if (critical) await this.actor.update({ [`flags.${SYSTEM_ID}.pendingWildShapeAttackCritical.-=${index}`]: null });

      await rollDamage({
        actor: this.actor,
        dice: attack.damage.dice,
        formula: formatModifier(abilityMod + attack.damage.bonus),
        flavor: `${game.i18n.format("DND_CUSTOM.Roll.WeaponDamage", { weapon: attack.name })}${damageTypeLabel ? ` (${damageTypeLabel})` : ""}`,
        critical,
        damageType: attack.damage.type,
        isMagicalSource: attack.magic
      });
    }
  };
}
