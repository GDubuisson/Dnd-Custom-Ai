// T-WIZ-001 à 023 : assistant de création, rejoué comme un joueur sur un Actor vierge (session Joueur,
// sauf section MJ). Prérequis : Joueur « Player1 » autorisé à créer des acteurs. T-WIZ-022/023 pilotent
// la vraie boîte de dialogue native « Créer un Acteur », seule à appeler `doc.sheet.render(true)`.

// Chaînes localisées de la langue active du monde (origins.json n'est pas localisé).
let strings;
let activeLang;
let origins;
const createdActorIds = [];
const stringsCache = {};

function loadStringsForActiveLocale() {
  return cy
    .window()
    .its("game.i18n.lang")
    .then((lang) => {
      activeLang = lang;
      if (stringsCache[lang]) {
        strings = stringsCache[lang];
        return;
      }
      return cy.readFile(`lang/${lang}.json`).then((json) => {
        stringsCache[lang] = json.DND_CUSTOM;
        strings = stringsCache[lang];
      });
    });
}

function format(template, vars = {}) {
  return template.replace(/\{(\w+)}/g, (_, key) => String(vars[key] ?? ""));
}

// Recrée `data` dans la réalité JS de la page, exigé par les API Foundry.
function toAutObject(win, data) {
  return win.Object.assign(new win.Object(), data);
}

// Crée un personnage vierge ; `renderSheet` simule `Document.create(data, { renderSheet: true })`.
function createBlankCharacter(name, { renderSheet = false } = {}) {
  return cy
    .window()
    .then((win) => win.Actor.create(toAutObject(win, { name, type: "character" }), { renderSheet }))
    .then((actor) => {
      createdActorIds.push(actor.id);
      return actor.id;
    });
}

function getWizardForm() {
  return cy.get("form.character-wizard", { timeout: 15000 });
}

// Vérifie toutes les 50ms que la fiche ne chevauche jamais l'assistant.
function pollNoOverlap(times = 30, intervalMs = 50) {
  const overlaps = [];
  for (let i = 0; i < times; i += 1) {
    cy.wait(intervalMs);
    cy.window().then((win) => {
      const sheetInput = win.document.querySelector("input.actor-name");
      const wizardForm = win.document.querySelector("form.character-wizard");
      const sheetVisible = Boolean(sheetInput?.checkVisibility());
      const wizardVisible = Boolean(wizardForm?.checkVisibility());
      if (sheetVisible && wizardVisible) overlaps.push(i * intervalMs);
    });
  }
  cy.then(() => {
    expect(overlaps, `fiche et assistant visibles en même temps aux instants (ms) : ${overlaps.join(", ")}`).to.deep.equal([]);
  });
}

// Crée un personnage via la vraie boîte de dialogue native de la sidebar ; l'id est relu par nom ensuite.
function createCharacterViaNativeDialog(name) {
  cy.get('[data-tab="actors"]').first().click({ force: true }); // NOSONAR : simple activation de l'onglet, quel que soit l'état de la sidebar
  cy.get('#actors button.create-entry[data-action="createEntry"]').click();
  cy.get("dialog.application.dialog input[name=\"name\"]", { timeout: 10000 }).type(name);
  cy.get('dialog.application.dialog select[name="type"]').select("character");
  cy.get('dialog.application.dialog footer button[type="submit"]').click();
}

before(() => {
  cy.readFile("scripts/data/origins.json").then((json) => { origins = json; });
});

// Nettoyage unique en fin de spec.
after(() => {
  if (!createdActorIds.length) return;
  // Suppression en session MJ (Actors créés par le MJ inclus).
  cy.loginAsGM();
  cy.window().then((win) => win.Actor.deleteDocuments(createdActorIds));
});

describe("Assistant de création de personnage — session Joueur", () => {
  beforeEach(() => {
    cy.loginAsPlayer();
    loadStringsForActiveLocale();
  });

  it("s'ouvre automatiquement sur un Actor vierge, sans jamais afficher la fiche native (T-WIZ-001)", () => {
    createBlankCharacter("Wizard T-WIZ-001");
    getWizardForm().should("be.visible");
    cy.get("input.actor-name").should("not.exist");
  });

  // Nom et PV toujours visibles sur le token dès la création.
  it("configure le token (nom/PV toujours visibles) dès la création de l'Actor (T-WIZ-019)", () => {
    createBlankCharacter("Wizard T-WIZ-019").then((id) => {
      cy.window().should((win) => {
        const actor = win.game.actors.get(id);
        expect(actor.prototypeToken.displayName).to.equal(win.CONST.TOKEN_DISPLAY_MODES.ALWAYS);
        expect(actor.prototypeToken.displayBars).to.equal(win.CONST.TOKEN_DISPLAY_MODES.ALWAYS);
        expect(actor.prototypeToken.bar1.attribute).to.equal("attributes.hp");
      });
    });
  });

  it("liste toutes les origines et les 12 classes, triées alphabétiquement (T-WIZ-002)", () => {
    createBlankCharacter("Wizard T-WIZ-002");
    getWizardForm().should("be.visible");

    cy.window().its("game.dndCustomAi.origins").then((originsData) => {
      cy.get('select[name="origin"] option').should("have.length", Object.keys(originsData).length + 1);
    });
    cy.get('select[name="origin"] option').then(($options) => {
      const labels = [...$options].slice(1).map((option) => option.textContent.trim());
      const sorted = [...labels].sort((a, b) => a.localeCompare(b, activeLang));
      expect(labels).to.deep.equal(sorted);
    });

    // 12 classes + option vide.
    cy.get('select[name="classKey"] option').should("have.length", 13);
    cy.get('select[name="classKey"] option').then(($options) => {
      const labels = [...$options].slice(1).map((option) => option.textContent.trim());
      const sorted = [...labels].sort((a, b) => a.localeCompare(b, activeLang));
      expect(labels).to.deep.equal(sorted);
    });
  });

  it("met à jour le résumé Origine à chaque changement de sélection (T-WIZ-003)", () => {
    createBlankCharacter("Wizard T-WIZ-003");
    getWizardForm().should("be.visible");

    cy.get('select[name="origin"]').select("fleuraine");
    cy.get("[data-origin-info]").invoke("text").then((textFleuraine) => {
      expect(textFleuraine).to.include(strings.Abilities.cha);
      expect(textFleuraine).to.include(strings.Abilities.str);
      expect(textFleuraine).to.include(strings.Skills.persuasion);
      expect(textFleuraine).to.include(origins.fleuraine.specialTrait.name);

      cy.get('select[name="origin"]').select("altenmark");
      cy.get("[data-origin-info]").invoke("text").should((textAltenmark) => {
        expect(textAltenmark, "le résumé doit changer avec la sélection").to.not.equal(textFleuraine);
        expect(textAltenmark).to.include(strings.Abilities.str);
        expect(textAltenmark).to.include(strings.Abilities.con);
        expect(textAltenmark).to.include(strings.Skills.athletics);
        expect(textAltenmark).to.include(origins.altenmark.specialTrait.name);
      });
    });
  });

  it("met à jour le résumé Classe à chaque changement de sélection (T-WIZ-004)", () => {
    createBlankCharacter("Wizard T-WIZ-004");
    getWizardForm().should("be.visible");

    // Guerrier : non lanceur, sauvegardes For/Con.
    cy.get('select[name="classKey"]').select("fighter");
    cy.get("[data-class-info]").invoke("text").then((textFighter) => {
      expect(textFighter).to.include(strings.Abilities.str);
      expect(textFighter).to.include(strings.Abilities.con);
      expect(textFighter, "un non-lanceur de sorts ne doit pas mentionner l'incantation").to.not.include(
        format(strings.Wizard.ClassInfoSpellcasting, { ability: "" }).split("(")[0].trim()
      );

      // Magicien : lanceur (Int), sauvegardes Int/Sag.
      cy.get('select[name="classKey"]').select("wizard");
      cy.get("[data-class-info]").invoke("text").should((textWizard) => {
        expect(textWizard, "le résumé doit changer avec la sélection").to.not.equal(textFighter);
        expect(textWizard).to.include(strings.Abilities.int);
        expect(textWizard).to.include(strings.Abilities.wis);
        expect(textWizard).to.include(
          format(strings.Wizard.ClassInfoSpellcasting, { ability: strings.Abilities.int }).split("(")[0].trim()
        );
      });
    });
  });

  it("indique le nombre de compétences à choisir selon la classe sélectionnée (T-WIZ-005)", () => {
    createBlankCharacter("Wizard T-WIZ-005");
    getWizardForm().should("be.visible");

    cy.get('select[name="classKey"]').select("fighter"); // 2 compétences (classSkillChoices)
    cy.get("[data-skill-count-hint]").should("have.text", format(strings.Wizard.SkillCountHint, { count: 2 }));

    cy.get('select[name="classKey"]').select("rogue"); // 4 compétences (classSkillChoices)
    cy.get("[data-skill-count-hint]").should("have.text", format(strings.Wizard.SkillCountHint, { count: 4 }));
  });

  it("verrouille les compétences non cochées une fois le quota de la classe atteint (T-WIZ-006)", () => {
    createBlankCharacter("Wizard T-WIZ-006");
    getWizardForm().should("be.visible");

    cy.get('select[name="classKey"]').select("fighter"); // quota 2
    cy.get('input[type="checkbox"][name^="skills."]').eq(0).check();
    cy.get('input[type="checkbox"][name^="skills."]').eq(1).check();

    cy.get('input[type="checkbox"][name^="skills."]:not(:checked)')
      .should("have.length.greaterThan", 0)
      .each(($checkbox) => cy.wrap($checkbox).should("be.disabled"));

    cy.get('input[type="checkbox"][name^="skills."]').eq(0).uncheck();
    cy.get('input[type="checkbox"][name^="skills."]:not(:checked)').each(($checkbox) =>
      cy.wrap($checkbox).should("be.enabled")
    );
  });

  it("échange automatiquement les valeurs dupliquées du tableau standard (T-WIZ-007)", () => {
    createBlankCharacter("Wizard T-WIZ-007");
    getWizardForm().should("be.visible");

    // Répartition par défaut : 15/14/13/12/10/8.
    cy.get('select[name="abilities.str"]').should("have.value", "15");
    cy.get('select[name="abilities.int"]').should("have.value", "12");

    cy.get('select[name="abilities.int"]').select("15");
    cy.get('select[name="abilities.str"]').should("have.value", "12");
    cy.get('select[name="abilities.int"]').should("have.value", "15");

    cy.get('select[name^="abilities."]').then(($selects) => {
      const values = [...$selects].map((select) => Number(select.value)).sort((a, b) => a - b);
      expect(values, "toujours une permutation valide du tableau standard").to.deep.equal([8, 10, 12, 13, 14, 15]);
    });
  });

  it("crée le personnage avec une soumission valide, équipement de départ inclus (T-WIZ-008, volet visible de T-WIZ-014)", () => {
    let actorId;
    createBlankCharacter("Gareth le Preux").then((id) => { actorId = id; });
    getWizardForm().should("be.visible");

    // .clear() et .type() séparés : le champ peut être recréé entre les deux.
    cy.get('input[name="name"]').clear();
    cy.get('input[name="name"]').type("Gareth le Preux");
    cy.get('select[name="origin"]').select("ravenmoor");
    cy.get('select[name="classKey"]').select("fighter"); // arme+armure de départ (classStartingEquipment)
    cy.get('input[type="checkbox"][name="skills.athletics"]').check();
    cy.get('input[type="checkbox"][name="skills.intimidation"]').check();
    cy.get('form.character-wizard button[type="submit"]').click();

    cy.contains(".notification", "Gareth le Preux", { timeout: 10000 }).should("exist");
    getWizardForm().should("not.exist");
    cy.get("input.actor-name").should("have.value", "Gareth le Preux");

    cy.window().then((win) => {
      const actor = win.game.actors.get(actorId);
      expect(actor.system.class).to.equal("fighter");
      expect(actor.system.origin).to.equal("ravenmoor");
      expect(actor.system.saves.str.proficient).to.be.true;
      expect(actor.system.saves.con.proficient).to.be.true;
      expect(actor.system.saves.dex.proficient).to.be.false;
      expect(actor.system.skills.athletics.proficient).to.be.true;
      expect(actor.system.skills.intimidation.proficient).to.be.true;
      expect(actor.system.attributes.hp.max, "PV max doit être calculé (>0)").to.be.greaterThan(0);
      expect(actor.system.attributes.hp.value).to.equal(actor.system.attributes.hp.max);

      const weapon = actor.items.find((item) => item.type === "weapon" && item.name === "Épée longue");
      const armor = actor.items.find((item) => item.type === "armor" && item.name === "Cotte de mailles");
      expect(weapon, "arme de départ du fighter introuvable — Items du monde importés ? (world-items/README.md)").to
        .exist;
      expect(armor, "armure de départ du fighter introuvable — Items du monde importés ? (world-items/README.md)").to
        .exist;
      expect(weapon.system.equipped).to.be.true;
      expect(armor.system.equipped).to.be.true;
    });
  });

  it("donne au lanceur son objet d'ambiance, rangé non équipé à côté de l'arme et de l'armure (T-WIZ-024)", () => {
    let actorId;
    createBlankCharacter("Frère Anselme").then((id) => { actorId = id; });
    getWizardForm().should("be.visible");

    cy.get('input[name="name"]').clear();
    cy.get('input[name="name"]').type("Frère Anselme");
    cy.get('select[name="origin"]').select("valdera");
    cy.get('select[name="classKey"]').select("cleric");
    cy.get('input[type="checkbox"][name="skills.religion"]').check();
    cy.get('input[type="checkbox"][name="skills.medicine"]').check();
    cy.get('form.character-wizard button[type="submit"]').click();

    cy.contains(".notification", "Frère Anselme", { timeout: 10000 }).should("exist");
    getWizardForm().should("not.exist");

    cy.window().should((win) => {
      const actor = win.game.actors.get(actorId);
      const symbol = actor.items.find((item) => item.type === "gear" && item.name === "Symbole de l'Unique");
      expect(symbol, "symbole de l'Unique du clerc introuvable — Items du monde importés ?").to.exist;
      expect(symbol.system.equipped, "objet d'ambiance jamais équipé d'office").to.not.equal(true);
      expect(actor.items.find((item) => item.type === "weapon" && item.name === "Masse d'armes").system.equipped).to.be.true;
      expect(actor.items.find((item) => item.type === "armor" && item.name === "Écailles").system.equipped).to.be.true;
    });
  });

  it("remplit les emplacements de sorts au maximum pour une classe lanceuse à la création (anomalie 2026-08-19)", () => {
    let actorId;
    createBlankCharacter("Elowen l'Étincelante").then((id) => { actorId = id; });
    getWizardForm().should("be.visible");

    cy.get('input[name="name"]').clear();
    cy.get('input[name="name"]').type("Elowen l'Étincelante");
    cy.get('select[name="origin"]').select("ravenmoor");
    cy.get('select[name="classKey"]').select("wizard");
    cy.get('input[type="checkbox"][name="skills.arcana"]').check();
    cy.get('input[type="checkbox"][name="skills.investigation"]').check();
    cy.get('form.character-wizard button[type="submit"]').click();

    cy.contains(".notification", "Elowen l'Étincelante", { timeout: 10000 }).should("exist");
    getWizardForm().should("not.exist");

    cy.window().should((win) => {
      const actor = win.game.actors.get(actorId);
      expect(actor.system.class).to.equal("wizard");
      // Magicien niveau 1 : au moins un emplacement de niveau 1.
      expect(
        actor.system.spells.slots[1].max,
        "prérequis : magicien niveau 1 a des emplacements de niveau 1"
      ).to.be.greaterThan(0);
      // Emplacements remplis dès la création.
      expect(
        actor.system.spells.slots[1].value,
        "emplacements remplis au max dès la création, pas laissés à 0"
      ).to.equal(actor.system.spells.slots[1].max);
    });
  });

  it("rejette une soumission avec un tableau standard invalide, sans mettre à jour l'Actor (T-WIZ-009)", () => {
    let actorId;
    createBlankCharacter("Wizard T-WIZ-009").then((id) => { actorId = id; });
    getWizardForm().should("be.visible");

    cy.get('select[name="classKey"]').select("fighter");
    cy.get('input[type="checkbox"][name="skills.athletics"]').check();
    cy.get('input[type="checkbox"][name="skills.intimidation"]').check();

    // Doublon dans le tableau standard posé directement en JS (sans « change »).
    cy.get('select[name="abilities.dex"]').then(($select) => { $select[0].value = "15"; });

    cy.get('form.character-wizard button[type="submit"]').click();

    cy.contains(".notification", strings.Wizard.InvalidAbilities, { timeout: 10000 }).should("exist");
    getWizardForm().should("be.visible"); // pas fermé
    cy.window().then((win) => {
      expect(win.game.actors.get(actorId).system.class).to.equal("");
    });
  });

  // La fiche n'apparaît jamais par-dessus l'assistant (`renderSheet: true` indispensable).
  // Contrôles ponctuels : un flash isolé peut échapper à ce test.
  it("ne laisse jamais apparaître la fiche native pendant que l'assistant est ouvert (T-WIZ-010)", () => {
    createBlankCharacter("Wizard T-WIZ-010", { renderSheet: true });
    cy.get("input.actor-name").should("not.exist");
    getWizardForm().should("be.visible");
    cy.get("input.actor-name").should("not.exist");
  });

    // Soumission de l'assistant (T-WIZ-020) et bouton « Assistant » d'une fiche ouverte (T-WIZ-021) :
    // aucun chevauchement, échantillonné en continu (pollNoOverlap).

  // Vraie boîte de dialogue native : aucun chevauchement (protégé par `openWizardActorIds`).
  it("bouton natif 'Créer un Acteur' de la sidebar (vraie boîte de dialogue) : jamais de chevauchement, échantillonné en continu (T-WIZ-022)", () => { // NOSONAR : assertions portées par les helpers (sheetRoot()…should)
    createCharacterViaNativeDialog("Wizard T-WIZ-022");
    pollNoOverlap();
    getWizardForm().should("be.visible");
    cy.window().then((win) => {
      const actor = win.game.actors.getName("Wizard T-WIZ-022");
      if (actor) createdActorIds.push(actor.id);
    });
  });

  it("soumission de l'assistant -> réouverture de la fiche : jamais de chevauchement, échantillonné en continu (T-WIZ-020)", () => {
    cy.window().then((win) => win.Actor.create(toAutObject(win, { name: "Wizard T-WIZ-020", type: "character" }))).then((actor) => {
      createdActorIds.push(actor.id);
    });
    getWizardForm().should("be.visible");
    cy.get('select[name="origin"]').select("fleuraine");
    cy.get('select[name="classKey"]').select("fighter");
    cy.get('input[type="checkbox"][name="skills.athletics"]').check();
    cy.get('input[type="checkbox"][name="skills.intimidation"]').check();
    cy.get('form.character-wizard button[type="submit"]').click();

    pollNoOverlap();
    // La fiche finit par apparaître.
    cy.get("input.actor-name", { timeout: 10000 }).should("be.visible");
  });

  it("bouton 'Assistant' depuis une fiche déjà ouverte : jamais de chevauchement, échantillonné en continu (T-WIZ-021)", () => {
    let actorId;
    createBlankCharacter("Wizard T-WIZ-021").then((id) => {
      actorId = id;
    });
    getWizardForm().should("be.visible");
    // Ferme l'assistant : le bouton « Assistant » n'apparaît que sur un Actor vierge.
    cy.get("form.character-wizard .window-header [data-action=\"close\"]").click();
    getWizardForm().should("not.exist");

    cy.window().then((win) => win.game.actors.get(actorId).sheet.render(true));
    cy.get("input.actor-name", { timeout: 15000 }).should("be.visible");

    cy.get('button[data-action="openCreationWizard"]').click();
    pollNoOverlap();
    getWizardForm().should("be.visible");
  });

  it("rejette une soumission avec un nombre de compétences hors quota, sans mettre à jour l'Actor (T-WIZ-011)", () => {
    let actorId;
    createBlankCharacter("Wizard T-WIZ-011").then((id) => { actorId = id; });
    getWizardForm().should("be.visible");

    cy.get('select[name="classKey"]').select("fighter"); // quota 2
    cy.get('input[type="checkbox"][name="skills.athletics"]').check(); // 1 seule cochée

    cy.get('form.character-wizard button[type="submit"]').click();

    cy.contains(".notification", format(strings.Wizard.InvalidSkillCount, { count: 2 }), { timeout: 10000 }).should(
      "exist"
    );
    getWizardForm().should("be.visible");
    cy.window().then((win) => {
      expect(win.game.actors.get(actorId).system.class).to.equal("");
    });
  });

  it("lie automatiquement le personnage créé au Joueur (T-WIZ-012)", () => {
    let actorId;
    createBlankCharacter("Wizard T-WIZ-012").then((id) => { actorId = id; });
    getWizardForm().should("be.visible");

    cy.get('select[name="origin"]').select("lucentia");
    cy.get('select[name="classKey"]').select("bard"); // quota 3
    cy.get('input[type="checkbox"][name="skills.deception"]').check();
    cy.get('input[type="checkbox"][name="skills.performance"]').check();
    cy.get('input[type="checkbox"][name="skills.persuasion"]').check();
    cy.get('form.character-wizard button[type="submit"]').click();

    getWizardForm().should("not.exist");
    cy.window().then((win) => {
      const actor = win.game.actors.get(actorId);
      expect(actor.ownership[win.game.user.id]).to.equal(win.CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER);
      expect(win.game.user.character?.id).to.equal(actor.id);
    });
  });

  it("permet de rouvrir l'assistant après une fermeture sans soumission, sans rien modifier (T-WIZ-018)", () => {
    let actorId;
    createBlankCharacter("Wizard T-WIZ-018").then((id) => { actorId = id; });
    getWizardForm().should("be.visible");

    cy.get('select[name="origin"]').select("ashar"); // saisie non soumise
    // Bouton de fermeture de la fenêtre.
    cy.get("form.character-wizard .window-header [data-action=\"close\"]").click();
    getWizardForm().should("not.exist");

    cy.window()
      .then((win) => {
        const actor = win.game.actors.get(actorId);
        expect(actor.system.origin, "aucune donnée ne doit avoir été modifiée").to.equal("");
        return actor.sheet.render(true);
      });

    cy.get('button[data-action="openCreationWizard"]', { timeout: 10000 }).should("be.visible").click();
    getWizardForm().should("be.visible");
  });
});

// T-WIZ-013 et T-WIZ-023 : scénarios dépendant du rôle MJ.
describe("Assistant de création de personnage — session MJ", () => {
  it("ne lie pas automatiquement le personnage créé au MJ (T-WIZ-013)", () => {
    cy.loginAsGM();

    let previousCharacterId;
    let actorId;
    cy.window()
      .then((win) => {
        previousCharacterId = win.game.user.character?.id ?? null;
        return win.Actor.create(toAutObject(win, { name: "Wizard T-WIZ-013 GM", type: "character" }));
      })
      .then((actor) => {
        actorId = actor.id;
        createdActorIds.push(actor.id);
      });

    getWizardForm().should("be.visible");
    cy.get('select[name="origin"]').select("valdera");
    cy.get('select[name="classKey"]').select("cleric"); // quota 2
    cy.get('input[type="checkbox"][name="skills.religion"]').check();
    cy.get('input[type="checkbox"][name="skills.insight"]').check();
    cy.get('form.character-wizard button[type="submit"]').click();
    getWizardForm().should("not.exist");

    cy.window().then((win) => {
      expect(win.game.user.character?.id ?? null).to.equal(previousCharacterId);
      expect(win.game.actors.get(actorId).system.class).to.equal("cleric"); // création réussie malgré tout
    });
  });

  // Équivalent MJ de T-WIZ-022.
  it("bouton natif 'Créer un Acteur' de la sidebar (vraie boîte de dialogue), session MJ : jamais de chevauchement (T-WIZ-023)", () => { // NOSONAR : assertions portées par les helpers (sheetRoot()…should)
    cy.loginAsGM();
    createCharacterViaNativeDialog("Wizard T-WIZ-023 GM");
    pollNoOverlap();
    getWizardForm().should("be.visible");
    cy.window().then((win) => {
      const actor = win.game.actors.getName("Wizard T-WIZ-023 GM");
      if (actor) createdActorIds.push(actor.id);
    });
  });
});
