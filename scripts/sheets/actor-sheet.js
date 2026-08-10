import { DND_CUSTOM } from "../helpers/config.js";
import {
  abilityModifier,
  proficiencyBonus,
  armorContribution,
  carryingCapacity,
  carryingCapacityBonus,
  carriedWeight,
  currencyTotalInCopper,
  equipmentSlots,
  formatModifier,
  isProficientWithWeapon,
  levelForXp,
  passivePerception,
  skillModifier,
  spellSaveDC,
  spellAttackBonus,
  toolCheckModifier,
  weaponAttackDamage
} from "../helpers/rules.js";
import { InventoryDragDropMixin } from "./inventory-drag-drop.js";
import { rollCheck, rollDamage } from "../helpers/rolls.js";
import { CharacterCreationWizard } from "./character-creation-wizard.js";
import { declareDeath } from "../helpers/death.js";
import { openAbilityScoreImprovementDialog } from "../helpers/ability-score-improvement.js";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

const SYSTEM_ID = "dnd-custom-ai";

// Niveau d'Exhaustion à partir duquel chaque catégorie de jet est désavantagée, SRD 5e.
const EXHAUSTION_CHECK_DISADVANTAGE_LEVEL = 1;
const EXHAUSTION_ATTACK_SAVE_DISADVANTAGE_LEVEL = 3;

/** Avantage/désavantage automatique selon les états actifs (cf. CONFIG.statusEffects) et le
 *  niveau d'Exhaustion — seules les règles univoques et propres au personnage qui jette sont
 *  automatisées (pas d'effets dépendant d'une cible/de la position, hors du scope "combat
 *  automatisé avancé" explicitement exclu de ce système, cf. PROJECT.md). `kind` : "check"
 *  (test de caractéristique/compétence), "save" (sauvegarde), "attack" (jet d'attaque). */
function conditionRollEffects(actor, kind, abilityKey) {
  const statuses = actor.statuses;
  const exhaustion = actor.system.attributes?.exhaustion ?? 0;
  let advantage = false;
  let disadvantage = false;

  if (kind === "check") {
    disadvantage =
      statuses.has("poisoned") || statuses.has("frightened") || exhaustion >= EXHAUSTION_CHECK_DISADVANTAGE_LEVEL;
  } else if (kind === "attack") {
    disadvantage =
      statuses.has("poisoned") ||
      statuses.has("frightened") ||
      statuses.has("restrained") ||
      statuses.has("prone") ||
      statuses.has("blinded") ||
      exhaustion >= EXHAUSTION_ATTACK_SAVE_DISADVANTAGE_LEVEL;
    advantage = statuses.has("invisible");
  } else if (kind === "save") {
    disadvantage =
      exhaustion >= EXHAUSTION_ATTACK_SAVE_DISADVANTAGE_LEVEL || (abilityKey === "dex" && statuses.has("restrained"));
  }
  return { advantage, disadvantage };
}

/** Emplacement à décompter pour lancer un sort de niveau `spellLevel` : correspond
 *  normalement à ce même niveau (pas de surclassement/upcasting dans ce système), sauf pour
 *  l'Occultiste (Magie de Pacte, SRD 5e) dont tous les sorts consomment l'unique palier de
 *  sorts actif, quel que soit leur propre niveau. */
function resolveSpellSlotLevel(actor, spellLevel) {
  if (actor.system.class === "warlock") {
    const pactLevel = Object.entries(actor.system.spells.slots).find(([, slot]) => slot.max > 0)?.[0];
    if (pactLevel) return pactLevel;
  }
  return String(spellLevel);
}

/** Feuille de personnage joueur : un onglet Handlebars par PART, ApplicationV2/ActorSheetV2.
 *  Le glisser-déposer d'objets (InventoryDragDropMixin) permet de transférer un objet vers/
 *  depuis un autre Actor ouvert (ex. la fiche d'un véhicule). */
export class DndCustomActorSheet extends InventoryDragDropMixin(HandlebarsApplicationMixin(ActorSheetV2)) {
  static DEFAULT_OPTIONS = {
    classes: [SYSTEM_ID, "sheet", "actor", "character"],
    tag: "form",
    position: { width: 720, height: 720 },
    window: { resizable: true },
    form: { submitOnChange: true, closeOnSubmit: false },
    actions: {
      restShort: DndCustomActorSheet.#onRestShort,
      restLong: DndCustomActorSheet.#onRestLong,
      abilityIncrease: DndCustomActorSheet.#onAbilityIncrease,
      abilityDecrease: DndCustomActorSheet.#onAbilityDecrease,
      useItem: DndCustomActorSheet.#onUseItem,
      rollAbility: DndCustomActorSheet.#onRollAbility,
      rollSave: DndCustomActorSheet.#onRollSave,
      rollSkill: DndCustomActorSheet.#onRollSkill,
      rollWeaponAttack: DndCustomActorSheet.#onRollWeaponAttack,
      rollWeaponDamage: DndCustomActorSheet.#onRollWeaponDamage,
      toggleCondition: DndCustomActorSheet.#onToggleCondition,
      exhaustionIncrease: DndCustomActorSheet.#onExhaustionIncrease,
      exhaustionDecrease: DndCustomActorSheet.#onExhaustionDecrease,
      castSpell: DndCustomActorSheet.#onCastSpell,
      dropConcentration: DndCustomActorSheet.#onDropConcentration,
      rollInitiative: DndCustomActorSheet.#onRollInitiative,
      levelUp: DndCustomActorSheet.#onLevelUp,
      openCreationWizard: DndCustomActorSheet.#onOpenCreationWizard,
      openClassSheet: DndCustomActorSheet.#onOpenClassSheet,
      openOriginSheet: DndCustomActorSheet.#onOpenOriginSheet,
      rollDeathSave: DndCustomActorSheet.#onRollDeathSave,
      rollFeature: DndCustomActorSheet.#onRollFeature,
      useFeatureCharge: DndCustomActorSheet.#onUseFeatureCharge
    }
  };

  static PARTS = {
    header: { template: `systems/${SYSTEM_ID}/templates/actor/character-sheet.hbs` },
    tabs: { template: "templates/generic/tab-navigation.hbs" },
    stats: { template: `systems/${SYSTEM_ID}/templates/actor/tab-stats.hbs` },
    equipment: { template: `systems/${SYSTEM_ID}/templates/actor/tab-equipment.hbs` },
    inventory: { template: `systems/${SYSTEM_ID}/templates/actor/tab-inventory.hbs` },
    abilities: { template: `systems/${SYSTEM_ID}/templates/actor/tab-abilities.hbs` },
    journal: { template: `systems/${SYSTEM_ID}/templates/actor/tab-journal.hbs` }
  };

  static TABS = {
    primary: {
      tabs: [
        { id: "stats", icon: "fa-solid fa-chart-simple" },
        { id: "equipment", icon: "fa-solid fa-shield-halved" },
        { id: "inventory", icon: "fa-solid fa-sack" },
        { id: "abilities", icon: "fa-solid fa-book-sparkles" },
        { id: "journal", icon: "fa-solid fa-feather" }
      ],
      initial: "stats",
      labelPrefix: "DND_CUSTOM.Tabs"
    }
  };

  /** @override
   * Construit le contexte partagé par tous les onglets (PARTS) : valeurs brutes du système
   * + valeurs dérivées (modificateurs, bonus de maîtrise, poids, richesse) calculées ici
   * pour garder les templates .hbs sans logique.
   */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const system = this.actor.system;

    context.actor = this.actor;
    context.system = system;
    context.config = DND_CUSTOM;
    context.isGM = game.user.isGM;
    // Chargées une fois au démarrage par le hook "init" (voir dnd-custom-ai.js).
    context.origins = game.dndCustomAi?.origins ?? {};
    // Classe/Origine : champs fixes sur la fiche (retour de test — ne sont plus des listes
    // déroulantes, la seule façon de les définir/changer est l'assistant de création, cf.
    // #onOpenClassSheet/#onOpenOriginSheet ci-dessous pour l'ouverture de leur description).
    context.classLabel = system.class ? game.i18n.localize(DND_CUSTOM.classes[system.class]) : "";
    context.originLabel = context.origins[system.origin]?.label ?? "";
    // Bouton "Créer un personnage" masqué une fois Classe ET Origine renseignées (même
    // condition que l'ouverture automatique de l'assistant sur un Actor vierge, cf.
    // Hooks.on("createActor"), dnd-custom-ai.js) : retour de test — il n'y avait plus lieu de
    // le proposer une fois le personnage construit, et le relancer par erreur écraserait ses
    // choix (SRD 5e, points de vie, équipement de départ) sans confirmation.
    context.showCreationWizardButton = !(system.class && system.origin);

    context.isSpellcaster = DND_CUSTOM.spellcastingClasses.includes(system.class);

    // Origine choisie : bonus de caractéristiques déjà appliqués dans system.abilities.*.total
    // (cf. CharacterData#prepareDerivedData) ; avantage de compétences et trait spécial sont
    // purement informatifs (pas de système de jet de dés automatisé sur cette fiche).
    const currentOrigin = context.origins[system.origin] ?? null;
    const originAbilityBonuses = currentOrigin?.abilityBonuses ?? {};
    const originSkillAdvantages = new Set(currentOrigin?.skillAdvantages ?? []);
    context.originTrait = currentOrigin?.specialTrait ?? null;

    const hp = system.attributes.hp;
    context.hpPercent = Math.max(0, Math.min(100, Math.round((hp.value / (hp.max || 1)) * 100)));

    context.proficiencyBonus = proficiencyBonus(system.attributes.level);
    // Indicateur "niveau disponible" (bouton MJ) : ne révèle jamais le total d'XP lui-même
    // au joueur (cf. PROJECT.md > "Système de progression", XP toujours caché au joueur).
    context.levelUpAvailable = levelForXp(system.xp) > system.attributes.level;

    // Panneau Agonie (SRD 5e) : visible tant que le personnage est à 0 PV et n'a pas encore
    // atteint 3 réussites (stabilisé) ou 3 échecs (mort) — cf. hook updateActor dans
    // dnd-custom-ai.js qui gère la transition et le décompte automatique.
    const death = system.attributes.death;
    context.dying = {
      active: hp.value === 0,
      stabilized: death.successes >= 3,
      dead: death.failures >= 3,
      resolved: death.successes >= 3 || death.failures >= 3,
      successPips: [1, 2, 3].map((n) => death.successes >= n),
      failurePips: [1, 2, 3].map((n) => death.failures >= n)
    };

    const dexMod = abilityModifier(system.abilities.dex.total);
    context.initiative = { mod: dexMod, modLabel: formatModifier(dexMod) };

    const wisMod = abilityModifier(system.abilities.wis.total);
    context.passivePerception = passivePerception(
      wisMod,
      system.skills.perception.proficient,
      context.proficiencyBonus
    );

    if (context.isSpellcaster) {
      const spellAbility = DND_CUSTOM.spellcastingAbility[system.class];
      const spellAbilityMod = abilityModifier(system.abilities[spellAbility].total);
      context.spellcasting = {
        ability: spellAbility,
        abilityLabel: DND_CUSTOM.abilities[spellAbility],
        dc: spellSaveDC(context.proficiencyBonus, spellAbilityMod),
        attackBonus: spellAttackBonus(context.proficiencyBonus, spellAbilityMod),
        attackBonusLabel: formatModifier(spellAttackBonus(context.proficiencyBonus, spellAbilityMod))
      };
    }

    context.abilities = Object.entries(system.abilities).map(([key, ability]) => {
      const mod = abilityModifier(ability.total);
      const originBonus = originAbilityBonuses[key] ?? 0;
      return {
        key,
        label: DND_CUSTOM.abilities[key],
        value: ability.value,
        total: ability.total,
        originBonus,
        mod,
        modLabel: formatModifier(mod),
        save: {
          proficient: system.saves[key].proficient,
          mod: mod + (system.saves[key].proficient ? context.proficiencyBonus : 0)
        }
      };
    });

    context.skills = Object.entries(system.skills)
      .map(([key, skill]) => {
        const abilityMod = abilityModifier(system.abilities[skill.ability].total);
        const mod = abilityMod + (skill.proficient ? context.proficiencyBonus : 0);
        return {
          key,
          label: game.i18n.localize(DND_CUSTOM.skills[key]),
          originAdvantage: originSkillAdvantages.has(key),
          // Désavantage imposé par l'armure équipée (SRD 5e) : ne concerne que la Discrétion
          // (cf. CharacterData#prepareDerivedData > this.stealthDisadvantage).
          armorDisadvantage: key === "stealth" && system.stealthDisadvantage,
          ability: skill.ability,
          proficient: skill.proficient,
          mod,
          modLabel: formatModifier(mod)
        };
      })
      .sort((a, b) => a.label.localeCompare(b.label, game.i18n.lang));

    const items = this.actor.items.contents;
    context.weapons = items.filter((item) => item.type === "weapon");
    context.armors = items.filter((item) => item.type === "armor");
    context.gear = items.filter((item) => item.type === "gear");
    context.features = items.filter((item) => item.type === "feature");
    // Sorts groupés par niveau (0 = tour de magie) pour l'onglet "Sorts" ; emplacements
    // restants/max par niveau (max entièrement dérivé, cf. CharacterData#prepareDerivedData).
    const spells = items.filter((item) => item.type === "spell");
    context.spellsByLevel = Array.from({ length: 10 }, (_, level) => ({
      level,
      label:
        level === 0
          ? game.i18n.localize("DND_CUSTOM.Abilities.Cantrips")
          : game.i18n.format("DND_CUSTOM.Abilities.SpellLevelLabel", { level }),
      spells: spells
        .filter((spell) => spell.system.level === level)
        .sort((a, b) => a.name.localeCompare(b.name, game.i18n.lang))
        .map((spell) => ({ item: spell, schoolLabel: game.i18n.localize(DND_CUSTOM.spellSchools[spell.system.school]) }))
    })).filter((group) => group.spells.length);
    context.spellSlots = ["1", "2", "3", "4", "5", "6", "7", "8", "9"]
      .map((level) => ({ level, ...system.spells.slots[level] }))
      .filter((slot) => slot.max > 0);
    context.concentratingOn = system.spells.concentratingOn;
    // Onglet Inventaire scindé en deux tableaux : Armes/Armures (emplacements d'équipement,
    // cf. context.equipment) d'un côté, Objets/Outils de l'autre.
    context.weaponsAndArmor = items.filter((item) => ["weapon", "armor"].includes(item.type));
    context.gearAndTools = items.filter((item) => ["gear", "tool"].includes(item.type));
    context.inventoryItems = items.filter((item) =>
      ["weapon", "armor", "gear", "tool"].includes(item.type)
    );

    // Répartit les armes/armures équipées dans leurs emplacements (main principale/secondaire,
    // armure, accessoires) pour l'onglet "Équipement" — une arme à deux mains occupe les deux
    // mains à la fois (cf. equipmentSlots dans rules.js).
    const equippedWeaponsAndArmor = [...context.weapons, ...context.armors].filter(
      (item) => item.system.equipped
    );
    const findBySlot = (slot) =>
      equippedWeaponsAndArmor.find((item) => equipmentSlots(item.type, item.system).includes(slot)) ?? null;
    const mainHand = findBySlot("mainHand");
    const offHand = findBySlot("offHand");
    context.equipment = {
      mainHand,
      offHand,
      // Une arme à deux mains occupe aussi la main secondaire : évite d'afficher deux fois le
      // même objet, affiche plutôt une mention dédiée (cf. tab-equipment.hbs).
      offHandOccupiedByMainHand: Boolean(mainHand && offHand && mainHand.id === offHand.id),
      armor: findBySlot("armor"),
      accessories: equippedWeaponsAndArmor.filter((item) =>
        equipmentSlots(item.type, item.system).includes("accessory")
      )
    };

    // Bonus d'attaque et dégâts (avec alternative Polyvalente à deux mains) de chaque arme
    // possédée, affichés dans le tableau Armes/Armures de l'onglet Inventaire — bonus de
    // maîtrise appliqué seulement si la classe couvre cette catégorie d'arme (cf.
    // isProficientWithWeapon/weaponAttackDamage dans rules.js).
    context.weaponStats = {};
    for (const weapon of context.weapons) {
      const proficient = isProficientWithWeapon(system.class, weapon.system.weaponType);
      const atk = weaponAttackDamage(weapon.system, system.abilities, context.proficiencyBonus, proficient);
      const damageType = weapon.system.damage.type
        ? game.i18n.localize(DND_CUSTOM.damageTypes[weapon.system.damage.type])
        : "";
      const oneHandedLabel = weapon.system.damage.dice
        ? `${weapon.system.damage.dice}${formatModifier(atk.abilityMod)} ${damageType}`.trim()
        : "";
      // Polyvalente : la main secondaire libre est considérée occupée par l'arme elle-même
      // (empoignée à deux mains), sinon elle reste tenue à une main (cf. retour de test —
      // l'affichage montrait toujours les deux valeurs sans jamais refléter l'équipement réel).
      const isTwoHandedActive =
        weapon.system.properties.versatile &&
        Boolean(weapon.system.damageVersatile.dice) &&
        mainHand?.id === weapon.id &&
        (!offHand || offHand.id === weapon.id);
      let versatileLabel = "";
      if (weapon.system.properties.versatile && weapon.system.damageVersatile.dice) {
        const twoHandedLabel = `${weapon.system.damageVersatile.dice}${formatModifier(atk.abilityMod)} ${damageType}`.trim();
        if (isTwoHandedActive) {
          versatileLabel = `${oneHandedLabel} (${game.i18n.localize("DND_CUSTOM.Equipment.OneHandedShort")})`;
        } else {
          versatileLabel = `${twoHandedLabel} (${game.i18n.localize("DND_CUSTOM.Equipment.TwoHandedShort")})`;
        }
      }
      context.weaponStats[weapon.id] = {
        attackLabel: formatModifier(atk.attackBonus),
        damageLabel: isTwoHandedActive
          ? `${weapon.system.damageVersatile.dice}${formatModifier(atk.abilityMod)} ${damageType}`.trim()
          : oneHandedLabel,
        versatileLabel,
        isTwoHandedActive,
        proficient
      };
    }

    // Bonus de CA apporté par chaque armure/bouclier/accessoire possédé pris isolément (même
    // affichage que les dégâts d'arme ci-dessus, cf. armorContribution dans rules.js).
    context.armorStats = {};
    for (const armor of context.armors) {
      const contribution = armorContribution(armor.system, dexMod);
      // Armure du corps : CA totale affichée telle quelle (ex. "15") ; bouclier/accessoire :
      // bonus additionnel affiché avec son signe (ex. "+2"), pas une CA absolue.
      context.armorStats[armor.id] = {
        acLabel: armor.system.slot === "armor" ? `${contribution}` : formatModifier(contribution),
        typeLabel: DND_CUSTOM.armorTypes[armor.system.armorType]
      };
    }

    // États SRD 5e (cf. CONFIG.statusEffects, scripts/dnd-custom-ai.js) : actifs via
    // ActiveEffect (this.actor.statuses), Exhaustion à part (niveau 0-6, cf. character-data.js).
    context.conditions = CONFIG.statusEffects.map((status) => ({
      id: status.id,
      label: game.i18n.localize(status.name),
      img: status.img,
      active: this.actor.statuses.has(status.id)
    }));

    context.carriedWeight = carriedWeight(context.inventoryItems);
    context.carryingCapacity =
      carryingCapacity(system.abilities.str.total, "kg") + carryingCapacityBonus(context.inventoryItems);
    context.carryingCapacityPercent = Math.min(
      100,
      Math.round((context.carriedWeight / (context.carryingCapacity || 1)) * 100)
    );
    context.overCapacity = context.carriedWeight > context.carryingCapacity;
    context.currencyTotalCopper = currencyTotalInCopper(system.currency);

    return context;
  }

  /** @override
   * Expose le tab actif de chaque PART sous `context.tab` (utilisé par les .hbs
   * pour poser `data-tab`/la classe CSS "active" sur leur élément racine).
   */
  async _preparePartContext(partId, context) {
    context = await super._preparePartContext(partId, context);
    if (context.tabs?.[partId]) context.tab = context.tabs[partId];
    return context;
  }

  /** Repos court (simplifié, pas de dés de vie) : récupère la moitié des PV max, sans
   *  dépasser le max. Restaure aussi les emplacements de sorts de l'Occultiste (Magie de
   *  Pacte, SRD 5e : seule classe qui récupère ses emplacements au repos court). */
  static async #onRestShort() {
    const hp = this.actor.system.attributes.hp;
    const updates = { "system.attributes.hp.value": Math.min(hp.value + Math.floor(hp.max / 2), hp.max) };
    if (this.actor.system.class === "warlock") Object.assign(updates, this.#spellSlotResetUpdates());
    await this.actor.update(updates);
    await this.#resetFeatureUses(["shortRest"]);
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      content: game.i18n.format("DND_CUSTOM.Chat.RestShort", { name: this.actor.name })
    });
  }

  /** Repos long : soigne intégralement et restaure tous les emplacements de sorts (SRD 5e). */
  static async #onRestLong() {
    const hp = this.actor.system.attributes.hp;
    const updates = { "system.attributes.hp.value": hp.max, ...this.#spellSlotResetUpdates() };
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
    const updates = {};
    for (const level of ["1", "2", "3", "4", "5", "6", "7", "8", "9"]) {
      updates[`system.spells.slots.${level}.value`] = this.actor.system.spells.slots[level].max;
    }
    return updates;
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
   *  (CharacterData#prepareDerivedData). Champ verrouillé MJ (cf. hook preUpdateActor,
   *  dnd-custom-ai.js) : la mise à jour est silencieusement ignorée si un joueur clique
   *  malgré le bouton masqué côté template. */
  static async #onLevelUp() {
    const system = this.actor.system;
    const next = system.attributes.level + 1;
    await this.actor.update({ "system.attributes.level": next });
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      content: game.i18n.format("DND_CUSTOM.Chat.LevelUp", { name: this.actor.name, level: next })
    });

    // Amélioration de caractéristiques, SRD 5e (générique, cf. commentaire de
    // DND_CUSTOM.abilityScoreImprovementLevels) : proposée juste après l'incrément de niveau.
    if (DND_CUSTOM.abilityScoreImprovementLevels.includes(next)) {
      await openAbilityScoreImprovementDialog(this.actor);
    }
  }

  /** Ouvre l'assistant de création de personnage pour cet Actor (cf.
   *  character-creation-wizard.js) : accessible à tout propriétaire, pas seulement au MJ.
   *  Referme la fiche du même mouvement (retour de test — les deux restaient affichées en
   *  même temps) ; elle se rouvrira d'elle-même à la fin de l'assistant si besoin. */
  static async #onOpenCreationWizard() {
    const actor = this.actor;
    await this.close();
    new CharacterCreationWizard(actor).render(true);
  }

  static async #onOpenClassSheet() {
    const classKey = this.actor.system.class;
    const name = classKey ? game.i18n.localize(DND_CUSTOM.classes[classKey]) : "";
    await DndCustomActorSheet.#openReferenceItem(name, "classes", "DND_CUSTOM.Actor.ClassSheetMissing");
  }

  static async #onOpenOriginSheet() {
    const origin = game.dndCustomAi?.origins?.[this.actor.system.origin];
    await DndCustomActorSheet.#openReferenceItem(origin?.label, "origines", "DND_CUSTOM.Actor.OriginSheetMissing");
  }

  /** Ouvre la fiche de description d'une Classe/Origine par son nom exact : cherchée d'abord
   *  dans les Items du monde (import world-items/classes.json ou origins.json), puis dans le
   *  compendium `packName` une fois peuplé par le MJ (cf. packs/classes ou packs/origines,
   *  README de chacun) — avertit sans bloquer si introuvable, ces fiches restent optionnelles. */
  static async #openReferenceItem(name, packName, missingKey) {
    if (!name) return;

    const worldItem = game.items.getName(name);
    if (worldItem) {
      worldItem.sheet.render(true);
      return;
    }

    const pack = game.packs.get(`${SYSTEM_ID}.${packName}`);
    const indexEntry = pack ? [...pack.index].find((entry) => entry.name === name) : null;
    if (indexEntry) {
      const document = await pack.getDocument(indexEntry._id);
      document.sheet.render(true);
      return;
    }

    ui.notifications.warn(game.i18n.format(missingKey, { name }));
  }

  /** Jet d'Initiative : délègue entièrement à Actor#rollInitiative (natif Foundry), qui crée
   *  le Combattant si besoin (sur la scène active) et met à jour le Combat Tracker — pas de
   *  logique maison, on branche juste la formule système (cf. system.json > "initiative"). */
  static async #onRollInitiative() {
    await this.actor.rollInitiative({ createCombatants: true });
  }

  /** Jet de sauvegarde de la mort, SRD 5e : 1d20 sans modificateur. Naturel 20 = régénère
   *  1 PV — le hook updateActor (dnd-custom-ai.js) détecte alors le retour au-dessus de 0 PV
   *  et réinitialise l'état (retire Inconscient, remet les compteurs à zéro), pas besoin de
   *  le refaire ici. Naturel 1 = deux échecs. 10+ = réussite, sinon échec. Troisième échec :
   *  declareDeath (scripts/helpers/death.js), la même fonction que pour une mort par dégâts
   *  subis à 0 PV, pour un comportement identique quelle que soit la cause. */
  static async #onRollDeathSave() {
    const actor = this.actor;
    const roll = new Roll("1d20");
    await roll.evaluate();
    const total = roll.total;
    const death = actor.system.attributes.death;

    if (total === 20) {
      await actor.update({ "system.attributes.hp.value": 1 });
    } else if (total === 1) {
      const failures = Math.min(3, death.failures + 2);
      await actor.update({ "system.attributes.death.failures": failures });
      if (failures >= 3) await declareDeath(actor);
    } else if (total >= 10) {
      await actor.update({ "system.attributes.death.successes": Math.min(3, death.successes + 1) });
    } else {
      const failures = Math.min(3, death.failures + 1);
      await actor.update({ "system.attributes.death.failures": failures });
      if (failures >= 3) await declareDeath(actor);
    }

    await roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor }),
      flavor: game.i18n.localize("DND_CUSTOM.Roll.DeathSave")
    });
  }

  /** Jet libre d'une Capacité (`system.requiresRoll`/`rollFormula`, ex. Second souffle
   *  "1d10 + @attributes.level") : formule évaluée avec les données de l'Actor
   *  (Actor#getRollData, natif Foundry) pour résoudre les références `@...`. Consomme une
   *  charge si la capacité a des utilisations limitées (system.uses.max > 0), et annule le
   *  jet si plus aucune charge n'est disponible. */
  static async #onRollFeature(event, target) {
    const item = this.actor.items.get(target.closest("[data-item-id]")?.dataset.itemId);
    if (!item || item.type !== "feature" || !item.system.requiresRoll || !item.system.rollFormula) return;

    const remaining = await this.#consumeFeatureCharge(item);
    if (remaining === null) return;

    const roll = new Roll(item.system.rollFormula, this.actor.getRollData());
    await roll.evaluate();
    const flavor = remaining === undefined ? item.name : `${item.name} (${remaining}/${item.system.uses.max})`;
    await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor: this.actor }), flavor });
  }

  /** Utilisation d'une Capacité à charges limitées sans jet associé (ex. Imposition des
   *  mains) : décrémente le compteur et l'annonce dans le chat (pas de jet à afficher, donc
   *  pas de message automatique sinon comme pour #onRollFeature). */
  static async #onUseFeatureCharge(event, target) {
    const item = this.actor.items.get(target.closest("[data-item-id]")?.dataset.itemId);
    if (!item || item.type !== "feature" || !item.system.uses.max) return;

    const remaining = await this.#consumeFeatureCharge(item);
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

  /** Décrémente system.uses.value d'une Capacité à charges limitées et renvoie le nombre de
   *  charges restantes après l'opération. Renvoie `undefined` si la capacité n'a pas de suivi
   *  de charges (uses.max === 0, action toujours permise), ou `null` si plus aucune charge
   *  n'est disponible (l'appelant doit alors annuler l'action associée). */
  async #consumeFeatureCharge(item) {
    if (!item.system.uses.max) return undefined;
    if (item.system.uses.value <= 0) {
      ui.notifications.warn(game.i18n.format("DND_CUSTOM.Chat.NoChargesLeft", { feature: item.name }));
      return null;
    }
    const remaining = item.system.uses.value - 1;
    await item.update({ "system.uses.value": remaining });
    return remaining;
  }

  /** Jet de caractéristique (1d20 + modificateur). Maj-clic = avantage, Ctrl-clic =
   *  désavantage (cf. tooltip des boutons de jet). */
  static async #onRollAbility(event, target) {
    const key = target.dataset.key;
    const mod = abilityModifier(this.actor.system.abilities[key].total);
    const cond = conditionRollEffects(this.actor, "check");
    await rollCheck({
      actor: this.actor,
      formula: formatModifier(mod),
      flavor: game.i18n.format("DND_CUSTOM.Roll.AbilityCheck", {
        ability: game.i18n.localize(DND_CUSTOM.abilities[key])
      }),
      advantage: event.shiftKey || cond.advantage,
      disadvantage: event.ctrlKey || cond.disadvantage
    });
  }

  /** Jet de sauvegarde (1d20 + modificateur de caractéristique + bonus de maîtrise si
   *  maîtrisée). */
  static async #onRollSave(event, target) {
    const key = target.dataset.key;
    const system = this.actor.system;
    const mod = abilityModifier(system.abilities[key].total);
    const profBonus = system.saves[key].proficient ? proficiencyBonus(system.attributes.level) : 0;
    const cond = conditionRollEffects(this.actor, "save", key);
    await rollCheck({
      actor: this.actor,
      formula: formatModifier(mod + profBonus),
      flavor: game.i18n.format("DND_CUSTOM.Roll.SavingThrow", {
        ability: game.i18n.localize(DND_CUSTOM.abilities[key])
      }),
      advantage: event.shiftKey || cond.advantage,
      disadvantage: event.ctrlKey || cond.disadvantage
    });
  }

  /** Jet de compétence (1d20 + modificateur). L'avantage d'Origine (cf.
   *  CharacterData#prepareDerivedData) et le désavantage d'armure (Discrétion) sont appliqués
   *  automatiquement en plus du Maj/Ctrl-clic manuel — plusieurs avantages ne cumulent jamais
   *  (SRD 5e), et avantage + désavantage s'annulent (cf. rollCheck). */
  static async #onRollSkill(event, target) {
    const key = target.dataset.key;
    const system = this.actor.system;
    const profBonus = proficiencyBonus(system.attributes.level);
    const mod = skillModifier(system, key, profBonus);
    const originAdvantage = Boolean(
      game.dndCustomAi?.origins?.[system.origin]?.skillAdvantages?.includes(key)
    );
    const armorDisadvantage = key === "stealth" && system.stealthDisadvantage;
    const cond = conditionRollEffects(this.actor, "check");
    await rollCheck({
      actor: this.actor,
      formula: formatModifier(mod),
      flavor: game.i18n.format("DND_CUSTOM.Roll.SkillCheck", {
        skill: game.i18n.localize(DND_CUSTOM.skills[key])
      }),
      advantage: event.shiftKey || originAdvantage || cond.advantage,
      disadvantage: event.ctrlKey || armorDisadvantage || cond.disadvantage
    });
  }

  /** Jet d'attaque d'une arme de l'inventaire (1d20 + bonus d'attaque, cf. weaponAttackDamage
   *  dans rules.js — bonus de maîtrise seulement si la classe couvre la catégorie de l'arme). */
  static async #onRollWeaponAttack(event, target) {
    const item = this.actor.items.get(target.closest("[data-item-id]")?.dataset.itemId);
    if (!item || item.type !== "weapon") return;
    const proficient = isProficientWithWeapon(this.actor.system.class, item.system.weaponType);
    const atk = weaponAttackDamage(
      item.system,
      this.actor.system.abilities,
      proficiencyBonus(this.actor.system.attributes.level),
      proficient
    );
    const cond = conditionRollEffects(this.actor, "attack");
    await rollCheck({
      actor: this.actor,
      formula: formatModifier(atk.attackBonus),
      flavor: game.i18n.format("DND_CUSTOM.Roll.WeaponAttack", { weapon: item.name }),
      advantage: event.shiftKey || cond.advantage,
      disadvantage: event.ctrlKey || cond.disadvantage
    });
  }

  /** Jet de dégâts d'une arme de l'inventaire. Pour une arme Polyvalente, le dé par défaut
   *  suit l'équipement réel (deux mains si la main secondaire est libre, une main sinon, cf.
   *  tab-equipment.hbs/tab-inventory.hbs) ; le bouton alternative (ou Maj-clic) force l'autre
   *  dé. Pas d'avantage/désavantage (ne concerne que les jets de d20). */
  static async #onRollWeaponDamage(event, target) {
    const item = this.actor.items.get(target.closest("[data-item-id]")?.dataset.itemId);
    if (!item || item.type !== "weapon") return;

    const isVersatile = item.system.properties.versatile && Boolean(item.system.damageVersatile.dice);
    let isTwoHandedActive = false;
    if (isVersatile) {
      const otherOffHand = this.actor.items.contents.find(
        (other) =>
          other.id !== item.id &&
          ["weapon", "armor"].includes(other.type) &&
          other.system.equipped &&
          equipmentSlots(other.type, other.system).includes("offHand")
      );
      isTwoHandedActive =
        item.system.equipped &&
        equipmentSlots(item.type, item.system).includes("mainHand") &&
        !otherOffHand;
    }
    const forceAlternate = event.shiftKey || target.dataset.versatile === "true";
    const useVersatileDice = isVersatile && (forceAlternate ? !isTwoHandedActive : isTwoHandedActive);
    const dice = useVersatileDice ? item.system.damageVersatile.dice : item.system.damage.dice;
    if (!dice) return;

    const atk = weaponAttackDamage(
      item.system,
      this.actor.system.abilities,
      proficiencyBonus(this.actor.system.attributes.level)
    );
    const damageType = item.system.damage.type
      ? game.i18n.localize(DND_CUSTOM.damageTypes[item.system.damage.type])
      : "";
    await rollDamage({
      actor: this.actor,
      dice,
      formula: formatModifier(atk.abilityMod),
      flavor: `${game.i18n.format("DND_CUSTOM.Roll.WeaponDamage", { weapon: item.name })}${damageType ? ` (${damageType})` : ""}`
    });
  }

  /** Lance un sort de l'onglet Sorts : décompte un emplacement de son niveau (aucun
   *  surclassement dans ce système, sauf Occultiste, cf. resolveSpellSlotLevel), sans effet
   *  pour un tour de magie (niveau 0), et poste la description dans le chat. */
  static async #onCastSpell(event, target) {
    const item = this.actor.items.get(target.closest("[data-item-id]")?.dataset.itemId);
    if (!item || item.type !== "spell") return;

    if (item.system.level > 0) {
      const slotLevel = resolveSpellSlotLevel(this.actor, item.system.level);
      const slot = this.actor.system.spells.slots[slotLevel];
      if (!slot || slot.value <= 0) {
        ui.notifications.warn(game.i18n.localize("DND_CUSTOM.Spells.NoSlotAvailable"));
        return;
      }
      await this.actor.update({ [`system.spells.slots.${slotLevel}.value`]: slot.value - 1 });
    }

    // Concentration, SRD 5e : un seul sort à la fois — en lancer un nouveau remplace celui en
    // cours (pas de choix à faire, la règle est automatique).
    if (item.system.concentration) {
      const previous = this.actor.system.spells.concentratingOn;
      await this.actor.update({ "system.spells.concentratingOn": item.name });
      if (previous && previous !== item.name) {
        await ChatMessage.create({
          speaker: ChatMessage.getSpeaker({ actor: this.actor }),
          content: game.i18n.format("DND_CUSTOM.Chat.ConcentrationBroken", { name: this.actor.name, spell: previous })
        });
      }
    }

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      content: game.i18n.format("DND_CUSTOM.Chat.CastSpell", { name: this.actor.name, spell: item.name })
    });
  }

  /** Rompt volontairement la concentration en cours (SRD 5e : possible à tout moment). */
  static async #onDropConcentration() {
    await this.actor.update({ "system.spells.concentratingOn": "" });
  }

  /** Bouton "Utiliser" de l'inventaire : objets `gear` avec `system.use.type` renseigné
   *  ("light" allume/éteint la source sur le(s) token(s) de l'Actor sur la scène active,
   *  "heal" rend (healBase + bonus de compétence) PV), ou objets `tool` avec
   *  `system.useEffect.skill` renseigné (test de compétence, cf. #onUseTool). */
  static async #onUseItem(event, target) {
    const itemId = target.closest("[data-item-id]")?.dataset.itemId;
    const item = this.actor.items.get(itemId);
    if (!item) return;

    if (item.type === "tool") return DndCustomActorSheet.#onUseTool(event, this.actor, item);

    const use = item.system.use;
    if (!use || use.type === "none") return;

    if (use.type === "light") return DndCustomActorSheet.#toggleLight(this.actor, item);
    if (use.type === "heal") return DndCustomActorSheet.#applyHeal(this.actor, item);
  }

  /** Test de compétence avec un outil (`system.useEffect.skill`, cf. ToolData) : l'outil
   *  confère sa propre maîtrise (bonus de maîtrise toujours appliqué, indépendamment de la
   *  maîtrise de la compétence elle-même — cf. toolCheckModifier dans rules.js), plus
   *  l'éventuel bonus fixe de l'objet (`system.useEffect.bonus`). Maj/Ctrl-clic = avantage/
   *  désavantage, même convention que #onRollSkill. */
  static async #onUseTool(event, actor, item) {
    const skillKey = item.system.useEffect.skill;
    if (!skillKey) return;

    const profBonus = proficiencyBonus(actor.system.attributes.level);
    const mod = toolCheckModifier(actor.system, skillKey, profBonus, item.system.useEffect.bonus);
    await rollCheck({
      actor,
      formula: formatModifier(mod),
      flavor: game.i18n.format("DND_CUSTOM.Roll.ToolCheck", {
        tool: item.name,
        skill: game.i18n.localize(DND_CUSTOM.skills[skillKey])
      }),
      advantage: event.shiftKey,
      disadvantage: event.ctrlKey
    });
  }

  static async #toggleLight(actor, item) {
    const tokens = actor.getActiveTokens();
    if (!tokens.length) {
      ui.notifications.warn(game.i18n.localize("DND_CUSTOM.Inventory.NoTokenOnScene"));
      return;
    }

    const turningOn = !item.system.lit;
    if (turningOn) {
      // Un token n'a qu'une seule configuration de lumière active : éteindre toute autre
      // source déjà allumée sur cet Actor avant d'allumer celle-ci.
      const others = actor.items.contents.filter(
        (other) => other.id !== item.id && other.type === "gear" && other.system.use.type === "light" && other.system.lit
      );
      if (others.length) {
        await actor.updateEmbeddedDocuments(
          "Item",
          others.map((other) => ({ _id: other.id, "system.lit": false }))
        );
      }
    }

    await item.update({ "system.lit": turningOn });

    // `dim` est stocké comme rayon SUPPLÉMENTAIRE au-delà de `bright` (formulation SRD) ;
    // le champ `light.dim` du token attend lui un rayon total depuis le token.
    const light = turningOn
      ? { bright: item.system.use.light.bright, dim: item.system.use.light.bright + item.system.use.light.dim }
      : { bright: 0, dim: 0 };
    for (const token of tokens) await token.document.update({ light });

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: game.i18n.format(turningOn ? "DND_CUSTOM.Chat.UseLightOn" : "DND_CUSTOM.Chat.UseLightOff", {
        name: actor.name,
        item: item.name
      })
    });
  }

  static async #applyHeal(actor, item) {
    const use = item.system.use;
    const bonus = skillModifier(actor.system, use.healSkill || "medicine", proficiencyBonus(actor.system.attributes.level));
    const amount = Math.max(0, use.healBase + bonus);

    const hp = actor.system.attributes.hp;
    await actor.update({ "system.attributes.hp.value": Math.min(hp.value + amount, hp.max) });

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: game.i18n.format("DND_CUSTOM.Chat.UseHeal", { name: actor.name, item: item.name, amount })
    });
  }

  /** Bascule un état (cf. CONFIG.statusEffects) : Actor#toggleStatusEffect crée/retire
   *  l'ActiveEffect correspondante (méthode native Foundry). */
  static async #onToggleCondition(event, target) {
    await this.actor.toggleStatusEffect(target.dataset.key);
  }

  static async #onExhaustionIncrease() {
    await this.#adjustExhaustion(1);
  }

  static async #onExhaustionDecrease() {
    await this.#adjustExhaustion(-1);
  }

  async #adjustExhaustion(delta) {
    const current = this.actor.system.attributes.exhaustion;
    const next = Math.max(0, Math.min(6, current + delta));
    if (next === current) return;
    await this.actor.update({ "system.attributes.exhaustion": next });
  }
}