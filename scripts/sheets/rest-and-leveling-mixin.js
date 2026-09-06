import { DND_CUSTOM } from "../helpers/config.js";
import { spellSlotFillUpdates } from "../helpers/rules.js";
import { chooseSpellSlotRecovery } from "../helpers/spell-slot-choice.js";
import { grantClassContent } from "../helpers/class-content.js";
import { offerAbilityScoreOrFeatDialog } from "../helpers/level-up-choice.js";
import { offerSubclassChoiceDialog } from "../helpers/subclass-choice.js";

/** Mixin ApplicationV2 de la fiche de personnage : repos court/long (récupération de PV, des
 *  emplacements de sorts et des charges de Capacité), montée de niveau (octroi de contenu,
 *  fenêtres de choix sous-classe / Amélioration de caractéristiques ou Don) et ajustement manuel
 *  des caractéristiques. Extrait de `DndCustomActorSheet` (chantier de découpe pré-1.0).
 *  `#offerSpellSlotRecoveries` / `#spellSlotResetUpdates` vivent ici (appelés par les repos), pas
 *  dans le mixin d'incantation. `static DEFAULT_OPTIONS.actions` est fusionné par ApplicationV2
 *  sur toute la chaîne de mixins (cf. `InventoryDragDropMixin`). Pur déplacement de code. */
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

    /** Un personnage Mort (3 échecs de jet de sauvegarde contre la mort, cf. context.dying.dead)
     *  ne peut plus se reposer — filet de sécurité côté données, en complément du bouton masqué/
     *  désactivé côté template (character-sheet.hbs), même principe que les champs verrouillés
     *  MJ (cf. hook preUpdateActor, dnd-custom-ai.js). */
    #isDead() {
      return this.actor.system.attributes.death.failures >= 3;
    }
  
    /** Repos court (simplifié, pas de dés de vie) : récupère la moitié des PV max, sans
     *  dépasser le max. Restaure aussi les emplacements de sorts de l'Occultiste (Magie de Pacte,
     *  SRD 5e : seule classe qui récupère ses emplacements au repos court).
     *
     *  Règle maison (absente du SRD, cf. CharacterData#attributes.shortRestCount) : à partir du
     *  4e repos court depuis le dernier repos long (celui-ci inclus), CHAQUE repos court
     *  supplémentaire ajoute 1 point d'Épuisement (plafonné à 6, SRD) — décourage l'abus répété de
     *  repos courts plutôt qu'un unique repos long. Le soin de moitié des PV max ci-dessus reste
     *  lui inchangé, quel que soit ce compteur. */
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
      await this.actor.update(updates);
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
  
    /** Récupération arcanique/naturelle (cf. FeatureData#recoversSpellSlots, item-data.js) :
     *  retour de test — le texte SRD de ces deux Capacités ("une fois par jour, LORS D'UN REPOS
     *  COURT") n'était suivi par aucun code, le bouton de jet manuel restait cliquable à tout
     *  moment. Déclenchée ici pour chaque Capacité de ce type encore chargée (uses.value > 0,
     *  remis à zéro seulement au repos long, cf. #resetFeatureUses) : calcule le total de niveaux
     *  récupérables (rollFormula) et ouvre une fenêtre de répartition entre paliers
     *  (chooseSpellSlotRecovery, spell-slot-choice.js). La charge n'est consommée QUE si le
     *  joueur confirme une répartition non vide — annuler la fenêtre ou n'avoir aucun emplacement
     *  manquant à ce moment laisse la Capacité disponible pour un prochain repos court de la même
     *  journée (léger écart au SRD strict "une seule fois par jour", jugé préférable à perdre
     *  silencieusement l'occasion sans jet). */
    async #offerSpellSlotRecoveries() {
      const features = this.actor.items.contents.filter(
        (item) => item.type === "feature" && item.system.recoversSpellSlots && item.system.uses.value > 0
      );
      for (const feature of features) {
        const roll = new Roll(feature.system.rollFormula, this.actor.getRollData());
        await roll.evaluate();
        if (!roll.total) continue;
  
        const distribution = await chooseSpellSlotRecovery(feature.name, roll.total, this.actor.system.spells.slots);
        if (!distribution) continue;
  
        const slotUpdates = {};
        const parts = [];
        for (const [level, amount] of Object.entries(distribution)) {
          const slot = this.actor.system.spells.slots[level];
          slotUpdates[`system.spells.slots.${level}.value`] = Math.min(slot.max, slot.value + amount);
          parts.push(game.i18n.format("DND_CUSTOM.Spells.RecoveryLevelResult", { level, amount }));
        }
        await this.actor.update(slotUpdates);
        await feature.update({ "system.uses.value": 0 });
        await ChatMessage.create({
          speaker: ChatMessage.getSpeaker({ actor: this.actor }),
          content: game.i18n.format("DND_CUSTOM.Chat.SpellSlotsRecovered", {
            name: this.actor.name,
            feature: feature.name,
            list: parts.join(", ")
          })
        });
      }
    }
  
    /** Repos long : soigne intégralement et restaure tous les emplacements de sorts (SRD 5e). */
    static async #onRestLong() {
      if (this.#isDead()) return;
      const hp = this.actor.system.attributes.hp;
      const updates = {
        "system.attributes.hp.value": hp.max,
        // Remet à zéro le compteur de repos courts de la règle maison "Épuisement après le 4e
        // repos court" (cf. #onRestShort ci-dessus) — seul le repos long le réinitialise.
        "system.attributes.shortRestCount": 0,
        ...this.#spellSlotResetUpdates()
      };
      await this.actor.update(updates);
      // Un repos long inclut les bénéfices d'un repos court (SRD 5e) : les deux types de
      // récupération de charges de Capacité sont donc restaurés ici.
      await this.#resetFeatureUses(["shortRest", "longRest"]);
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: this.actor }),
        content: game.i18n.format("DND_CUSTOM.Chat.RestLong", { name: this.actor.name })
      });
    }
  
    #spellSlotResetUpdates() {
      return spellSlotFillUpdates(this.actor);
    }
  
    /** Restaure au maximum les charges des Capacités à utilisations limitées (system.uses.max
     *  > 0) dont le type de récupération figure dans `rechargeTypes` (cf. #onRestShort/Long). */
    async #resetFeatureUses(rechargeTypes) {
      const updates = this.actor.items.contents
        .filter(
          (item) =>
            item.type === "feature" && item.system.uses.max > 0 && rechargeTypes.includes(item.system.uses.recharge)
        )
        .map((item) => ({ _id: item.id, "system.uses.value": item.system.uses.max }));
      if (updates.length) await this.actor.updateEmbeddedDocuments("Item", updates);
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
  
    /** Monte le personnage d'UN niveau (jamais directement au niveau maximal éligible, cf.
     *  levelForXp) : PV max/emplacements de sorts/vitesse se recalculent automatiquement
     *  (CharacterData#prepareDerivedData). Accessible à tout propriétaire de la fiche, pas
     *  seulement au MJ (retour de test) : l'option `dndCustomLevelUp` est l'exception ciblée
     *  reconnue par le hook preUpdateActor (dnd-custom-ai.js) pour laisser passer `level` sans
     *  ouvrir les autres champs verrouillés MJ (classe/origine/caractéristiques...). Rend aussi
     *  tous les PV au joueur (retour de test — jusqu'ici seul le max se recalculait, les PV
     *  actuels restaient inchangés) et topper les emplacements de sorts au nouveau max (même
     *  logique que #spellSlotResetUpdates pour les boutons de repos — sans quoi un lanceur de
     *  sorts fraîchement monté de niveau reste à `value: 0` jusqu'à son prochain repos long). */
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
  
      // Nouvelles Capacités de classe/nouveaux Sorts disponibles à ce niveau (cf.
      // helpers/class-content.js) : octroyés automatiquement, annoncés dans le chat s'il y en a.
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
  
      // Choix de sous-classe, SRD 5e (cf. DND_CUSTOM.subclassLevel, config.js) : proposé dès que
      // le niveau requis est atteint et tant qu'aucune sous-classe n'est encore choisie (cf.
      // offerSubclassChoiceDialog, subclass-choice.js) — le sélecteur de l'en-tête reste
      // disponible en secours si cette fenêtre est fermée sans choisir.
      await offerSubclassChoiceDialog(this.actor, this.actor.system.class, next);
  
      // Amélioration de caractéristiques OU Don au choix, SRD 5e (règle optionnelle, cf.
      // commentaire de DND_CUSTOM.abilityScoreImprovementLevels) : proposée juste après
      // l'incrément de niveau (cf. offerAbilityScoreOrFeatDialog, level-up-choice.js). Un choix dû
      // mais pas encore résolu (fenêtre fermée sans choisir à une montée de niveau précédente,
      // system.attributes.pendingAsiChoices > 0, cf. schéma character-data.js) est reproposé en
      // plus de celui de ce niveau-ci, le cas échéant.
      if (DND_CUSTOM.abilityScoreImprovementLevels.includes(next)) {
        await this.actor.update({ "system.attributes.pendingAsiChoices": this.actor.system.attributes.pendingAsiChoices + 1 });
      }
      await this.#resolvePendingAsiChoices();
    }
  
    /** Reproposé tant que system.attributes.pendingAsiChoices > 0 : un choix Amélioration/Don dû
     *  reste dû (jamais perdu) jusqu'à ce qu'il soit réellement appliqué (cf.
     *  offerAbilityScoreOrFeatDialog, level-up-choice.js, qui gère elle-même le va-et-vient entre
     *  ses propres fenêtres). S'arrête dès qu'une fenêtre est fermée sans choisir, pour laisser la
     *  main au joueur plutôt que de le forcer en boucle — le badge de l'en-tête (cf.
     *  #onResolvePendingAsi) reste alors le rattrapage manuel. */
    async #resolvePendingAsiChoices() {
      while (this.actor.system.attributes.pendingAsiChoices > 0) {
        const applied = await offerAbilityScoreOrFeatDialog(this.actor);
        if (!applied) return;
        await this.actor.update({ "system.attributes.pendingAsiChoices": this.actor.system.attributes.pendingAsiChoices - 1 });
      }
    }
  
    /** Bouton de rattrapage manuel de l'en-tête (badge visible tant que system.attributes.
     *  pendingAsiChoices > 0, character-sheet.hbs) : permet de résoudre un choix Amélioration/Don
     *  dû sans attendre la prochaine montée de niveau (retour de test — fermer la fenêtre sans
     *  choisir le perdait auparavant pour toujours, faute d'un tel rattrapage). */
    static async #onResolvePendingAsi() {
      await this.#resolvePendingAsiChoices();
    }
  };
}
