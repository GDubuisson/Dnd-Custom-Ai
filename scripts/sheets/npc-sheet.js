import { DND_CUSTOM } from "../helpers/config.js";
import { formatModifier } from "../helpers/rules.js";
import { rollCheck, rollDamage } from "../helpers/rolls.js";
import { openAwardXpDialog } from "../helpers/xp.js";
import { checkSentinelReminder } from "../helpers/sentinel.js";
import { checkGiantKillerReminder } from "../helpers/giant-killer.js";
import { recordAttackOnTargets } from "../helpers/hunters-defense.js";
import { PENDING_OPPORTUNITY_DISADVANTAGE_FLAG } from "../helpers/opportunity-attack.js";
import { isDisadvantagedByHuntedTarget } from "../helpers/relentless-hunter.js";
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
      damageLabel: attack.damage.dice ? `${attack.damage.dice}${formatModifier(attackAbilityMod + attack.damage.bonus)}` : "",
      // Chantier "types de dégâts" (Phase 1, 2026-08-24) : cf. WeaponData#magic (item-data.js)
      // pour le détail — contourne la résistance/immunité GÉNÉRIQUE aux 3 types physiques.
      magic: attack.magic,
      // Chantier "types de dégâts" (Phase 3, 2026-08-24) : cf. NpcData#attack.secondaryDamage
      // (npc-data.js) pour le détail — dégâts bonus optionnels d'un second type (ex. morsure
      // perforant + poison), jamais de modificateur ajouté (dés fixes, contrairement à
      // damageLabel ci-dessus qui inclut le modificateur du profil principal).
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

    // Chantier "types de dégâts" (Phase 1, 2026-08-24) : 3 groupes de cases à cocher (un par
    // ensemble), même pattern que weaponProficiencyOptions (class-sheet.hbs/item-sheets.js) —
    // cf. damageAffinitySchema (shared-schema.js) pour le champ lui-même, damageTypeMultiplier
    // (dnd-custom-ai.js) pour la résolution.
    const damageAffinityOptions = (setField) =>
      Object.entries(DND_CUSTOM.damageTypes).map(([key, label]) => ({ key, label, checked: setField.has(key) }));
    context.damageAffinityGroups = [
      { field: "damageResistances", titleKey: "DND_CUSTOM.Npc.DamageResistances", options: damageAffinityOptions(system.damageResistances) },
      { field: "damageImmunities", titleKey: "DND_CUSTOM.Npc.DamageImmunities", options: damageAffinityOptions(system.damageImmunities) },
      {
        field: "damageVulnerabilities",
        titleKey: "DND_CUSTOM.Npc.DamageVulnerabilities",
        options: damageAffinityOptions(system.damageVulnerabilities)
      }
    ];

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
   *  chat — jamais d'interruption, le MJ/joueur reste libre d'agir ensuite.
   *
   *  `checkGiantKillerReminder` (helpers/giant-killer.js, chantier "8 sous-classes déjà à ≥1
   *  mécanique", 2026-08-23) : même principe, mais pour le Rôdeur LUI-MÊME quand il est touché
   *  ou manqué par un PNJ hostile de taille Grande ou plus à 1,50 m.
   *
   *  `recordAttackOnTargets` (helpers/hunters-defense.js, même chantier) : enregistre ce PNJ
   *  comme ayant attaqué CHAQUE cible ciblée qui est un personnage joueur — suivi générique SRD,
   *  consulté par Défense contre les attaques multiples (Tactiques défensives, Rôdeur Hunter).
   *
   *  `PENDING_OPPORTUNITY_DISADVANTAGE_FLAG` (helpers/opportunity-attack.js, même chantier) :
   *  "Échappée de la horde" (Tactiques défensives) — désavantage consommé sur CE jet si un
   *  Rôdeur avec ce choix vient de s'éloigner de ce PNJ précis, approximation assumée.
   *
   *  `isDisadvantagedByHuntedTarget` (helpers/relentless-hunter.js, Niveau C, 2026-08-25) : Traque
   *  implacable (Paladin, Serment de Vengeance) — désavantage si la cible actuellement ciblée
   *  porte l'état "Traqué" posé par un AUTRE Actor que ce PNJ (SRD : "toute créature autre que
   *  vous"), un PNJ attaquant étant concerné au même titre qu'un PJ. */
  static async #onRollAttack(event) {
    const attack = this.actor.system.attack;
    const abilityMod = this.actor.system.abilities[attack.ability]?.mod ?? 0;
    const hasPendingOpportunityDisadvantage = Boolean(this.actor.getFlag(SYSTEM_ID, PENDING_OPPORTUNITY_DISADVANTAGE_FLAG));
    if (hasPendingOpportunityDisadvantage) await this.actor.unsetFlag(SYSTEM_ID, PENDING_OPPORTUNITY_DISADVANTAGE_FLAG);
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
    if (isCriticalHit) await this.actor.setFlag(SYSTEM_ID, "pendingAttackCritical", true);
    await checkSentinelReminder(this.actor);
    await checkGiantKillerReminder(this.actor);
    await recordAttackOnTargets(this.actor);
  }

  /** Jet de dégâts du profil simplifié : dé(s) configuré(s) + modificateur de la même
   *  caractéristique que l'attaque (SRD 5e) + bonus fixe. Pas de bouton affiché tant qu'aucun
   *  dé n'est configuré (cf. npc-tab-stats.hbs > attack.damageDice). */
  static async #onRollAttackDamage() {
    const attack = this.actor.system.attack;
    if (!attack.damage.dice) return;
    const abilityMod = this.actor.system.abilities[attack.ability]?.mod ?? 0;
    const damageTypeLabel = attack.damage.type ? game.i18n.localize(DND_CUSTOM.damageTypes[attack.damage.type]) : "";
    const critical = Boolean(this.actor.getFlag(SYSTEM_ID, "pendingAttackCritical"));
    if (critical) await this.actor.unsetFlag(SYSTEM_ID, "pendingAttackCritical");
    await rollDamage({
      actor: this.actor,
      dice: attack.damage.dice,
      formula: formatModifier(abilityMod + attack.damage.bonus),
      flavor: `${game.i18n.format("DND_CUSTOM.Roll.WeaponDamage", {
        weapon: attack.name || game.i18n.localize("DND_CUSTOM.Npc.AttackDefaultName")
      })}${damageTypeLabel ? ` (${damageTypeLabel})` : ""}`,
      critical,
      damageType: attack.damage.type,
      isMagicalSource: attack.magic
    });

    // Dégâts BONUS d'une attaque aux propriétés magiques (chantier "types de dégâts", Phase 3,
    // 2026-08-24 — ex. une morsure qui inflige perforant + poison) : 2e message de dégâts
    // DISTINCT, son propre type, jamais de modificateur de caractéristique ajouté (SRD 5e : dés
    // fixes) — résolu indépendamment du 1er contre les résistances de la cible (cf.
    // damageTypeMultiplier, dnd-custom-ai.js). Même critique (dés doublés) que le composant
    // principal, cf. #onRollWeaponDamage (actor-sheet.js) pour le même principe côté PJ.
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
        })}${secondaryDamageTypeLabel ? ` (${secondaryDamageTypeLabel})` : ""}`,
        critical,
        damageType: attack.secondaryDamage.type,
        isMagicalSource: attack.magic
      });
    }
  }

  /** Ouvre la boîte de dialogue de distribution d'XP, montant pré-rempli avec le XP rapporté
   *  de ce PNJ (cf. scripts/helpers/xp.js). */
  static async #onAwardXp() {
    await openAwardXpDialog({ defaultAmount: this.actor.system.xpReward });
  }
}