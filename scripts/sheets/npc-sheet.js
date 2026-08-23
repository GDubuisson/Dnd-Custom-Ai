import { DND_CUSTOM } from "../helpers/config.js";
import { formatModifier } from "../helpers/rules.js";
import { rollCheck, rollDamage } from "../helpers/rolls.js";
import { openAwardXpDialog } from "../helpers/xp.js";
import { checkSentinelReminder } from "../helpers/sentinel.js";
import { InventoryDragDropMixin } from "./inventory-drag-drop.js";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

const SYSTEM_ID = "dnd-custom-ai";

/** Feuille d'ennemi/PNJ : ApplicationV2/ActorSheetV2, stats simplifiées (bonus direct,
 *  sauvegarde = bonus). Réutilisée telle quelle pour les types "mount" (montures vivantes) et
 *  "wildShapeForm" (formes de Forme sauvage, Druide, cf. dnd-custom-ai.js) : même fiche, juste
 *  un type d'Actor et un libellé différents. Le glisser-déposer (InventoryDragDropMixin) permet
 *  d'ajouter/retirer du butin ou de la sellerie via l'onglet "Butin". */
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
      rollAttackDamage: DndCustomNpcSheet.#onRollAttackDamage
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

  /** @override
   * Contexte partagé par tous les onglets : options des listes SRD (type, taille, FI)
   * et bonus de caractéristiques déjà formatés, pour garder les templates .hbs sans logique.
   */
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

    const hp = system.attributes.hp;
    context.hpPercent = Math.max(0, Math.min(100, Math.round((hp.value / (hp.max || 1)) * 100)));

    // Sauvegarde = bonus de caractéristique (pas de score ni de maîtrise séparée pour un PNJ).
    context.abilities = Object.entries(system.abilities).map(([key, ability]) => ({
      key,
      label: DND_CUSTOM.abilities[key],
      mod: ability.mod,
      modLabel: formatModifier(ability.mod)
    }));

    const items = this.actor.items.contents;
    context.lootItems = items.filter((item) => ["weapon", "armor", "gear", "tool"].includes(item.type));

    // Profil d'attaque simplifié (cf. NpcData#attack, npc-data.js — retour de test : un PNJ ne
    // pouvait pas attaquer du tout). `abilityMod` : celle des deux (Force/Dextérité) choisie par
    // le MJ, pilote à la fois le bonus d'attaque et de dégâts affichés (labels déjà formatés,
    // template sans logique). `damageTypeOptions` inclut une option vide en tête (type facultatif).
    const attack = system.attack;
    const attackAbilityMod = system.abilities[attack.ability]?.mod ?? 0;
    context.attack = {
      name: attack.name,
      defaultName: game.i18n.localize("DND_CUSTOM.Npc.AttackDefaultName"),
      abilityOptions: ["str", "dex"].map((key) => ({
        key,
        label: DND_CUSTOM.abilities[key],
        selected: attack.ability === key
      })),
      bonus: attack.bonus,
      attackBonusLabel: formatModifier(attackAbilityMod + attack.bonus),
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
      damageLabel: attack.damage.dice ? `${attack.damage.dice}${formatModifier(attackAbilityMod + attack.damage.bonus)}` : ""
    };

    // États SRD 5e (cf. CONFIG.statusEffects, scripts/dnd-custom-ai.js) : pas d'Exhaustion à
    // paliers pour un PNJ (stats déjà simplifiées, cf. commentaire de classe ci-dessus).
    context.conditions = CONFIG.statusEffects.map((status) => ({
      id: status.id,
      label: game.i18n.localize(status.name),
      img: status.img,
      active: this.actor.statuses.has(status.id)
    }));
    // Résumé affiché dans le libellé replié de la liste déroulante (cf. npc-tab-stats.hbs) sans
    // avoir à ouvrir le menu — même principe que la fiche personnage (actor-sheet.js).
    context.activeConditions = context.conditions.filter((condition) => condition.active);

    return context;
  }

  /** @override */
  async _preparePartContext(partId, context) {
    context = await super._preparePartContext(partId, context);
    if (context.tabs?.[partId]) context.tab = context.tabs[partId];
    return context;
  }

  /** Jet de caractéristique (1d20 + bonus) : sert aussi de jet de sauvegarde, identiques
   *  pour un PNJ (pas de maîtrise séparée, cf. commentaire de classe). */
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

  /** Bascule un état (cf. CONFIG.statusEffects) : Actor#toggleStatusEffect crée/retire
   *  l'ActiveEffect correspondante (méthode native Foundry). */
  static async #onToggleCondition(event, target) {
    await this.actor.toggleStatusEffect(target.dataset.key);
  }

  /** Jet d'Initiative : cf. DndCustomActorSheet#onRollInitiative (même mécanisme natif Foundry). */
  static async #onRollInitiative() {
    await this.actor.rollInitiative({ createCombatants: true });
  }

  /** Jet d'attaque du profil simplifié (cf. NpcData#attack, npc-data.js) : 1d20 + modificateur
   *  de la caractéristique choisie par le MJ + bonus fixe. Même mécanique que #onRollWeaponAttack
   *  (actor-sheet.js) — comparaison automatique à la CA des cibles ciblées, coups/échecs
   *  critiques en combat (1/20 naturel) : un coup critique pose un flag transitoire sur l'ACTOR
   *  (pas un Item, un PNJ n'a qu'un seul profil d'attaque, pas d'ambiguïté possible), consommé
   *  par le prochain jet de dégâts (#onRollAttackDamage) pour doubler ses dés.
   *
   *  `checkSentinelReminder` (helpers/sentinel.js, chantier "Combat automatisé avancé", cadrage
   *  du 2026-08-23) : après le jet, si ce PNJ est hostile et attaque une cible autre qu'un
   *  Combattant PJ à 1,50 m possédant Sentinelle avec réaction disponible, poste un rappel de
   *  chat — jamais d'interruption, le MJ/joueur reste libre d'agir ensuite. */
  static async #onRollAttack(event) {
    const attack = this.actor.system.attack;
    const abilityMod = this.actor.system.abilities[attack.ability]?.mod ?? 0;
    const { isCriticalHit } = await rollCheck({
      actor: this.actor,
      formula: formatModifier(abilityMod + attack.bonus),
      flavor: game.i18n.format("DND_CUSTOM.Roll.WeaponAttack", {
        weapon: attack.name || game.i18n.localize("DND_CUSTOM.Npc.AttackDefaultName")
      }),
      advantage: event.shiftKey,
      disadvantage: event.ctrlKey,
      compareToTargetAc: true,
      criticalRules: true
    });
    if (isCriticalHit) await this.actor.setFlag(SYSTEM_ID, "pendingAttackCritical", true);
    await checkSentinelReminder(this.actor);
  }

  /** Jet de dégâts du profil simplifié : dé(s) configuré(s) + modificateur de la même
   *  caractéristique que l'attaque (SRD 5e) + bonus fixe. Pas de bouton affiché tant qu'aucun
   *  dé n'est configuré (cf. npc-tab-stats.hbs > attack.damageDice). */
  static async #onRollAttackDamage() {
    const attack = this.actor.system.attack;
    if (!attack.damage.dice) return;
    const abilityMod = this.actor.system.abilities[attack.ability]?.mod ?? 0;
    const damageType = attack.damage.type ? game.i18n.localize(DND_CUSTOM.damageTypes[attack.damage.type]) : "";
    const critical = Boolean(this.actor.getFlag(SYSTEM_ID, "pendingAttackCritical"));
    if (critical) await this.actor.unsetFlag(SYSTEM_ID, "pendingAttackCritical");
    await rollDamage({
      actor: this.actor,
      dice: attack.damage.dice,
      formula: formatModifier(abilityMod + attack.damage.bonus),
      flavor: `${game.i18n.format("DND_CUSTOM.Roll.WeaponDamage", {
        weapon: attack.name || game.i18n.localize("DND_CUSTOM.Npc.AttackDefaultName")
      })}${damageType ? ` (${damageType})` : ""}`,
      critical
    });
  }

  /** Ouvre la boîte de dialogue de distribution d'XP, montant pré-rempli avec le XP rapporté
   *  de ce PNJ (cf. scripts/helpers/xp.js). */
  static async #onAwardXp() {
    await openAwardXpDialog({ defaultAmount: this.actor.system.xpReward });
  }
}