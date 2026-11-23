import { DND_CUSTOM } from "../helpers/config.js";
import { ABILITY_KEYS, SKILL_ABILITIES } from "../data/character-data.js";
import { grantClassContent, grantLanguages } from "../helpers/class-content.js";
import { spellSlotFillUpdates } from "../helpers/rules.js";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ApplicationV2 } = foundry.applications.api;

const SYSTEM_ID = "dnd-custom-ai";
const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8];

/**
 * Ids des Actors dont l'assistant de création est ouvert, rempli de façon synchrone au constructeur
 * pour que la fiche refuse de s'afficher par-dessus (cf. DndCustomActorSheet#render).
 */
export const openWizardActorIds = new Set();

/** Échappe `text` pour un contenu ou un attribut HTML. */
function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/** Résumé HTML des bonus, compétences et trait spécial (en infobulle) d'une Origine. */
function buildOriginInfoText(origin) {
  const bonuses = ABILITY_KEYS.filter((key) => origin.abilityBonuses?.[key])
    .map((key) => `${game.i18n.localize(DND_CUSTOM.abilities[key])} +${origin.abilityBonuses[key]}`)
    .join(", ");
  const skills = (origin.skillAdvantages ?? [])
    .map((key) => game.i18n.localize(DND_CUSTOM.skills[key]))
    .join(", ");

  const parts = [];
  if (bonuses) parts.push(game.i18n.format("DND_CUSTOM.Wizard.OriginInfoBonuses", { bonuses: escapeHtml(bonuses) }));
  if (skills) parts.push(game.i18n.format("DND_CUSTOM.Wizard.OriginInfoSkills", { skills: escapeHtml(skills) }));
  if (origin.specialTrait?.name) {
    const trait = `<abbr title="${escapeHtml(origin.specialTrait.description ?? "")}">${escapeHtml(origin.specialTrait.name)}</abbr>`;
    parts.push(game.i18n.format("DND_CUSTOM.Wizard.OriginInfoTrait", { trait }));
  }
  return parts.join(" · ");
}

/** Résumé HTML d'une classe : sauvegardes, nombre de compétences, caractéristique d'incantation. */
function buildClassInfoText(classKey) {
  const saves = (DND_CUSTOM.classSavingThrows[classKey] ?? [])
    .map((key) => game.i18n.localize(DND_CUSTOM.abilities[key]))
    .join(", ");
  const skillCount = DND_CUSTOM.classSkillChoices[classKey];

  const parts = [];
  if (saves) parts.push(game.i18n.format("DND_CUSTOM.Wizard.ClassInfoSaves", { saves }));
  if (skillCount) parts.push(game.i18n.format("DND_CUSTOM.Wizard.ClassInfoSkills", { count: skillCount }));
  if (DND_CUSTOM.spellcastingClasses.includes(classKey)) {
    const ability = game.i18n.localize(DND_CUSTOM.abilities[DND_CUSTOM.spellcastingAbility[classKey]]);
    parts.push(game.i18n.format("DND_CUSTOM.Wizard.ClassInfoSpellcasting", { ability }));
  }
  return parts.join(" · ");
}

/**
 * Assistant de création : Origine, Classe, tableau standard, compétences.
 * Seul flux joueur autorisé à écrire ces champs, via l'option `dndCustomWizard`.
 */
export class CharacterCreationWizard extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    classes: [SYSTEM_ID, "sheet", "character-wizard"],
    tag: "form",
    position: { width: 640, height: "auto" },
    window: { title: "DND_CUSTOM.Wizard.Title", icon: "fa-solid fa-hat-wizard" },
    form: { handler: CharacterCreationWizard.#onSubmit, submitOnChange: false, closeOnSubmit: false }
  };

  static PARTS = {
    form: { template: `systems/${SYSTEM_ID}/templates/apps/character-creation-wizard.hbs` }
  };

  constructor(actor, options = {}) {
    super(options);
    this.actor = actor;
    // Synchrone, avant tout rendu.
    openWizardActorIds.add(actor.id);
  }

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);
    this.#syncAbilitySelects();
    this.#syncSkillCountHint();
    this.#syncSkillLimit();
    this.#syncSelectionInfo();
  }

  /** @override Libère l'Actor de `openWizardActorIds`, soumis ou non. */
  _onClose(options) {
    super._onClose(options);
    openWizardActorIds.delete(this.actor.id);
  }

  /** Met à jour les résumés sous les selects Origine et Classe. */
  #syncSelectionInfo() {
    const root = this.element;
    const originSelect = root.querySelector('select[name="origin"]');
    const classSelect = root.querySelector('select[name="classKey"]');
    const originPanel = root.querySelector("[data-origin-info]");
    const classPanel = root.querySelector("[data-class-info]");
    if (!originSelect || !classSelect || !originPanel || !classPanel) return;

    // `innerHTML` pour l'infobulle du trait spécial, contenu échappé.
    const updateOrigin = () => {
      const info = originSelect.selectedOptions[0]?.dataset.info;
      if (info) originPanel.innerHTML = info;
      else originPanel.textContent = game.i18n.localize("DND_CUSTOM.Wizard.SelectOriginHint");
    };
    const updateClass = () => {
      const info = classSelect.selectedOptions[0]?.dataset.info;
      classPanel.textContent = info || game.i18n.localize("DND_CUSTOM.Wizard.SelectClassHint");
    };
    updateOrigin();
    updateClass();

    if (root.dataset.dndWizardInfoBound) return;
    root.dataset.dndWizardInfoBound = "true";
    originSelect.addEventListener("change", updateOrigin);
    classSelect.addEventListener("change", updateClass);
  }

  /** Affiche le nombre de compétences à choisir pour la classe sélectionnée. */
  #syncSkillCountHint() {
    const root = this.element;
    const classSelect = root.querySelector('select[name="classKey"]');
    const hint = root.querySelector("[data-skill-count-hint]");
    if (!classSelect || !hint) return;

    const updateHint = () => {
      const count = DND_CUSTOM.classSkillChoices[classSelect.value];
      hint.textContent = count
        ? game.i18n.format("DND_CUSTOM.Wizard.SkillCountHint", { count })
        : game.i18n.localize("DND_CUSTOM.Wizard.SkillCountHintNoClass");
    };
    updateHint();

    if (root.dataset.dndWizardSkillHintBound) return;
    root.dataset.dndWizardSkillHintBound = "true";
    classSelect.addEventListener("change", updateHint);
  }

  /** Désactive les cases de compétence restantes une fois le quota atteint. */
  #syncSkillLimit() {
    const root = this.element;
    const classSelect = root.querySelector('select[name="classKey"]');
    const skillCheckboxes = () => [...root.querySelectorAll('input[type="checkbox"][name^="skills."]')];
    if (!classSelect) return;

    const updateLimit = () => {
      const max = DND_CUSTOM.classSkillChoices[classSelect.value] ?? Infinity;
      const checkedCount = skillCheckboxes().filter((checkbox) => checkbox.checked).length;
      skillCheckboxes().forEach((checkbox) => {
        checkbox.disabled = !checkbox.checked && checkedCount >= max;
      });
    };
    updateLimit();

    if (root.dataset.dndWizardSkillLimitBound) return;
    root.dataset.dndWizardSkillLimitBound = "true";
    classSelect.addEventListener("change", updateLimit);
    root.addEventListener("change", (event) => {
      if (event.target.matches('input[type="checkbox"][name^="skills."]')) updateLimit();
    });
  }

  /** Échange les valeurs entre selects pour garder une permutation du tableau standard. */
  #syncAbilitySelects() {
    const root = this.element;
    const abilitySelects = () => root.querySelectorAll('select[name^="abilities."]');

    abilitySelects().forEach((select) => (select.dataset.prevValue = select.value));

    if (root.dataset.dndWizardAbilitiesBound) return;
    root.dataset.dndWizardAbilitiesBound = "true";
    root.addEventListener("change", (event) => {
      const select = event.target;
      if (!select.matches('select[name^="abilities."]')) return;

      const newValue = select.value;
      const oldValue = select.dataset.prevValue;
      const other = [...abilitySelects()].find(
        (candidate) => candidate !== select && candidate.value === newValue
      );
      if (other) {
        other.value = oldValue;
        other.dataset.prevValue = oldValue;
      }
      select.dataset.prevValue = newValue;
    });
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    return {
      ...context,
      actor: this.actor,
      name: this.actor.name,
      originOptions: Object.entries(game.dndCustomAi?.origins ?? {})
        .map(([key, origin]) => ({ key, label: origin.label, infoText: buildOriginInfoText(origin) }))
        .sort((a, b) => a.label.localeCompare(b.label, game.i18n.lang)),
      classOptions: Object.entries(DND_CUSTOM.classes)
        .map(([key, label]) => ({ key, label, infoText: buildClassInfoText(key) }))
        .sort((a, b) => game.i18n.localize(a.label).localeCompare(game.i18n.localize(b.label), game.i18n.lang)),
      abilities: ABILITY_KEYS.map((key, index) => ({
        key,
        label: DND_CUSTOM.abilities[key],
        // Répartition initiale : valeur du même rang.
        options: STANDARD_ARRAY.map((value) => ({ value, selected: value === STANDARD_ARRAY[index] }))
      })),
      skills: Object.keys(SKILL_ABILITIES)
        .map((key) => ({ key, label: DND_CUSTOM.skills[key] }))
        .sort((a, b) => game.i18n.localize(a.label).localeCompare(game.i18n.localize(b.label), game.i18n.lang))
    };
  }

  /** Valide puis applique les choix à l'Actor, PV et emplacements au maximum, contenu de départ octroyé. */
  static async #onSubmit(event, form) {
    const abilityValues = ABILITY_KEYS.map(
      (key) => Number(form.elements[`abilities.${key}`]?.value)
    );
    const sortedChosen = [...abilityValues].sort((a, b) => b - a);
    const sortedStandard = [...STANDARD_ARRAY].sort((a, b) => b - a);
    if (JSON.stringify(sortedChosen) !== JSON.stringify(sortedStandard)) {
      ui.notifications.error(game.i18n.localize("DND_CUSTOM.Wizard.InvalidAbilities"));
      return;
    }

    const classKey = form.elements.classKey?.value ?? "";
    const allowedSkillCount = DND_CUSTOM.classSkillChoices[classKey] ?? 2;
    const selectedSkills = [...form.querySelectorAll('input[type="checkbox"][name^="skills."]')]
      .filter((checkbox) => checkbox.checked)
      .map((checkbox) => checkbox.name.slice("skills.".length));
    if (selectedSkills.length !== allowedSkillCount) {
      ui.notifications.error(
        game.i18n.format("DND_CUSTOM.Wizard.InvalidSkillCount", { count: allowedSkillCount })
      );
      return;
    }

    const name = form.elements.name?.value;
    const origin = form.elements.origin?.value ?? "";
    const updates = { name: name || this.actor.name, "system.origin": origin, "system.class": classKey };
    ABILITY_KEYS.forEach((key, index) => {
      updates[`system.abilities.${key}.value`] = abilityValues[index];
    });

    // Un joueur devient propriétaire du personnage qu'il crée.
    if (!game.user.isGM) {
      updates[`ownership.${game.user.id}`] = CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
    }

    const savingThrows = new Set(DND_CUSTOM.classSavingThrows[classKey] ?? []);
    for (const key of ABILITY_KEYS) updates[`system.saves.${key}.proficient`] = savingThrows.has(key);

    for (const key of Object.keys(SKILL_ABILITIES)) {
      updates[`system.skills.${key}.proficient`] = selectedSkills.includes(key);
    }

    await this.actor.update(updates, { dndCustomWizard: true });
    // PV et emplacements de sorts au maximum, une fois les valeurs dérivées recalculées.
    await this.actor.update(
      {
        "system.attributes.hp.value": this.actor.system.attributes.hp.max,
        ...spellSlotFillUpdates(this.actor)
      },
      { dndCustomWizard: true }
    );

    await CharacterCreationWizard.#grantStartingEquipment(this.actor, classKey);
    // Capacités et sorts du niveau 1.
    await grantClassContent(this.actor, classKey, this.actor.system.attributes.level);
    // Commun et langue d'Origine.
    await grantLanguages(this.actor, origin);

    // Personnage assigné à l'utilisateur joueur.
    if (!game.user.isGM) await game.user.update({ character: this.actor.id });

    ui.notifications.info(game.i18n.format("DND_CUSTOM.Wizard.Created", { name: updates.name }));
    await this.close();
    // Rouvre la fiche une fois le personnage prêt.
    this.actor.sheet.render(true);
  }

  /**
   * Équipement de départ de la classe, copié depuis les Items du monde s'ils existent : arme et armure
   * équipées, objets d'ambiance du lanceur (`gear`) simplement rangés dans l'inventaire.
   */
  static async #grantStartingEquipment(actor, classKey) {
    const kit = DND_CUSTOM.classStartingEquipment[classKey];
    if (!kit) return;

    const equippedNames = [kit.weapon, kit.armor].filter(Boolean);
    const names = [...equippedNames, ...(kit.gear ?? [])];
    const items = names.map((name) => game.items.getName(name)).filter(Boolean);

    if (items.length) {
      await actor.createEmbeddedDocuments(
        "Item",
        items.map((item) =>
          equippedNames.includes(item.name)
            ? foundry.utils.mergeObject(item.toObject(), { "system.equipped": true })
            : item.toObject()
        )
      );
    }
    if (items.length < names.length) {
      ui.notifications.warn(game.i18n.localize("DND_CUSTOM.Wizard.StartingEquipmentMissing"));
    }
  }
}
