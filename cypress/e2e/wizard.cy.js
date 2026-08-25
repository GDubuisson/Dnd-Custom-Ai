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
// Vérifié au réel le 2026-08-15 (14/14, Chrome headless, cf. package.json > test:e2e:run) contre
// une vraie instance Docker. Pièges rencontrés et corrigés au passage, à connaître avant de
// copier ces patterns dans une future spec :
//   - Un objet littéral `{...}` écrit dans le code de la spec appartient à la réalité JS de
//     Cypress, pas à celle de la page Foundry testée : Foundry le rejette ("Actor must be
//     constructed with a DataModel or Object") dès qu'on le passe à une méthode Foundry
//     (Actor.create...) — cf. toAutObject ci-dessous.
//   - Foundry ouvre automatiquement la fenêtre "User Configuration" pour un Joueur sans
//     personnage assigné ; elle reste ouverte et entre en collision avec des sélecteurs
//     génériques (`input[name="name"]`) — fermée systématiquement dans cy.loginAsPlayer().
//   - Le monde de test peut tourner dans une langue différente de celle supposée à l'écriture
//     (ici : anglais) — les chaînes localisées sont donc chargées dynamiquement depuis
//     `game.i18n.lang`, jamais depuis lang/fr.json en dur (cf. loadStringsForActiveLocale).
//   - Viewport Cypress par défaut (1000x660) sous le minimum exigé par Foundry (1024x768) :
//     déclenche une notification d'erreur permanente qui finit par recouvrir des boutons —
//     cf. viewportWidth/Height, cypress.config.js.
//
// Actor.create() est appelé directement via cy.window() plutôt qu'en pilotant le dialogue natif
// "Créer un acteur" de la sidebar : ce qui est testé ici est le comportement déclenché par la
// création (hook createActor, dnd-custom-ai.js), pas ce formulaire natif lui-même — même
// approche que tests/quench/quench-tests.js.

// Chaînes localisées (DND_CUSTOM.* de lang/<langue active>.json) et langue active elle-même :
// déterminées dynamiquement par session plutôt que fixées à "fr" à l'écriture de ce fichier —
// le monde de test s'est avéré tourner en anglais au premier run réel (2026-08-15), ce que rien
// n'imposait de deviner à l'avance. origins.json (scripts/data/origins.json), lui, n'est PAS
// localisé (buildOriginInfoText affiche `specialTrait.name` tel quel, cf.
// character-creation-wizard.js) : ses valeurs restent valides quelle que soit la langue active,
// pas besoin de le recharger par langue.
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
  return template.replace(/\{(\w+)\}/g, (_, key) => String(vars[key] ?? ""));
}

// Un objet littéral `{...}` créé dans le code de la spec appartient à la réalité JS de Cypress
// (bundle du test runner), pas à celle de la page Foundry testée : Foundry rejette ces objets
// "d'un autre monde" ("Actor must be constructed with a DataModel or Object", découvert au
// premier run réel de ce fichier) car leur chaîne de prototypes ne remonte pas au `Object` du
// contexte AUT. `win.Object.assign(new win.Object(), data)` reconstruit un objet appartenant à
// la bonne réalité avant de le passer à une méthode Foundry (Actor.create, etc.).
function toAutObject(win, data) {
  return win.Object.assign(new win.Object(), data);
}

// `renderSheet` : par défaut absent (comportement d'un appel programmatique classique, ex.
// macro/script). Le vrai déclencheur du bug T-WIZ-010 est le bouton natif "Créer un Acteur" de
// la sidebar, qui appelle en interne `Document.create(data, {renderSheet: true})` (cf.
// `Document#createDialog()` du core Foundry) — un `Actor.create()` sans options ne l'exerce
// jamais. Passer `{ renderSheet: true }` ici reproduit fidèlement ce chemin sans dépendre d'une
// interaction UI avec la boîte de dialogue native elle-même.
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

before(() => {
  cy.readFile("scripts/data/origins.json").then((json) => { origins = json; });
});

// Nettoyage global plutôt que par test : chaque test recharge une session complète (cf.
// cy.loginAsPlayer() dans beforeEach), donc un afterEach par test ajouterait une reconnexion
// supplémentaire pour rien — les Actors créés persistent côté serveur entre les tests d'une
// même session Cypress, un seul nettoyage final suffit (même principe que le `after` de
// tests/quench/quench-tests.js).
after(() => {
  if (!createdActorIds.length) return;
  // Session MJ, pas Joueur : T-WIZ-013 crée son Actor sous la session MJ (c'est justement ce
  // rôle que ce scénario teste), et un Joueur n'a pas le droit de supprimer un Actor dont il
  // n'est pas propriétaire (`User Player1 lacks permission to delete Actor`, découvert au
  // premier run réel) — le MJ, lui, peut toujours tout supprimer.
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

  // Retour de test (2026-08-16) : par défaut Foundry n'affiche ni le nom ni la barre de vie
  // d'un token (DISPLAY_MODES.NONE) — corrigé via un hook `preCreateActor` générique
  // (dnd-custom-ai.js, indépendant du type d'Actor, cf. aussi ensureTokenDisplayDefaults pour
  // la migration des Actors déjà existants). Testé ici sur un Actor "character" nu, sans passer
  // par l'assistant : le hook agit à la création, avant même que l'assistant n'intervienne.
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

    // 12 classes SRD 5e (cf. DND_CUSTOM.classes, scripts/helpers/config.js) + l'option vide "—".
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

    // fighter : non lanceur de sorts, sauvegardes Force/Constitution (SRD 5e).
    cy.get('select[name="classKey"]').select("fighter");
    cy.get("[data-class-info]").invoke("text").then((textFighter) => {
      expect(textFighter).to.include(strings.Abilities.str);
      expect(textFighter).to.include(strings.Abilities.con);
      expect(textFighter, "un non-lanceur de sorts ne doit pas mentionner l'incantation").to.not.include(
        format(strings.Wizard.ClassInfoSpellcasting, { ability: "" }).split("(")[0].trim()
      );

      // wizard (magicien) : lanceur de sorts (Intelligence), sauvegardes Intelligence/Sagesse.
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

    // .clear() puis .type() séparément (pas chaîné) : un re-render de l'assistant entre les deux
    // détachait parfois le champ du DOM ("The subject is no longer attached to the DOM"),
    // découvert en flake au 4e run réel (2026-08-15) — chaque commande indépendante requery le
    // DOM à son propre déclenchement plutôt que de réutiliser un sujet potentiellement périmé.
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
      // Magicien niveau 1 (fullCaster[1] = [2,0,...], scripts/data/spell-slots.json) : au moins
      // un emplacement de niveau 1 disponible dès la création — prérequis du test lui-même.
      expect(
        actor.system.spells.slots[1].max,
        "prérequis : magicien niveau 1 a des emplacements de niveau 1"
      ).to.be.greaterThan(0);
      // Le bug corrigé laissait `value` à 0 malgré un `max` > 0 tant qu'aucun repos long n'avait
      // eu lieu (cf. ANOMALIES_ACTIVES.md, character-creation-wizard.js > spellSlotFillUpdates).
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

    // Force un doublon dans le tableau standard sans passer par un clic : #syncAbilitySelects
    // n'échange les valeurs qu'en réaction à l'évènement "change", donc écrire .value
    // directement en JS le contourne (cf. plan, T-WIZ-009 : "modifier le DOM autrement qu'au
    // clic"). str reste à 15 (valeur par défaut), on pose dex à 15 aussi.
    cy.get('select[name="abilities.dex"]').then(($select) => { $select[0].value = "15"; });

    cy.get('form.character-wizard button[type="submit"]').click();

    cy.contains(".notification", strings.Wizard.InvalidAbilities, { timeout: 10000 }).should("exist");
    getWizardForm().should("be.visible"); // pas fermé
    cy.window().then((win) => {
      expect(win.game.actors.get(actorId).system.class).to.equal("");
    });
  });

  // Régression connue historiquement (cf. [[project_souci1_wizard_sheet_race]],
  // tests/E2E_TEST_PLAN.md > "Prérequis d'infrastructure") : la fiche native flashait par-dessus
  // l'assistant malgré 3 correctifs antérieurs. Corrigée le 2026-08-16 par un override de
  // `render()` dans DndCustomActorSheet (scripts/sheets/actor-sheet.js) qui court-circuite tout
  // rendu tant que l'assistant est ouvert pour ce même Actor (comparaison par référence via
  // `foundry.applications.instances`), plutôt que de dépendre du seul flag `options.renderSheet`
  // du hook `preCreateActor` (best-effort, insuffisant seul).
  //
  // `{ renderSheet: true }` ci-dessous est essentiel : c'est le vrai déclencheur du bug (celui
  // qu'utilise en interne le bouton natif "Créer un Acteur" de la sidebar). Un `Actor.create()`
  // sans options n'exerce jamais ce chemin — utiliser createBlankCharacter() sans cette option
  // ferait passer ce test trivialement, qu'il y ait bug ou non.
  //
  // Limite connue de cette vérification : Cypress observe des points discrets dans le temps
  // (les deux cy.get ci-dessous), pas un flux continu — un flash isolé entre deux vérifications
  // pourrait échapper à ce test. Insuffisant pour prouver l'absence totale du bug, suffisant
  // pour détecter le cas déjà observé (fiche visible juste après la création, avant que
  // l'assistant ne prenne l'écran).
  it("ne laisse jamais apparaître la fiche native pendant que l'assistant est ouvert (T-WIZ-010)", () => {
    createBlankCharacter("Wizard T-WIZ-010", { renderSheet: true });
    cy.get("input.actor-name").should("not.exist");
    getWizardForm().should("be.visible");
    cy.get("input.actor-name").should("not.exist");
  });

  // Retour de test (lot 3, point 10 "Assistant de création") : 4e signalement du même bug
  // ("la fiche s'affiche derrière/devant l'assistant") malgré le correctif de T-WIZ-010 ci-dessus
  // — réinvestigation complète plutôt que reconfirmation du correctif existant. Les 3 chemins
  // possibles de rendu de la fiche (cf. grep `.sheet.render`/`new CharacterCreationWizard` dans
  // scripts/) ont été retestés : création native (T-WIZ-010 ci-dessus, déjà couvert), soumission
  // de l'assistant -> réouverture de la fiche (T-WIZ-020), et bouton "Assistant" depuis une fiche
  // déjà ouverte (T-WIZ-021). Aucun chevauchement reproduit sur les trois — `DndCustomActorSheet
  // #render` (actor-sheet.js) bloque bien à la source, et `ApplicationV2#close()` (cœur Foundry)
  // attend réellement la fin de l'animation de fermeture (jusqu'à 1000ms) avant de retirer
  // l'instance de `foundry.applications.instances`, donc avant que `render()` ne puisse s'y fier.
  // Contrairement à T-WIZ-010 (2 points de contrôle discrets, limite documentée dans son propre
  // commentaire), ces deux tests échantillonnent en continu (toutes les 50ms) sur toute la
  // transition — capable de repérer un flash isolé qu'une vérification ponctuelle manquerait.
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
    // La fiche doit bien finir par apparaître (pas juste "jamais de chevauchement" par absence
    // totale de rendu) : preuve que le blocage ne s'est pas simplement mué en blocage permanent.
    cy.get("input.actor-name", { timeout: 10000 }).should("be.visible");
  });

  it("bouton 'Assistant' depuis une fiche déjà ouverte : jamais de chevauchement, échantillonné en continu (T-WIZ-021)", () => {
    let actorId;
    createBlankCharacter("Wizard T-WIZ-021").then((id) => {
      actorId = id;
    });
    getWizardForm().should("be.visible");
    // Ferme l'assistant auto-ouvert sans soumettre (Actor vierge, sans classe/origine) : le
    // bouton "Assistant" n'est visible sur la fiche que dans cet état (cf. showCreationWizardButton,
    // actor-sheet.js).
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
});
