import { DND_CUSTOM } from "../helpers/config.js";
import {
  abilityModifier,
  proficiencyBonus,
  formatModifier,
  hasFeature,
  spellSaveDC,
  spellAttackBonus,
  targetSaveModifier,
  spellSlotsForClass
} from "../helpers/rules.js";
import { rollCheck, rollDamage, rollHeal, sheetRollFlags } from "../helpers/rolls.js";
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

// Capacités (world-items/features.json) conférant l'incantation rituelle gratuite (cf.
// #resolveSpellSlotCost) : une par classe qui l'a en SRD 5e et pour laquelle elle est modélisée ici.
const RITUAL_CASTING_FEATURES = ["Incantation rituelle (Clerc)", "Incantation rituelle (Druide)"];

/** Mixin ApplicationV2 de la fiche de personnage : l'incantation (bouton "Lancer" d'un sort) et
 *  ses sous-étapes — coût en emplacement / surclassement / Incantation rituelle, concentration,
 *  lumière, puis délégation par type de sort (attaque / sauvegarde / soin / condition sans jet),
 *  jet de dégâts différé, abandon de concentration. Extrait de `DndCustomActorSheet` (découpe
 *  pré-1.0). `#onSelectSpellLevel` + le champ `#activeSpellLevel` (état d'onglet, lu par la
 *  préparation de contexte) restent dans la classe de base. `static DEFAULT_OPTIONS.actions` est
 *  fusionné par ApplicationV2 sur toute la chaîne de mixins. Pur déplacement de code. */
export function SpellcastingSheetMixin(Base) {
  return class SpellcastingSheet extends Base {
    static DEFAULT_OPTIONS = {
      actions: {
        castSpell: SpellcastingSheet.#onCastSpell,
        rollSpellDamage: SpellcastingSheet.#onRollSpellDamage,
        dropConcentration: SpellcastingSheet.#onDropConcentration
      }
    };

  
    /** Lance un sort de l'onglet Sorts : décompte 1 charge d'un emplacement de sort (système réel
     *  par palier 1-9, cf. rules.js > spellSlotsForClass et helpers/spell-slot-choice.js pour le
     *  surclassement), sans effet pour un tour de magie (niveau 0). Un sort marqué "jet d'attaque"
     *  (`system.attack`, cf. SpellData dans item-data.js) fait un jet d'attaque de sort (1d20 +
     *  spellAttackBonus, comme #onRollWeaponAttack pour une arme) au lieu de simplement poster la
     *  description ; le jet de dégâts associé reste un bouton séparé (#onRollSpellDamage,
     *  affiché seulement si un hit est confirmé), sur le même principe que les armes — dégâts non
     *  automatiques tant que le MJ n'a pas confirmé le jet d'attaque contre la CA de la cible.
     *
     *  Chantier clean code (2026-09-05) : orchestre désormais 4 étapes communes à tout sort
     *  (coût en emplacement, concentration, lumière) puis délègue à une méthode dédiée par type de
     *  sort (#castAttackSpell/#castSaveSpell/#castHealSpell/#applySpellCondition) — pur
     *  déplacement de code, comportement inchangé. */
    static async #onCastSpell(event, target) {
      const item = itemFromTarget(this.actor, target);
      if (!item || item.type !== "spell") return;
      if (!(await consumeActionEconomy(this.actor, item))) return;
  
      const effectiveSpellLevel = await this.#resolveSpellSlotCost(item);
      if (effectiveSpellLevel === null) return;
  
      await this.#applySpellConcentration(item);
  
      // Sort émettant de la lumière (ex. Lumière, cf. SpellData#light dans item-data.js) : allume
      // le(s) token(s) du lanceur, même principe qu'un objet `gear` "light" (#toggleLight) —
      // retour de test, rien ne liait jusqu'ici les sorts de lumière au système de lumière des
      // tokens. Un sort n'a pas d'état "allumé/éteint" persistant à basculer (contrairement à un
      // objet porté, réutilisable via le même bouton "Utiliser") : chaque lancer allume, sans
      // interrupteur dédié — cohérent avec un effet magique que le MJ narrativise à sa fin.
      // `#setTokensLight` poste déjà son propre message "allume {sort}" : retour de test, un
      // second message générique "lance {sort}" (plus bas) s'ajoutait en double pour la même
      // action — sauté ici (sauf sort d'attaque, qui poste son propre jet de toute façon).
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
  
    /** Détermine le palier RÉELLEMENT dépensé pour lancer `item` (peut différer de son niveau
     *  propre en cas de surclassement, cf. spell-slot-choice.js), et décompte l'emplacement/
     *  déclenche Surtenance sauvage si le lancer n'est pas gratuit — ou consomme la charge dédiée
     *  pour un sort choisi par Magie d'initié (cf. _prepareCharacterStatsContext... non, cf.
     *  FeatureData#chosenLevelOneSpell, item-data.js). Incantation rituelle/Incantation mineure de
     *  sous-classe : jamais décomptées d'un emplacement (cf. commentaires ci-dessous). Retourne
     *  `null` si aucun emplacement n'est disponible (avertissement déjà posté) — l'appelant doit
     *  alors abandonner le lancer sans rien d'autre à faire. Extrait de #onCastSpell (chantier
     *  clean code, 2026-09-05). */
    async #resolveSpellSlotCost(item) {
      // Incantation rituelle (Capacité, SRD 5e) : un sort marqué Rituel se lance sans dépenser de
      // charge dès que le personnage possède la Capacité "Incantation rituelle (<sa classe>)" —
      // appliqué automatiquement, sans case à cocher ni choix à faire pour le joueur. Seuls le
      // Clerc et le Druide ont cette Capacité dans world-items/features.json (SRD 5e : Magicien
      // aussi, mais uniquement pour les sorts déjà inscrits dans son grimoire — non modélisé ici,
      // cf. simplification des Capacités de classe).
      const castsAsFreeRitual =
        item.system.ritual && RITUAL_CASTING_FEATURES.some((name) => hasFeature(this.actor.items.contents, name));
      // Incantation mineure de sous-classe (ex. Chevalier occulte, Guerrier — cf.
      // FeatureData#grantsSpells) : ces Sorts sont "toujours prêts", jamais décomptés d'un
      // emplacement — sans quoi ils resteraient inutilisables pour une classe non lanceuse (tous
      // paliers à 0/0, cf. rules.js > spellSlotsForClass). Cherche parmi les Capacités possédées
      // plutôt que sur le Sort lui-même : c'est la Capacité qui déclare la liste, jamais le Sort.
      const castsAsFreeSubclassSpell = this.actor.items.some(
        (feature) => feature.type === "feature" && feature.system.grantsSpells?.has?.(item.name)
      );
      // Don "Magie d'initié" (cf. FeatureData#offersSpellChoice/chosenLevelOneSpell) : le sort de
      // niveau 1 choisi se lance GRATUITEMENT une fois entre deux repos longs (SRD 5e), au-delà il
      // redevient un sort normal (décompte un emplacement du personnage comme les autres, cf.
      // commentaire de chosenLevelOneSpell dans item-data.js). Charge réutilisée directement sur
      // le don lui-même (`uses`, réglé au moment du choix), consommée plus bas une fois le
      // contournement confirmé.
      const initiateFeature = this.actor.items.find(
        (feature) => feature.type === "feature" && feature.system.chosenLevelOneSpell === item.name
      );
      const castsAsFreeInitiateSpell = Boolean(initiateFeature && initiateFeature.system.uses.value > 0);
      // Palier RÉELLEMENT dépensé (peut différer de item.system.level en cas de surclassement) —
      // sert au bonus de soin de Disciple de la vie (Life, Clerc) dans #castHealSpell.
      let effectiveSpellLevel = item.system.level;
      if (item.system.level > 0 && !castsAsFreeRitual && !castsAsFreeSubclassSpell && !castsAsFreeInitiateSpell) {
        const slots = this.actor.system.spells.slots;
        // Détermine quel palier dépenser (le sien si disponible, sinon propose un surclassement
        // vers un palier supérieur disponible, cf. spell-slot-choice.js) : renvoie null si aucun
        // palier utilisable (épuisé ou dialogue annulé par le joueur).
        const chosenLevel = await chooseSpellSlotLevel(item.name, item.system.level, slots);
        if (chosenLevel === null) {
          ui.notifications.warn(game.i18n.localize("DND_CUSTOM.Spells.NoSlotAvailable"));
          return null;
        }
        effectiveSpellLevel = chosenLevel;
        await this.actor.update({ [`system.spells.slots.${chosenLevel}.value`]: slots[chosenLevel].value - 1 });
  
        // Voie de la Magie sauvage (Ensorceleur, cf. world-items/subclasses.json > "wildSorcery") :
        // Surtenance sauvage tirée à chaque emplacement de sort réellement dépensé — même
        // primitive (P1) que la Voie de la Magie sauvage du Barbare, table de tirage distincte
        // (rollWildSurge indexe par classe, pas par sous-classe : "wildMagic"/Barbare et
        // "wildSorcery"/Ensorceleur ne se confondent jamais).
        if (this.actor.system.subclass === "wildSorcery") await rollWildSurge(this.actor, "sorcerer");
      } else if (castsAsFreeInitiateSpell) {
        await initiateFeature.update({ "system.uses.value": 0 });
      }
      return effectiveSpellLevel;
    }
  
    /** Concentration, SRD 5e : un seul sort à la fois — en lancer un nouveau remplace celui en
     *  cours (pas de choix à faire, la règle est automatique). Extrait de #onCastSpell (chantier
     *  clean code, 2026-09-05). */
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
  
    /** Sort marqué "jet d'attaque" (cf. #onCastSpell) : jet d'attaque de sort (1d20 +
     *  spellAttackBonus), même mécanique que #onRollWeaponAttack pour une arme (criticalRules/
     *  pendingCritical, flag posé sur CE sort précis, consommé par #onRollSpellDamage). Extrait de
     *  #onCastSpell (chantier clean code, 2026-09-05). */
    async #castAttackSpell(item, event) {
      const system = this.actor.system;
      const spellAbility = DND_CUSTOM.spellcastingAbility[system.class];
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
  
    /** Sort à jet de sauvegarde de la cible (ex. Boule de feu, cf. SpellData#save dans
     *  item-data.js) : auto-jet POUR CHAQUE cible actuellement ciblée (1d20 + son propre
     *  modificateur de sauvegarde, rules.js > targetSaveModifier), comparé au DD du lanceur —
     *  même niveau d'automatisation que le jet d'attaque (compareToTargetAc), jamais une
     *  interruption du client de la cible. Le dé de dégâts éventuel (system.damage.dice) se lance
     *  séparément via le même bouton "Dégâts" que pour un sort d'attaque (#onRollSpellDamage,
     *  déjà indifférent à attack/save) ; son application (pleine ou moitié selon halfOnSave) reste
     *  manuelle via "Appliquer les dégâts", comme pour une attaque qui touche/rate déjà aujourd'hui.
     *  Extrait de #onCastSpell (chantier clean code, 2026-09-05). */
    async #castSaveSpell(item, event) {
      const system = this.actor.system;
      const spellAbility = DND_CUSTOM.spellcastingAbility[system.class];
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
  
      // Sort Prudent/Sort Élevé (Métamagie, Ensorceleur, cf. helpers/metamagic.js) : Maj/Ctrl-clic
      // sur "Lancer" propose de dépenser 1 point de sorcellerie pour faire réussir automatiquement
      // (Prudent) ou désavantager (Élevé) le jet d'UNE cible ciblée — aucune touche maintenue,
      // aucune Capacité "Métamagie" ou aucun point restant : `null` immédiat, comportement
      // inchangé, jamais de fenêtre popup pour le cas courant.
      const metamagic = await chooseMetamagicOption(this.actor, targets, {
        careful: event.shiftKey,
        heightened: event.ctrlKey
      });
      // Sculpteur de sorts (Évocation, Magicien, cf. helpers/sculpt-spells.js) : même Maj-clic
      // que Sort Prudent ci-dessus mais gratuit — jamais les deux à la fois en pratique (classes
      // différentes), donc pas de conflit si les deux helpers sont interrogés systématiquement.
      const sculptedTargetId = await chooseSculptSpellsTarget(this.actor, targets, { careful: event.shiftKey });
  
      // halfOnSave (chantier "prérequis Évasion/Tour de magie renforcé", Niveau C, 2026-08-24) :
      // pose sur la CIBLE le résultat du jet (réussite/échec) pour que #onRollSpellDamage +
      // "Appliquer les dégâts" (helpers/damage-resolution.js > applyDamageToTargets) puisse appliquer
      // automatiquement la bonne fraction de dégâts plus tard — jamais fait jusqu'ici (le bouton
      // appliquait toujours le montant plein, quel que soit le résultat de CE jet). Un seul
      // exemplaire par cible (`setFlag` écrase le précédent) : lancer un 2e sort à sauvegarde sur
      // la même cible sans avoir appliqué les dégâts du 1er perd silencieusement son résultat —
      // simplification acceptée avec l'utilisateur, jamais de risque d'appliquer le MAUVAIS
      // multiplicateur au mauvais sort (spellName revérifié à la consommation, dnd-custom-ai.js).
      // `requestActorUpdate` plutôt qu'un `targetActor.setFlag` direct : la cible est souvent un PNJ
      // non possédé par le joueur qui lance le sort — `setFlag` (donc `Actor#update`) lèverait alors
      // "User lacks permission to update ActorDelta..." au lieu d'échouer silencieusement. Le relais
      // délègue au MJ actif, comme `applyDamageToTargets` (helpers/damage-resolution.js).
      const setPendingSpellSaveOutcome = (targetActor, success) =>
        requestActorUpdate(targetActor, {
          [`flags.${SYSTEM_ID}.pendingSpellSaveOutcome`]: {
            success,
            halfOnSave: item.system.save.halfOnSave,
            ability: item.system.save.ability,
            spellLevel: item.system.level,
            spellName: item.name
          }
        });
  
      for (const token of targets) {
        const targetActor = token.actor;
        if (!targetActor?.system?.abilities) continue;
  
        if (metamagic?.targetActorId === targetActor.id && metamagic.option === "careful") {
          await setPendingSpellSaveOutcome(targetActor, true);
          await ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ actor: targetActor }),
            content: game.i18n.format("DND_CUSTOM.Roll.MetamagicCarefulSuccess", { name: targetActor.name, spell: item.name })
          });
          continue;
        }
        if (sculptedTargetId === targetActor.id) {
          await setPendingSpellSaveOutcome(targetActor, true);
          await ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ actor: targetActor }),
            content: game.i18n.format("DND_CUSTOM.Roll.SculptSpellsSuccess", { name: targetActor.name, spell: item.name })
          });
          continue;
        }
  
        const mod = targetSaveModifier(targetActor.system, item.system.save.ability);
        const heightened = metamagic?.targetActorId === targetActor.id && metamagic.option === "heightened";
        // Défense contre les attaques multiples (Tactiques défensives, Rôdeur Hunter — chantier
        // "8 sous-classes déjà à ≥1 mécanique", 2026-08-23) : avantage si CE lanceur a déjà
        // attaqué la cible ce round. "Volonté de fer" (cf. hasSteadfastAdvantage) s'applique
        // aussi depuis que les Sorts ont un `appliesCondition` (Niveau B, cf.
        // ClaudeFiles/MECANIQUES_A_AUTOMATISER.md) — ne se déclenche en pratique que si le sort
        // pose Effrayé sur échec, aucun des sorts SRD actuellement automatisés ici. S'annule avec
        // Sort Élevé (Métamagie) comme avantage/désavantage normalement (même logique que
        // rollCheck, rolls.js).
        const hasDefenseAdvantage =
          (hasMultiattackDefenseAdvantage(targetActor, this.actor) ||
            hasSteadfastAdvantage(targetActor, item.system.save.appliesCondition)) &&
          !heightened;
        const useDisadvantage = heightened && !hasMultiattackDefenseAdvantage(targetActor, this.actor);
        const die = hasDefenseAdvantage ? "2d20kh1" : useDisadvantage ? "2d20kl1" : "1d20";
        const roll = new Roll(`${die}${formatModifier(mod)}`);
        await roll.evaluate();
        const success = roll.total >= dc;
        // Applique automatiquement la condition configurée sur échec (ex. paralysé pour
        // Immobilisation de personne), même mécanisme que #onRollFeatureSave ci-dessus.
        if (!success && item.system.save.appliesCondition) {
          await requestToggleStatusEffect(targetActor, item.system.save.appliesCondition, true);
        }
        await setPendingSpellSaveOutcome(targetActor, success);
        const resultKey = success
          ? item.system.save.halfOnSave
            ? "DND_CUSTOM.Roll.SaveSuccessHalf"
            : "DND_CUSTOM.Roll.SaveSuccess"
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
  
    /** Sort de soin (ex. Mot de guérison, Soin des blessures, cf. SpellData#heal dans
     *  item-data.js) : lance le dé de soin + modificateur de caractéristique d'incantation
     *  immédiatement (contrairement aux dégâts d'un sort d'attaque, un soin n'a pas besoin de
     *  confirmation de touche) — retour de test, ces sorts ne lançaient jusqu'ici aucun dé et ne
     *  soignaient rien. Le bouton "Appliquer le soin" affiché sur ce message (dnd-custom-ai.js)
     *  applique le total aux cibles actuellement ciblées, même mécanique que les dégâts. Extrait
     *  de #onCastSpell (chantier clean code, 2026-09-05). */
    async #castHealSpell(item, effectiveSpellLevel) {
      const system = this.actor.system;
      const spellAbility = DND_CUSTOM.spellcastingAbility[system.class];
      const spellAbilityMod = spellAbility ? abilityModifier(system.abilities[spellAbility].total) : 0;
      // Disciple de la vie (Life, Clerc, SRD 5e — chantier "8 sous-classes déjà à ≥1 mécanique",
      // 2026-08-23) : +2 PV sur tout sort de niveau 1+ qui soigne, +1 de plus par palier
      // au-delà du premier (surclassement inclus, cf. effectiveSpellLevel). Un tour de
      // magie (niveau 0) n'en bénéficie jamais.
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
  
    /** Sort qui pose un état sans jet associé (ex. Invisibilité, Invisibilité suprême, cf.
     *  SpellData#grantsCondition dans item-data.js) : bascule l'état configuré sur chaque cible
     *  actuellement ciblée (même convention de ciblage que save/heal — pour se rendre soi-même
     *  invisible, le lanceur doit se cibler lui-même). Pas de jet, donc pas de message dédié :
     *  l'appelant (#onCastSpell) enchaîne ensuite sur le message générique "lance {sort}". Extrait
     *  de #onCastSpell (chantier clean code, 2026-09-05). */
    async #applySpellCondition(item) {
      const targets = Array.from(game.user.targets);
      if (!targets.length) {
        ui.notifications.warn(game.i18n.localize("DND_CUSTOM.Chat.NoTarget"));
        return;
      }
      for (const token of targets) {
        if (!token.actor) continue;
        // Relais MJ (cf. #castSaveSpell) : la cible peut être un PNJ non possédé par le lanceur.
        await requestToggleStatusEffect(token.actor, item.system.grantsCondition, true);
      }
    }
  
  
    /** Jet de dégâts d'un sort d'attaque (cf. #onCastSpell) : juste le(s) dé(s) de dégâts
     *  configurés sur le sort, sans modificateur — contrairement à une arme, les dégâts d'un
     *  sort SRD 5e n'ajoutent pas le modificateur de caractéristique d'incantation (sauf mention
     *  explicite du sort, non modélisée ici) — SAUF si l'Actor possède une Capacité dont
     *  `boostsSpellDamage` cible ce Sort par son nom exact (ex. "Salve implacable"/Agonizing
     *  Blast, Invocation occulte de l'Occultiste, qui ajoute le modificateur de Cha aux dégâts de
     *  "Décharge occulte" — cf. FeatureData#boostsSpellDamage, item-data.js). */
    static async #onRollSpellDamage(event, target) {
      const item = itemFromTarget(this.actor, target);
      if (!item || item.type !== "spell" || !item.system.damage.dice) return;
  
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
  
      // Affinité élémentaire (Ensorceleur, Lignage draconique 6, SRD 5e) : modificateur de
      // Charisme ajouté aux dégâts d'un sort dont le TYPE correspond au lignage draconique choisi
      // (`system.combat.draconicResistanceType`, cf. Résilience draconique) — contrairement à
      // `boostsSpellDamage` ci-dessus (ciblé par nom de Sort exact), ce bonus se déclenche par
      // correspondance de type, jamais les deux en pratique (classes différentes).
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
        flavor: `${game.i18n.format("DND_CUSTOM.Roll.SpellDamage", { spell: item.name })}${damageTypeLabel ? ` (${damageTypeLabel})` : ""}`,
        damageType: item.system.damage.type,
        isSpellDamage: true,
        spellName: item.name,
        // Chantier "types de dégâts" (Phase 1, 2026-08-24) : un sort est toujours considéré
        // magique au SRD 5e (contourne la résistance/immunité générique "contre les attaques non
        // magiques", cf. damageTypeMultiplier, helpers/damage-resolution.js).
        isMagicalSource: true
      });
    }
  
    /** Rompt volontairement la concentration en cours (SRD 5e : possible à tout moment). */
    static async #onDropConcentration() {
      await this.actor.update({ "system.spells.concentratingOn": "" });
    }
  };
}
