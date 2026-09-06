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
  isDisadvantagedByHuntedTarget,
  RELENTLESS_HUNTER_FEATURE_NAME,
  HUNTED_BY_ACTOR_ID_FLAG
} from "../helpers/relentless-hunter.js";
import { chooseInitiateMagicSpells } from "../helpers/initiate-magic-choice.js";
import { requestBeastCompanion } from "../helpers/companion.js";
import { isUndeadDestroyed } from "../helpers/turn-undead.js";
import { SKILL_ABILITIES } from "../data/character-data.js";

const { DialogV2 } = foundry.applications.api;
const SYSTEM_ID = "dnd-custom-ai";

// Table d'options par valeur de FeatureData#grantsChoice (cf. #onChooseFeatureOption) — une
// entrée par choix ponctuel et définitif existant dans ce système.
const CHOICE_OPTIONS_TABLES = {
  totemSpirit: DND_CUSTOM.totemSpirits,
  draconicResistanceType: DND_CUSTOM.draconicResistanceTypes,
  huntersDefense: DND_CUSTOM.huntersDefenses,
  favoredEnemyType: DND_CUSTOM.creatureTypes
};

/** Mixin ApplicationV2 de la fiche de personnage : tous les gestionnaires d'action liés aux
 *  Capacités (jet libre, jet de sauvegarde de Capacité, état sans jet, test opposé Agripper/
 *  Bousculer, charges/réserves, choix d'option, Magie d'initié, compagnon animal, manœuvres,
 *  Technique de la main ouverte). Extrait de `DndCustomActorSheet` (chantier de découpe pré-1.0).
 *  `static DEFAULT_OPTIONS.actions` est fusionné par ApplicationV2 sur toute la chaîne de mixins
 *  (cf. `InventoryDragDropMixin`). Pur déplacement de code — comportement inchangé. */
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

    /** Jet libre d'une Capacité (`system.requiresRoll`/`rollFormula`, ex. Second souffle
     *  "1d10 + @attributes.level") : formule évaluée avec les données de l'Actor
     *  (Actor#getRollData, natif Foundry) pour résoudre les références `@...`. Consomme une
     *  charge si la capacité a des utilisations limitées (system.uses.max > 0), et annule le
     *  jet si plus aucune charge n'est disponible. `system.healsTarget` (ex. don Guérisseur) :
     *  marque le message du même flag que les sorts de soin pour réutiliser le bouton "Appliquer
     *  le soin" déjà existant (cf. FeatureData#healsTarget, item-data.js) — sans lui, un jet de
     *  soin de Capacité/Don restait un simple nombre posté en chat, jamais réellement appliqué à
     *  une cible (retour de test, ANOMALIES_ACTIVES.md). Ne modélise pas la restriction SRD "une
     *  fois par créature et par repos" ni la branche "stabiliser une créature à 0 PV" du texte de
     *  Guérisseur — laissées à l'arbitrage du MJ, comme d'autres clauses partiellement automatisées
     *  ailleurs dans ce système (cf. Sentinelle/Alerte). */
    static async #onRollFeature(event, target) {
      const item = itemFromTarget(this.actor, target);
      if (!item || item.type !== "feature" || !item.system.requiresRoll || !item.system.rollFormula) return;
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
  
    /** Capacité à jet de sauvegarde de CIBLE (ex. Canalisation divine "Repousser les
     *  morts-vivants"/"Repousser les impies"/"Abjurer un ennemi" — cf.
     *  FeatureData#savingThrow/appliesCondition/requiresCreatureTypes, item-data.js) : même
     *  mécanisme que SpellData#save (#onCastSpell plus bas, rules.js > targetSaveModifier) — le
     *  lanceur ne roule jamais lui-même, seul le DD (spellSaveDC de sa caractéristique
     *  d'incantation de classe) compte, comparé au jet propre de CHAQUE cible actuellement
     *  ciblée. Une cible qui ne correspond à AUCUN type de créature requis (ensemble vide = pas de
     *  restriction) ne subit même pas de jet — message informatif dédié. Échec du jet : applique
     *  la condition configurée à la cible (`Actor#toggleStatusEffect`, natif Foundry).
     *
     *  `costsResource` (cf. item-data.js) : comme #onUseResourceTechnique, une option de
     *  Canalisation divine peut consommer la réserve d'une AUTRE Capacité (ex. les 2 options de
     *  chaque Serment de Paladin partagent la même réserve "Canalisation divine (Paladin)",
     *  jamais leur propre charge) plutôt que sa propre `uses`. */
    static async #onRollFeatureSave(event, target) {
      const item = itemFromTarget(this.actor, target);
      if (!item || item.type !== "feature" || !item.system.savingThrow) return;
      if (!(await consumeActionEconomy(this.actor, item))) return;
  
      const chargeHolder = item.system.costsResource
        ? this.actor.items.contents.find(
            (candidate) => candidate.type === "feature" && candidate.name === item.system.costsResource
          )
        : item;
      if (!chargeHolder) return;
  
      const remaining = await consumeFeatureCharge(chargeHolder);
      if (remaining === null) return;
  
      const system = this.actor.system;
      // saveDCAbility (item-data.js) : caractéristique explicite quand la Capacité n'appartient
      // pas à une classe lanceuse (ex. Frappe étourdissante, Moine — DD basé sur la Sagesse, pas
      // sur `spellcastingAbility[class]` qui n'a pas d'entrée "monk") — sinon, comportement
      // inchangé (caractéristique d'incantation de la classe).
      const dcAbility = item.system.saveDCAbility || DND_CUSTOM.spellcastingAbility[system.class];
      const dcAbilityMod = dcAbility ? abilityModifier(system.abilities[dcAbility].total) : 0;
      const dc = spellSaveDC(proficiencyBonus(system.attributes.level), dcAbilityMod);
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
  
        if (item.system.requiresCreatureTypes.size && !item.system.requiresCreatureTypes.has(targetActor.system.creatureType)) {
          await ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ actor: targetActor }),
            content: game.i18n.format("DND_CUSTOM.Chat.FeatureSaveWrongCreatureType", { name: targetActor.name, feature: item.name })
          });
          continue;
        }
  
        const mod = targetSaveModifier(targetActor.system, item.system.savingThrow);
        // Tactiques défensives (Hunter, Rôdeur — chantier "8 sous-classes déjà à ≥1 mécanique",
        // 2026-08-23) : avantage à la cible si "Volonté de fer" (contre Effrayé) ou "Défense contre
        // les attaques multiples" (contre CET attaquant précis, déjà attaqué ce round) s'applique.
        const hasDefenseAdvantage =
          hasSteadfastAdvantage(targetActor, item.system.appliesCondition) ||
          hasMultiattackDefenseAdvantage(targetActor, this.actor);
        const roll = new Roll(`${hasDefenseAdvantage ? "2d20kh1" : "1d20"}${formatModifier(mod)}`);
        await roll.evaluate();
        const success = roll.total >= dc;
        // Destruction des morts-vivants (Clerc 5, SRD 5e) : ne concerne QUE "Repousser les
        // morts-vivants" (seule Capacité de ce système à cibler "undead" via requiresCreatureTypes,
        // cf. son commentaire d'en-tête) — remplace l'application de la condition (Effrayé/
        // "repoussé") par une destruction pure quand le Clerc possède la Capacité ET que la FI de
        // la cible est sous le seuil de son niveau.
        const destroysUndead =
          item.system.requiresCreatureTypes.has("undead") &&
          targetActor.system.creatureType === "undead" &&
          hasFeature(this.actor.items.contents, "Destruction des morts-vivants") &&
          isUndeadDestroyed(system.attributes.level, targetActor.system.challengeRating);
        if (!success && destroysUndead) {
          await targetActor.update({ "system.attributes.hp.value": 0 });
          if (!targetActor.statuses.has("dead")) await targetActor.toggleStatusEffect("dead", { active: true });
        } else if (!success && item.system.appliesCondition) {
          await targetActor.toggleStatusEffect(item.system.appliesCondition, { active: true });
        }
        const resultKey = success
          ? "DND_CUSTOM.Roll.SaveSuccess"
          : destroysUndead
            ? "DND_CUSTOM.Roll.SaveFailUndeadDestroyed"
            : "DND_CUSTOM.Roll.SaveFail";
        await roll.toMessage({
          speaker: ChatMessage.getSpeaker({ actor: targetActor }),
          flavor: `${game.i18n.format(resultKey, { name: targetActor.name, spell: item.name, ability: abilityLabel, dc })}${
            hasDefenseAdvantage ? ` (${game.i18n.localize("DND_CUSTOM.Roll.Advantage")})` : ""
          }`,
          flags: sheetRollFlags({ savingThrowRoll: true })
        });
      }
    }
  
    /** Capacité qui pose une condition sur CHAQUE cible actuellement ciblée SANS jet associé (ex.
     *  Traque implacable, Paladin Serment de Vengeance — Niveau C, 2026-08-25, cf.
     *  FeatureData#grantsCondition, item-data.js) : même mécanisme que SpellData#grantsCondition
     *  (#onCastSpell plus bas), pour une Capacité au lieu d'un Sort. `costsResource` : comme
     *  #onRollFeatureSave ci-dessus, consomme la réserve d'une AUTRE Capacité si configuré
     *  (Canalisation divine (Paladin), partagée avec Abjurer un ennemi pour Traque implacable).
     *
     *  Spécialisation par NOM (comme Destruction des morts-vivants dans #onRollFeatureSave) :
     *  Traque implacable pose EN PLUS le flag `HUNTED_BY_ACTOR_ID_FLAG`
     *  (helpers/relentless-hunter.js) sur chaque cible, identifiant ce Paladin comme celui qui l'a
     *  désignée — seul moyen dans ce système de savoir QUI a posé un état homebrew (aucun autre
     *  n'a de "propriétaire"), scopé à cette seule Capacité plutôt que généralisé à
     *  `toggleStatusEffect`. Consommé par `isDisadvantagedByHuntedTarget` (même fichier) sur les 3
     *  jets d'attaque (arme/sort PJ, attaque PNJ) pour exempter le Paladin du désavantage "toute
     *  créature autre que vous". */
    static async #onGrantFeatureCondition(event, target) {
      const item = itemFromTarget(this.actor, target);
      if (!item || item.type !== "feature" || !item.system.grantsCondition) return;
      if (!(await consumeActionEconomy(this.actor, item))) return;
  
      const chargeHolder = item.system.costsResource
        ? this.actor.items.contents.find(
            (candidate) => candidate.type === "feature" && candidate.name === item.system.costsResource
          )
        : item;
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
        await token.actor.toggleStatusEffect(item.system.grantsCondition, { active: true });
        if (item.name === RELENTLESS_HUNTER_FEATURE_NAME) {
          await token.actor.setFlag(SYSTEM_ID, HUNTED_BY_ACTOR_ID_FLAG, this.actor.id);
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
  
    /** Test opposé (Agripper/Bousculer, SRD 5e — chantier "mécaniques jamais modélisées",
     *  2026-08-25, cadré avec l'utilisateur avant implémentation) : cf. FeatureData#opposedCheckType,
     *  item-data.js pour le détail complet du mécanisme et des approximations assumées (meilleur des
     *  deux jets de défense de la cible, Repoussé jamais automatisé). Contrairement au reste du
     *  système (jet comparé à un DD/une CA fixe), les DEUX camps lancent ici un d20 — 2 messages de
     *  jet distincts (attaquant puis cible, même convention que #onRollFeatureSave : un message par
     *  "camp"), puis un 3e message de résolution. Une seule cible à la fois (test opposé 1 contre
     *  1, pas de zone). */
    static async #onRollOpposedCheck(event, target) {
      const item = itemFromTarget(this.actor, target);
      if (!item || item.type !== "feature" || !item.system.opposedCheckType) return;
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
  
      // Bousculer : le choix (à terre / repoussé) se fait AVANT le jet, même UX que
      // #onUseOpenHandTechnique — appliqué seulement si l'attaquant l'emporte plus bas.
      let chosenShoveEffect = null;
      if (item.system.opposedCheckType === "shove") {
        const rows = Object.entries(DND_CUSTOM.shoveEffects)
          .map(
            ([key, labelKey], index) => `
            <label class="checkbox-row">
              <input type="radio" name="shoveEffect" value="${key}" ${index === 0 ? "checked" : ""}>
              ${game.i18n.localize(labelKey)}
            </label>`
          )
          .join("");
        chosenShoveEffect = await DialogV2.prompt({
          window: { title: item.name },
          content: `<div style="display:flex;flex-direction:column;gap:0.4rem;">${rows}</div>`,
          ok: {
            label: game.i18n.localize("DND_CUSTOM.Abilities.ChooseOptionConfirm"),
            callback: (ev, button) => button.form.elements.shoveEffect?.value
          }
        });
        if (!chosenShoveEffect) return;
      }
  
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
  
      // Égalité = statu quo (règle générale des tests opposés SRD 5e) : l'attaquant doit
      // STRICTEMENT dépasser le total de la cible pour que l'état change.
      const success = attackerRoll.total > defenderRoll.total;
  
      if (success) {
        if (item.system.opposedCheckType === "grapple") {
          await targetActor.toggleStatusEffect("grappled", { active: true });
        } else if (chosenShoveEffect === "prone") {
          await targetActor.toggleStatusEffect("prone", { active: true });
        }
        // "pushed" (Repoussé) : jamais de déplacement automatique de token, cf. commentaire de
        // FeatureData#opposedCheckType — seul le message de résolution ci-dessous le mentionne.
      }
  
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: this.actor }),
        content: game.i18n.format(success ? "DND_CUSTOM.Chat.OpposedCheckSuccess" : "DND_CUSTOM.Chat.OpposedCheckFail", {
          attacker: this.actor.name,
          defender: targetActor.name,
          feature: item.name,
          effect:
            item.system.opposedCheckType === "shove" && chosenShoveEffect
              ? game.i18n.localize(DND_CUSTOM.shoveEffects[chosenShoveEffect])
              : game.i18n.localize("DND_CUSTOM.Conditions.grappled")
        })
      });
    }
  
    /** Utilisation d'une Capacité à charges limitées sans jet associé (ex. Imposition des
     *  mains) : décrémente le compteur et l'annonce dans le chat (pas de jet à afficher, donc
     *  pas de message automatique sinon comme pour #onRollFeature). */
    static async #onUseFeatureCharge(event, target) {
      const item = itemFromTarget(this.actor, target);
      if (!item || item.type !== "feature" || !item.system.uses.max) return;
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
  
    // #consumeFeatureCharge : factorisé dans helpers/feature-charges.js (consumeFeatureCharge).
    // #consumeActionEconomy : factorisé dans helpers/action-economy.js (consumeActionEconomy).
  
    /** Rattrapage manuel de la réaction (MJ ou joueur) : capacité qui rend une réaction
     *  supplémentaire, correction d'un clic malencontreux... Bascule simplement l'état, sans
     *  attendre un changement de tour (cf. hooks updateCombat/deleteCombat, dnd-custom-ai.js,
     *  pour la régénération automatique au début de son propre tour). */
    static async #onToggleReaction() {
      const available = this.actor.system.combat.reactionAvailable;
      await this.actor.update({ "system.combat.reactionAvailable": !available });
    }
  
    /** Rattrapage manuel de l'Action/Action bonus (même principe que #onToggleReaction ci-dessus) :
     *  utile pour se resynchroniser après un rappel de chat non-bloquant, ou remettre à disposition
     *  une Action rendue par une Capacité (ex. Action fulgurante). */
    static async #onToggleAction() {
      const available = this.actor.system.combat.actionAvailable;
      await this.actor.update({ "system.combat.actionAvailable": !available });
    }
  
    static async #onToggleBonusAction() {
      const available = this.actor.system.combat.bonusActionAvailable;
      await this.actor.update({ "system.combat.bonusActionAvailable": !available });
    }
  
    // Combat monté (mount/dismount) + Forme sauvage (enter/revert/rollWildShapeAttack[Damage]) :
    // factorisés dans WildShapeSheetMixin (sheets/wild-shape-mixin.js).
  
    /** Utilisation d'une technique consommant la réserve d'une AUTRE Capacité (`system.
     *  costsResource`, ex. les techniques de Moine consommant du Ki, cf. consumeFeatureCharge (helpers/feature-charges.js)
     *  pour le cas d'une Capacité à charges qui lui sont propres) : décrémente `system.uses.value`
     *  de la Capacité réservoir (trouvée par nom exact sur l'Actor) et l'annonce dans le chat.
     *  Bouton grisé côté template (tab-abilities.hbs > featureResourceState) dès que la réserve
     *  est vide, mais revérifié ici au cas où plusieurs clients cliqueraient en même temps. */
    static async #onUseResourceTechnique(event, target) {
      const item = itemFromTarget(this.actor, target);
      if (!item || item.type !== "feature" || !item.system.costsResource) return;
      if (!(await consumeActionEconomy(this.actor, item))) return;
  
      const resource = this.actor.items.contents.find(
        (candidate) => candidate.type === "feature" && candidate.name === item.system.costsResource
      );
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
  
    /** Utilisation d'une Capacité gratuite mais conditionnée à un état actif sur l'Actor
     *  (`system.requiresState`, ex. Frénésie qui nécessite d'être En Rage, cf. DND_CUSTOM.conditions
     *  dans config.js) : pas de charge à décompter (contrairement à #onUseFeatureCharge), juste une
     *  annonce dans le chat — le bouton est déjà grisé côté template (tab-abilities.hbs >
     *  featureDisabled) tant que l'état n'est pas actif, revérifié ici au cas où plusieurs clients
     *  cliqueraient en même temps ou que l'état ait changé entre le render et le clic. */
    static async #onUseConditionalFeature(event, target) {
      const item = itemFromTarget(this.actor, target);
      if (!item || item.type !== "feature" || !item.system.requiresState) return;
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
  
    /** Choix ponctuel et définitif proposé par une Capacité (`FeatureData#grantsChoice`, ex.
     *  "Aspect de la bête", Voie du Cœur sauvage/Barbare) : petite fenêtre à choix unique (radio),
     *  même mécanique que offerSubclassChoiceDialog (helpers/subclass-choice.js)/
     *  #offerEquipSlotDialog (sheets/inventory-drag-drop.js). Le champ ciblé
     *  (`system.combat.<grantsChoice>`) et la table d'options viennent respectivement de
     *  `grantsChoice` lui-même et de CHOICE_OPTIONS_TABLES ci-dessous — n'affiche rien si le choix
     *  est déjà fait (bouton déjà masqué côté template de toute façon, revérifié ici par
     *  sécurité). */
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
  
    /** Don "Magie d'initié" (`FeatureData#offersSpellChoice`, SRD 5e) : choix en 2 étapes (classe
     *  lanceuse, puis 2 tours de magie + 1 sort de niveau 1 de cette classe, cf.
     *  chooseInitiateMagicSpells, helpers/initiate-magic-choice.js) — contrairement à
     *  #onChooseFeatureOption (un seul champ, une seule table), ce choix octroie de VRAIS Items
     *  Sort sur la fiche plutôt qu'une simple valeur. Règle le `uses` du don lui-même
     *  (max:1/recharge:"longRest") pour servir de charge au cast gratuit du sort de niveau 1,
     *  consommée dans #onCastSpell ci-dessous. Ne fait rien si déjà choisi (bouton déjà masqué
     *  côté template, revérifié ici par sécurité). */
    static async #onChooseInitiateMagic(event, target) {
      const item = itemFromTarget(this.actor, target);
      if (!item || !item.system.offersSpellChoice || item.system.chosenLevelOneSpell) return;
  
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
  
    /** Invoque le compagnon animal d'une Capacité `system.summonsCompanion` (ex. "Compagnon
     *  animal", Maître des bêtes/Rôdeur) : une seule fois par personnage (flag
     *  `beastCompanionCreated`, cf. helpers/companion.js), jamais recréé ensuite. */
    static async #onSummonCompanion(event, target) {
      const item = itemFromTarget(this.actor, target);
      if (!item || !item.system.summonsCompanion) return;
      if (this.actor.getFlag(SYSTEM_ID, "beastCompanionCreated")) return;
  
      await requestBeastCompanion(this.actor);
    }
  
    /** Dépense une charge de "Dés de manœuvre" (Maître de guerre, Guerrier) : contrairement à
     *  #onChooseFeatureOption (choix ponctuel et définitif), ce choix de manœuvre est reproposé à
     *  CHAQUE charge dépensée (cf. FeatureData#offersManeuverChoice, DND_CUSTOM.maneuvers,
     *  config.js) — même mécanique de dialogue que #offerEquipSlotDialog
     *  (sheets/inventory-drag-drop.js), juste rejouée à chaque utilisation plutôt qu'une fois. */
    static async #onUseManeuver(event, target) {
      const item = itemFromTarget(this.actor, target);
      if (!item || !item.system.offersManeuverChoice) return;
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
  
    /** Technique de la Main Ouverte (Open Hand, Moine, SRD 5e — chantier "8 sous-classes déjà à
     *  ≥1 mécanique", 2026-08-23) : sur un coup de Rafale de coups, choix d'un effet parmi 3 (cf.
     *  FeatureData#offersOpenHandTechnique/DND_CUSTOM.openHandEffects, config.js), reproposé à
     *  chaque utilisation (même dialogue que #onUseManeuver ci-dessus), puis jet de sauvegarde de
     *  Dextérité (simplifié — SRD 5e laisse la cible choisir Dex ou Force) pour CHAQUE cible
     *  actuellement ciblée, comparé au DD de Moine (8 + maîtrise + Sagesse, `saveDCAbility: "wis"`
     *  toujours réglé sur cette Capacité, jamais `spellcastingAbility[class]` — le Moine n'est pas
     *  une classe lanceuse). Ne consomme ni charge ni Action/Action bonus propres : rider gratuit
     *  d'un coup de Rafale de coups déjà comptabilisée séparément (costsResource: "Ki"). Échec :
     *  applique l'effet choisi (à terre -> toggleStatusEffect ; pas de réaction -> vide
     *  reactionAvailable UNIQUEMENT pour un personnage joueur, une cible PNJ n'a pas ce suivi ;
     *  repoussée -> non automatisé, laissé au MJ, cf. commentaire de la Capacité). */
    static async #onUseOpenHandTechnique(event, target) {
      const item = itemFromTarget(this.actor, target);
      if (!item || !item.system.offersOpenHandTechnique) return;
  
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
        await roll.evaluate();
        const success = roll.total >= dc;
        if (!success) {
          if (chosenEffect === "prone") await targetActor.toggleStatusEffect("prone", { active: true });
          else if (chosenEffect === "noReaction" && targetActor.type === "character") {
            await targetActor.update({ "system.combat.reactionAvailable": false });
          }
        }
        const resultKey = success ? "DND_CUSTOM.Roll.SaveSuccess" : "DND_CUSTOM.Roll.SaveFail";
        await roll.toMessage({
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
