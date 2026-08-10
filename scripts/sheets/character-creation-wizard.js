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

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);
    this.#syncAbilitySelects();
    this.#syncSkillCountHint();
  }

  /** Affiche le nombre de compétences à choisir pour la classe actuellement sélectionnée
   *  (retour de test — rien n'indiquait ce nombre dans le formulaire), mis à jour dès que le
   *  joueur change de classe, avant même de soumettre. */
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

  /** Empêche deux select de caractéristique d'afficher la même valeur du tableau standard :
   *  c'est la cause du bug remonté en test ("Chaque valeur... doit être utilisée exactement
   *  une fois" apparaissait systématiquement) — rien n'empêchait par ex. de mettre 15 en
   *  Intelligence sans remarquer que Force affichait encore 15 par défaut. Au lieu de se
   *  reposer uniquement sur la validation finale, on échange automatiquement l'ancienne
   *  valeur du champ modifié vers le select qui détenait la nouvelle valeur : l'ensemble
   *  reste toujours une permutation valide du tableau standard pendant la saisie. */
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
   *  effet sur PV max n'est connu qu'après ce premier update, cf. CharacterData#prepareDerivedData).
   *
   *  Lit directement les éléments du DOM (`form`) plutôt que `formData.object` : retour de
   *  test répété — l'erreur de validation du tableau standard apparaissait systématiquement,
   *  y compris après correction de l'échange automatique de valeurs (cf. #syncAbilitySelects),
   *  ce qui pointait vers l'extraction des données elle-même plutôt que vers leur contenu.
   *  `formData.object`/FormDataExtended expanse les noms à points ("abilities.str") en objet
   *  imbriqué en théorie, mais ce formulaire n'est pas lié à un Document (pas de préfixe
   *  "system.") ; lire `form.elements` directement supprime toute incertitude sur ce mécanisme
   *  intermédiaire — c'est déjà l'approche utilisée par ability-score-improvement.js. */
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

    await CharacterCreationWizard.#grantStartingEquipment(this.actor, classKey);

    ui.notifications.info(game.i18n.format("DND_CUSTOM.Wizard.Created", { name: updates.name }));
    this.close();
  }

  /** Équipement de départ simplifié (une arme + une armure typiques, cf.
   *  DND_CUSTOM.classStartingEquipment) : cherché par nom dans les Items du monde
   *  (importés via world-items/README.md) et dupliqué, équipé, sur l'Actor. Silencieusement
   *  ignoré si le nom n'est pas trouvé (macro d'import pas encore exécutée) plutôt que
   *  bloquer la création du personnage pour ça. */
  static async #grantStartingEquipment(actor, classKey) {
    const kit = DND_CUSTOM.classStartingEquipment[classKey];
    if (!kit) return;

    const names = [kit.weapon, kit.armor].filter(Boolean);
    const items = names.map((name) => game.items.getName(name)).filter(Boolean);

    if (items.length) {
      await actor.createEmbeddedDocuments(
        "Item",
        items.map((item) => foundry.utils.mergeObject(item.toObject(), { "system.equipped": true }))
      );
    }
    if (items.length < names.length) {
      ui.notifications.warn(game.i18n.localize("DND_CUSTOM.Wizard.StartingEquipmentMissing"));
    }
  }
}
