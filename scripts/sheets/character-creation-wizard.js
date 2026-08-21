import { DND_CUSTOM } from "../helpers/config.js";
import { ABILITY_KEYS, SKILL_ABILITIES } from "../data/character-data.js";
import { grantClassContent, grantLanguages } from "../helpers/class-content.js";
import { spellSlotFillUpdates } from "../helpers/rules.js";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ApplicationV2 } = foundry.applications.api;

const SYSTEM_ID = "dnd-custom-ai";
const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8];

/** Échappement minimal pour insérer `text` sans risque dans un attribut HTML entre guillemets
 *  doubles (cf. même convention que glossaryAbbr, player-guide-journal.js) : ce résumé est
 *  injecté via `.innerHTML` (cf. #syncSelectionInfo) pour porter le nom du trait spécial en
 *  infobulle, donc `text` doit être sûr aussi bien en position de texte qu'en attribut. */
function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Résumé HTML (une ligne, affiché sous le select Origine) des bonus de caractéristiques/
 *  compétences avantagées/trait spécial de `origin` (cf. origins.json) — retour de test : rien
 *  n'indiquait ces effets avant de valider le personnage, obligeant à ouvrir le Journal des
 *  Origines à côté pour comparer. Le nom du trait spécial porte sa description complète en
 *  infobulle (`title`, cf. #syncSelectionInfo qui l'injecte via innerHTML) plutôt que de
 *  l'afficher en clair et alourdir la ligne — retour de test. */
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

/** Même principe que buildOriginInfoText, pour le select Classe : sauvegardes maîtrisées
 *  (fixées par la classe, pas un choix, cf. #onSubmit), nombre de compétences au choix (déjà
 *  indiqué séparément par #syncSkillCountHint, répété ici pour tout avoir au même endroit) et
 *  caractéristique d'incantation si classe lanceuse. Pas de dé de vie affiché : ce système n'en
 *  utilise pas côté joueur (PV max calculés automatiquement, jamais de dé à lancer/dépenser —
 *  cf. DND_CUSTOM.classHitDice, un détail de calcul interne uniquement, jamais affiché). */
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
    this.#syncSkillLimit();
    this.#syncSelectionInfo();
  }

  /** Affiche sous chaque select (Origine/Classe) un résumé de ses bonus de caractéristiques/
   *  compétences/dé de vie (cf. buildOriginInfoText/buildClassInfoText ci-dessus), mis à jour
   *  dès le changement de sélection — retour de test, cf. commentaire de buildOriginInfoText. */
  #syncSelectionInfo() {
    const root = this.element;
    const originSelect = root.querySelector('select[name="origin"]');
    const classSelect = root.querySelector('select[name="classKey"]');
    const originPanel = root.querySelector("[data-origin-info]");
    const classPanel = root.querySelector("[data-class-info]");
    if (!originSelect || !classSelect || !originPanel || !classPanel) return;

    // .innerHTML (pas .textContent) côté Origine : buildOriginInfoText y injecte le nom du
    // trait spécial dans un <abbr title="..."> portant sa description en infobulle (retour de
    // test), échappé en amont (cf. escapeHtml) donc sûr à insérer tel quel.
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

  /** Désactive les cases de compétence non cochées dès que le quota de la classe (cf.
   *  #syncSkillCountHint) est atteint : sans ça, rien n'empêchait de cocher plus de
   *  compétences que permis avant de se le faire refuser à la soumission (#onSubmit) — retour
   *  de test. Recalculé à chaque case cochée/décochée et à chaque changement de classe. */
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
      originOptions: Object.entries(game.dndCustomAi?.origins ?? {})
        .map(([key, origin]) => ({ key, label: origin.label, infoText: buildOriginInfoText(origin) }))
        .sort((a, b) => a.label.localeCompare(b.label, game.i18n.lang)),
      classOptions: Object.entries(DND_CUSTOM.classes)
        .map(([key, label]) => ({ key, label, infoText: buildClassInfoText(key) }))
        .sort((a, b) => game.i18n.localize(a.label).localeCompare(game.i18n.localize(b.label), game.i18n.lang)),
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

    // Lie la fiche au joueur qui vient de la créer pour lui-même (retour de test) : le MJ
    // reste exclu de cette liaison automatique, l'assistant pouvant aussi servir à préparer
    // un personnage pour quelqu'un d'autre (assignation manuelle alors laissée au MJ, comme
    // avant, via la fenêtre "Configurer les joueurs").
    if (!game.user.isGM) {
      updates[`ownership.${game.user.id}`] = CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
    }

    const savingThrows = new Set(DND_CUSTOM.classSavingThrows[classKey] ?? []);
    for (const key of ABILITY_KEYS) updates[`system.saves.${key}.proficient`] = savingThrows.has(key);

    for (const key of Object.keys(SKILL_ABILITIES)) {
      updates[`system.skills.${key}.proficient`] = selectedSkills.includes(key);
    }

    await this.actor.update(updates, { dndCustomWizard: true });
    // PV max/emplacements de sorts recalculés par prepareDerivedData après le premier update
    // ci-dessus : on les lit maintenant pour démarrer le personnage à pleine santé et, pour une
    // classe lanceuse, avec tous ses emplacements de sorts disponibles (même logique que
    // rules.js > spellSlotFillUpdates pour les boutons de repos/la montée de niveau — sans quoi
    // un lanceur fraîchement créé reste à `value: 0` jusqu'à son premier repos long).
    await this.actor.update(
      {
        "system.attributes.hp.value": this.actor.system.attributes.hp.max,
        ...spellSlotFillUpdates(this.actor)
      },
      { dndCustomWizard: true }
    );

    await CharacterCreationWizard.#grantStartingEquipment(this.actor, classKey);
    // Capacités de classe (niveau 1) + tours de magie/sorts de niveau 1 pour une classe
    // lanceuse, cf. helpers/class-content.js.
    await grantClassContent(this.actor, classKey, this.actor.system.attributes.level);
    // Commune + langue d'Origine (cf. helpers/class-content.js) : les langues spéciales restent
    // un ajout manuel, jamais octroyées automatiquement.
    await grantLanguages(this.actor, origin);

    // Devient le "personnage joueur" assigné à cet utilisateur (cf. ownership ci-dessus, même
    // exclusion du MJ). Un utilisateur ne peut mettre à jour que son propre User (droit natif
    // Foundry), donc pas besoin d'être GM pour ceci.
    if (!game.user.isGM) await game.user.update({ character: this.actor.id });

    ui.notifications.info(game.i18n.format("DND_CUSTOM.Wizard.Created", { name: updates.name }));
    await this.close();
    // La fiche avait été fermée à l'ouverture de l'assistant (cf. dnd-custom-ai.js et
    // actor-sheet.js > #onOpenCreationWizard, retour de test — affichées en même temps) :
    // la rouvrir maintenant que le personnage est prêt, plutôt que de laisser le joueur sans
    // rien à l'écran.
    this.actor.sheet.render(true);
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
