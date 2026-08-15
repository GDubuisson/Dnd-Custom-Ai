// Implémente la section 1 (T-WIZ-001 à T-WIZ-018) de tests/E2E_TEST_PLAN.md — assistant de
// création de personnage (character-creation-wizard.js). Stratégie de fixtures retenue pour
// toute la suite (cf. discussion de session, plan > "Prérequis d'infrastructure") : chaque test
// crée un Actor "character" vierge puis rejoue l'assistant comme un vrai joueur, plutôt que des
// fixtures JSON pré-importées — plus lent mais c'est justement ce module qui est testé ici.
//
// Session utilisée : Joueur (cf. cy.loginAsPlayer(), cypress/support/e2e.js), conformément à la
// convention par défaut du plan — sauf T-WIZ-013 dont le comportement dépend explicitement du
// rôle MJ (décrit dans son propre describe, connexion Gamemaster dédiée).
//
// Prérequis d'infrastructure (au-delà de ceux déjà documentés dans tests/README.md) :
//   - Un utilisateur Joueur "Player1" (cf. Cypress.env("testPlayerName")) existant dans le
//     monde de test, avec la permission "Créer des acteurs" accordée (Configuration du monde >
//     Permissions) — sans quoi Actor.create() côté client échoue pour ce rôle et T-WIZ-001 (et
//     tout le reste, qui en dépend) ne peut pas s'exécuter.
//   - Les Items du monde (armes/armures) sont importés automatiquement au premier chargement du
//     monde (hook "ready", cf. scripts/helpers/content-import.js, world-items/README.md) : rien
//     à faire à la main tant que le monde de test a déjà tourné une fois.
//
// Sélecteurs non encore vérifiés en conditions réelles (pas de Docker/licence Foundry
// disponible dans l'environnement où ce fichier a été écrit, cf. tests/README.md > "Limites
// connues" de la couche E2E/Quench) : la zone de notifications (`.notification`) et le bouton
// de fermeture de fenêtre AppV2 (`[data-action="close"]` dans `.window-header`) sont écrits
// d'après les conventions Foundry v13/14 usuelles, à ajuster au premier lancement réel comme
// pour cypress/e2e/system-load.cy.js.
//
// Actor.create() est appelé directement via cy.window() plutôt qu'en pilotant le dialogue natif
// "Créer un acteur" de la sidebar : ce qui est testé ici est le comportement déclenché par la
// création (hook createActor, dnd-custom-ai.js), pas ce formulaire natif lui-même — même
// approche que tests/quench/quench-tests.js.

let fr;
let origins;
const createdActorIds = [];

function format(template, vars = {}) {
  return template.replace(/\{(\w+)\}/g, (_, key) => String(vars[key] ?? ""));
}

function createBlankCharacter(name) {
  return cy
    .window()
    .then((win) => win.Actor.create({ name, type: "character" }))
    .then((actor) => {
      createdActorIds.push(actor.id);
      return actor.id;
    });
}

function getWizardForm() {
  return cy.get("form.character-wizard", { timeout: 15000 });
}

before(() => {
  cy.readFile("lang/fr.json").then((json) => { fr = json.DND_CUSTOM; });
  cy.readFile("scripts/data/origins.json").then((json) => { origins = json; });
});

// Nettoyage global plutôt que par test : chaque test recharge une session complète (cf.
// cy.loginAsPlayer() dans beforeEach), donc un afterEach par test ajouterait une reconnexion
// supplémentaire pour rien — les Actors créés persistent côté serveur entre les tests d'une
// même session Cypress, un seul nettoyage final suffit (même principe que le `after` de
// tests/quench/quench-tests.js).
after(() => {
  if (!createdActorIds.length) return;
  cy.loginAsPlayer();
  cy.window().then((win) => win.Actor.deleteDocuments(createdActorIds));
});

describe("Assistant de création de personnage — session Joueur", () => {
  beforeEach(() => {
    cy.loginAsPlayer();
  });

  it("s'ouvre automatiquement sur un Actor vierge, sans jamais afficher la fiche native (T-WIZ-001)", () => {
    createBlankCharacter("Wizard T-WIZ-001");
    getWizardForm().should("be.visible");
    cy.get("input.actor-name").should("not.exist");
  });

  it("liste toutes les origines et les 12 classes, triées alphabétiquement (T-WIZ-002)", () => {
    createBlankCharacter("Wizard T-WIZ-002");
    getWizardForm().should("be.visible");

    cy.window().its("game.dndCustomAi.origins").then((originsData) => {
      cy.get('select[name="origin"] option').should("have.length", Object.keys(originsData).length + 1);
    });
    cy.get('select[name="origin"] option').then(($options) => {
      const labels = [...$options].slice(1).map((option) => option.textContent.trim());
      const sorted = [...labels].sort((a, b) => a.localeCompare(b, "fr"));
      expect(labels).to.deep.equal(sorted);
    });

    // 12 classes SRD 5e (cf. DND_CUSTOM.classes, scripts/helpers/config.js) + l'option vide "—".
    cy.get('select[name="classKey"] option').should("have.length", 13);
    cy.get('select[name="classKey"] option').then(($options) => {
      const labels = [...$options].slice(1).map((option) => option.textContent.trim());
      const sorted = [...labels].sort((a, b) => a.localeCompare(b, "fr"));
      expect(labels).to.deep.equal(sorted);
    });
  });

  it("met à jour le résumé Origine à chaque changement de sélection (T-WIZ-003)", () => {
    createBlankCharacter("Wizard T-WIZ-003");
    getWizardForm().should("be.visible");

    cy.get('select[name="origin"]').select("fleuraine");
    cy.get("[data-origin-info]").invoke("text").then((textFleuraine) => {
      expect(textFleuraine).to.include(fr.Abilities.cha);
      expect(textFleuraine).to.include(fr.Abilities.str);
      expect(textFleuraine).to.include(fr.Skills.persuasion);
      expect(textFleuraine).to.include(origins.fleuraine.specialTrait.name);

      cy.get('select[name="origin"]').select("altenmark");
      cy.get("[data-origin-info]").invoke("text").should((textAltenmark) => {
        expect(textAltenmark, "le résumé doit changer avec la sélection").to.not.equal(textFleuraine);
        expect(textAltenmark).to.include(fr.Abilities.str);
        expect(textAltenmark).to.include(fr.Abilities.con);
        expect(textAltenmark).to.include(fr.Skills.athletics);
        expect(textAltenmark).to.include(origins.altenmark.specialTrait.name);
      });
    });
  });

  it("met à jour le résumé Classe à chaque changement de sélection (T-WIZ-004)", () => {
    createBlankCharacter("Wizard T-WIZ-004");
    getWizardForm().should("be.visible");

    // fighter : non lanceur de sorts, sauvegardes Force/Constitution (SRD 5e).
    cy.get('select[name="classKey"]').select("fighter");
    cy.get("[data-class-info]").invoke("text").then((textFighter) => {
      expect(textFighter).to.include(fr.Abilities.str);
      expect(textFighter).to.include(fr.Abilities.con);
      expect(textFighter, "un non-lanceur de sorts ne doit pas mentionner l'incantation").to.not.include(
        format(fr.Wizard.ClassInfoSpellcasting, { ability: "" }).split("(")[0].trim()
      );

      // wizard (magicien) : lanceur de sorts (Intelligence), sauvegardes Intelligence/Sagesse.
      cy.get('select[name="classKey"]').select("wizard");
      cy.get("[data-class-info]").invoke("text").should((textWizard) => {
        expect(textWizard, "le résumé doit changer avec la sélection").to.not.equal(textFighter);
        expect(textWizard).to.include(fr.Abilities.int);
        expect(textWizard).to.include(fr.Abilities.wis);
        expect(textWizard).to.include(
          format(fr.Wizard.ClassInfoSpellcasting, { ability: fr.Abilities.int }).split("(")[0].trim()
        );
      });
    });
  });

  it("indique le nombre de compétences à choisir selon la classe sélectionnée (T-WIZ-005)", () => {
    createBlankCharacter("Wizard T-WIZ-005");
    getWizardForm().should("be.visible");

    cy.get('select[name="classKey"]').select("fighter"); // 2 compétences (classSkillChoices)
    cy.get("[data-skill-count-hint]").should("have.text", format(fr.Wizard.SkillCountHint, { count: 2 }));

    cy.get('select[name="classKey"]').select("rogue"); // 4 compétences (classSkillChoices)
    cy.get("[data-skill-count-hint]").should("have.text", format(fr.Wizard.SkillCountHint, { count: 4 }));
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

    // Répartition de départ (cf. STANDARD_ARRAY, character-creation-wizard.js) :
    // str=15, dex=14, con=13, int=12, wis=10, cha=8.
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

    cy.get('input[name="name"]').clear().type("Gareth le Preux");
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

  it("rejette une soumission avec un tableau standard invalide, sans mettre à jour l'Actor (T-WIZ-009)", () => {
    let actorId;
    createBlankCharacter("Wizard T-WIZ-009").then((id) => { actorId = id; });
    getWizardForm().should("be.visible");

    cy.get('select[name="classKey"]').select("fighter");
    cy.get('input[type="checkbox"][name="skills.athletics"]').check();
    cy.get('input[type="checkbox"][name="skills.intimidation"]').check();

    // Force un doublon dans le tableau standard sans passer par un clic : #syncAbilitySelects
    // n'échange les valeurs qu'en réaction à l'évènement "change", donc écrire .value
    // directement en JS le contourne (cf. plan, T-WIZ-009 : "modifier le DOM autrement qu'au
    // clic"). str reste à 15 (valeur par défaut), on pose dex à 15 aussi.
    cy.get('select[name="abilities.dex"]').then(($select) => { $select[0].value = "15"; });

    cy.get('form.character-wizard button[type="submit"]').click();

    cy.contains(".notification", fr.Wizard.InvalidAbilities, { timeout: 10000 }).should("exist");
    getWizardForm().should("be.visible"); // pas fermé
    cy.window().then((win) => {
      expect(win.game.actors.get(actorId).system.class).to.equal("");
    });
  });

  // Régression connue au moment d'écrire ce test (cf. [[project_souci1_wizard_sheet_race]],
  // tests/E2E_TEST_PLAN.md > "Prérequis d'infrastructure") : la fiche native flashait par-dessus
  // l'assistant malgré 3 correctifs antérieurs. NE PAS neutraliser cette assertion (skip,
  // condition affaiblie...) pour faire passer la CI au vert artificiellement tant que le bug
  // n'est pas réellement corrigé — ce test doit rester rouge jusque-là.
  //
  // Limite connue de cette vérification : Cypress observe des points discrets dans le temps
  // (les deux cy.get ci-dessous), pas un flux continu — un flash isolé entre deux vérifications
  // pourrait échapper à ce test. Insuffisant pour prouver l'absence totale du bug, suffisant
  // pour détecter le cas déjà observé (fiche visible juste après la création, avant que
  // l'assistant ne prenne l'écran).
  it("ne laisse jamais apparaître la fiche native pendant que l'assistant est ouvert (T-WIZ-010, régression connue)", () => {
    createBlankCharacter("Wizard T-WIZ-010");
    cy.get("input.actor-name").should("not.exist");
    getWizardForm().should("be.visible");
    cy.get("input.actor-name").should("not.exist");
  });

  it("rejette une soumission avec un nombre de compétences hors quota, sans mettre à jour l'Actor (T-WIZ-011)", () => {
    let actorId;
    createBlankCharacter("Wizard T-WIZ-011").then((id) => { actorId = id; });
    getWizardForm().should("be.visible");

    cy.get('select[name="classKey"]').select("fighter"); // quota 2
    cy.get('input[type="checkbox"][name="skills.athletics"]').check(); // 1 seule cochée

    cy.get('form.character-wizard button[type="submit"]').click();

    cy.contains(".notification", format(fr.Wizard.InvalidSkillCount, { count: 2 }), { timeout: 10000 }).should(
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
    // Bouton de fermeture de fenêtre AppV2 standard (cf. caveat de sélecteurs en tête de
    // fichier) plutôt qu'un raccourci clavier, pour rester au plus près d'une vraie
    // interaction utilisateur.
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

// T-WIZ-013 : seul scénario de cette section dont le comportement dépend explicitement du rôle
// (cf. tests/E2E_TEST_PLAN.md > Conventions) — connexion Gamemaster dédiée, même séquence que
// cypress/e2e/system-load.cy.js plutôt que cy.loginAsPlayer().
describe("Assistant de création de personnage — session MJ", () => {
  it("ne lie pas automatiquement le personnage créé au MJ (T-WIZ-013)", () => {
    cy.intercept({ url: "**/game" }, (req) => { delete req.headers["sec-fetch-dest"]; });
    cy.intercept({ url: "**/join" }, (req) => { delete req.headers["sec-fetch-dest"]; });

    cy.visit("/", { timeout: 30000 });
    cy.url({ timeout: 15000 }).should("include", "/join");
    cy.get('select[name="userid"]').select("Gamemaster");
    cy.get('#join-game-form button[type="submit"]').click();
    cy.get("#interface", { timeout: 30000 }).should("be.visible");
    cy.window({ timeout: 20000 }).its("game.ready").should("eq", true);
    cy.assertSystemVersionMatches();

    let previousCharacterId;
    let actorId;
    cy.window()
      .then((win) => {
        previousCharacterId = win.game.user.character?.id ?? null;
        return win.Actor.create({ name: "Wizard T-WIZ-013 GM", type: "character" });
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
});
