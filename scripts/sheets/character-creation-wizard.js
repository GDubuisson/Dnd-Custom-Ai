import { DND_CUSTOM } from "../helpers/config.js";
import { ABILITY_KEYS, SKILL_ABILITIES } from "../data/character-data.js";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ApplicationV2 } = foundry.applications.api;

const SYSTEM_ID = "dnd-custom-ai";
const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8];

/** Assistant de création de personnage : Origine, Classe, répartition du tableau standard
 *  (15/14/13/12/10/8, SRD 5e) sur les 6 caractéristiques, maîtrises de compétences (nombre
 *  fixé par la classe, cf. DND_CUSTOM.classSkillChoices). Les jets de sauvegarde maîtrisés
 *  sont déduits automatiquement de la classe (SRD 5e, pas un choix). N'importe quel joueur
 *  propriétaire de l'Actor peut l'utiliser : c'est le seul flux autorisé à modifier ces
 *  champs normalement verrouillés MJ (cf. hook preUpdateActor, dnd-custom-ai.js), via
 *  l'option `{ dndCustomWizard: true }` posée explicitement sur l'update. */
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
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    return {
      ...context,
      actor: this.actor,
      name: this.actor.name,
      originOptions: Object.entries(game.dndCustomAi?.origins ?? {}).map(([key, origin]) => ({
        key,
        label: origin.label
      })),
      classOptions: Object.entries(DND_CUSTOM.classes).map(([key, label]) => ({ key, label })),
      abilities: ABILITY_KEYS.map((key, index) => ({
        key,
        label: DND_CUSTOM.abilities[key],
        // Chaque case propose les 6 valeurs du tableau standard, celle du même rang
        // pré-sélectionnée (répartition de départ arbitraire mais valide, à réarranger).
        options: STANDARD_ARRAY.map((value) => ({ value, selected: value === STANDARD_ARRAY[index] }))
      })),
      skills: Object.keys(SKILL_ABILITIES)
        .map((key) => ({ key, label: DND_CUSTOM.skills[key] }))
        .sort((a, b) => game.i18n.localize(a.label).localeCompare(game.i18n.localize(b.label), game.i18n.lang))
    };
  }

  /** Valide (tableau standard respecté, bon nombre de compétences pour la classe choisie)
   *  puis applique les choix à l'Actor. Sauvegardes déduites de la classe (SRD 5e). PV
   *  initialisés au maximum une fois les caractéristiques/la classe/l'Origine posées (leur
   *  effet sur PV max n'est connu qu'après ce premier update, cf. CharacterData#prepareDerivedData). */
  static async #onSubmit(event, form, formData) {
    const data = formData.object;

    const abilityValues = ABILITY_KEYS.map((key) => Number(data.abilities?.[key]));
    const sortedChosen = [...abilityValues].sort((a, b) => b - a);
    const sortedStandard = [...STANDARD_ARRAY].sort((a, b) => b - a);
    if (JSON.stringify(sortedChosen) !== JSON.stringify(sortedStandard)) {
      ui.notifications.error(game.i18n.localize("DND_CUSTOM.Wizard.InvalidAbilities"));
      return;
    }

    const classKey = data.classKey;
    const allowedSkillCount = DND_CUSTOM.classSkillChoices[classKey] ?? 2;
    const selectedSkills = Object.entries(data.skills ?? {})
      .filter(([, checked]) => checked)
      .map(([key]) => key);
    if (selectedSkills.length !== allowedSkillCount) {
      ui.notifications.error(
        game.i18n.format("DND_CUSTOM.Wizard.InvalidSkillCount", { count: allowedSkillCount })
      );
      return;
    }

    const updates = { name: data.name || this.actor.name, "system.origin": data.origin, "system.class": classKey };
    for (const key of ABILITY_KEYS) updates[`system.abilities.${key}.value`] = Number(data.abilities[key]);

    const savingThrows = new Set(DND_CUSTOM.classSavingThrows[classKey] ?? []);
    for (const key of ABILITY_KEYS) updates[`system.saves.${key}.proficient`] = savingThrows.has(key);

    for (const key of Object.keys(SKILL_ABILITIES)) {
      updates[`system.skills.${key}.proficient`] = selectedSkills.includes(key);
    }

    await this.actor.update(updates, { dndCustomWizard: true });
    // PV max recalculé par prepareDerivedData après le premier update ci-dessus : on le lit
    // maintenant pour démarrer le personnage à pleine santé.
    await this.actor.update(
      { "system.attributes.hp.value": this.actor.system.attributes.hp.max },
      { dndCustomWizard: true }
    );

    ui.notifications.info(game.i18n.format("DND_CUSTOM.Wizard.Created", { name: updates.name }));
    this.close();
  }
}
