// Retour de test (lot 3, point 9 "Accessibilité") : audit RGAA/WCAG des couleurs et styles du
// système, contraste texte/fond en particulier. axe-core (via cypress-axe) sonde le DOM RÉELLEMENT
// rendu (Chrome, cf. cypress.config.js > --browser chrome) plutôt qu'une matrice de contrastes
// calculée à la main sur les jetons --dca-* : plus fiable, tient compte des dégradés/textures de
// fond (styles/dnd-custom-ai.css > --dca-texture-parchment/wood) qu'un simple calcul hex ne
// capturerait pas. Scope volontairement restreint à la règle "color-contrast" (WCAG 1.4.3/1.4.11)
// — le reste d'axe-core (structure ARIA, labels...) est hors demande explicite du testeur.

const createdActorIds = [];

function sheetRoot() {
  return cy.get(".application.character");
}

function goToTab(tabId) {
  sheetRoot().find(`nav.tabs [data-tab="${tabId}"]`).click();
  sheetRoot().find(`section.tab[data-tab="${tabId}"]`).should("have.class", "active");
}

const allViolations = [];

function checkContrast(context, label) {
  cy.injectAxe();
  cy.checkA11y(
    context,
    { runOnly: ["color-contrast"] },
    (violations) => {
      const details = violations.flatMap((v) =>
        v.nodes.map((n) => ({ summary: n.failureSummary, html: n.html, target: n.target }))
      );
      if (details.length) allViolations.push({ label, details });
    },
    true
  );
}

let charId;

before(() => {
  cy.loginAsPlayer();
  cy.createReadyCharacter({ name: "A11y Character", origin: "altenmark", classKey: "barbarian", skills: ["athletics", "survival"] }).then(
    (id) => {
      charId = id;
      createdActorIds.push(id);
    }
  );
});

after(() => {
  cy.loginAsGM();
  cy.window().then((win) => win.Actor.deleteDocuments(createdActorIds));
  cy.writeFile("cypress/a11y-violations.json", allViolations);
});

describe("Accessibilité — contraste texte/fond (RGAA/WCAG)", () => {
  beforeEach(() => {
    cy.loginAsPlayer();
    cy.openActorSheet(charId);
  });

  ["stats", "equipment", "inventory", "abilities", "journal"].forEach((tab) => {
    it(`fiche personnage — onglet ${tab}`, () => {
      goToTab(tab);
      checkContrast(".application.character", `character:${tab}`);
    });
  });

  it("fiche PNJ — tous onglets", () => {
    cy.loginAsGM();
    cy.window()
      .then((win) => win.Actor.create(win.JSON.parse(win.JSON.stringify({ name: "A11y NPC", type: "npc" }))))
      .then((actor) => {
        createdActorIds.push(actor.id);
        return cy.window().then((win) => win.game.actors.get(actor.id).sheet.render(true));
      });
    cy.get(".application.npc input.actor-name", { timeout: 15000 }).should("be.visible");
    checkContrast(".application.npc", "npc:stats");
    cy.get(".application.npc nav.tabs [data-tab='abilities']").click();
    checkContrast(".application.npc", "npc:abilities");
    cy.get(".application.npc nav.tabs [data-tab='loot']").click();
    checkContrast(".application.npc", "npc:loot");
  });

  it("assistant de création de personnage", () => {
    cy.loginAsPlayer();
    cy.window().then((win) => win.Actor.create(win.JSON.parse(win.JSON.stringify({ name: "A11y Wizard Target", type: "character" }))))
      .then((actor) => createdActorIds.push(actor.id));
    cy.get("form.character-wizard", { timeout: 15000 }).should("be.visible");
    checkContrast("form.character-wizard", "wizard");
    cy.get("form.character-wizard .window-header [data-action='close']").click();
  });
});

describe("Accessibilité — fiches d'Item (contraste texte/fond)", () => {
  function latestItemSheet() {
    return cy.get(".application.sheet.item", { timeout: 10000 });
  }
  function fetchWorldItem(name) {
    return cy.window().then((win) => win.game.items.find((candidate) => candidate.name === name));
  }
  // Retry (jusqu'à 10 x 500ms) plutôt qu'une seule lecture : cette spec est la première de la
  // suite complète par ordre alphabétique (`npm run test:e2e:run`), donc la première à se
  // connecter en MJ — l'auto-import des compendiums (hook "ready", content-import.js) est
  // encore EN COURS à ce moment-là pour les paquets traités tard dans sa boucle séquentielle
  // (features puis feats puis languages, cf. COMPENDIUM_FILES) : `getDocuments()` peut renvoyer
  // un index incomplet si interrogé trop tôt (piège rencontré au premier run complet — "feature"
  // et "language" échouaient, "origin"/"class"/"spell", traités plus tôt dans la boucle,
  // passaient déjà). D'autres specs qui lisent aussi les compendiums (tab-abilities.cy.js,
  // item-sheets.cy.js) n'ont jamais eu besoin de ce retry : elles tournent après cette spec dans
  // l'ordre alphabétique, l'import a alors eu tout le temps de se terminer.
  function fetchCompendiumItem(pack, name, attempt = 0) {
    return cy
      .window()
      .then((win) => win.game.packs.get(`dnd-custom-ai.${pack}`).getDocuments())
      .then((docs) => {
        const item = docs.find((candidate) => candidate.name === name);
        if (item) return item;
        expect(attempt, `Item '${name}' introuvable dans le compendium ${pack} après 10 tentatives`).to.be.lessThan(10);
        return cy.wait(500).then(() => fetchCompendiumItem(pack, name, attempt + 1));
      });
  }

  before(() => {
    cy.loginAsGM();
  });

  beforeEach(() => {
    cy.loginAsGM();
  });

  const worldItemCases = [
    { type: "weapon", name: "Gourdin" },
    { type: "armor", name: "Cotte de mailles" },
    { type: "gear", name: "Torche" },
    { type: "tool", name: "Outils de voleur" }
  ];
  const compendiumItemCases = [
    { type: "feature", pack: "capacites", name: "Attaque d'opportunité" },
    { type: "origin", pack: "origines", name: "Fleuraine" },
    { type: "class", pack: "classes", name: "Guerrier" },
    { type: "spell", pack: "sorts", name: "Trait de feu" },
    { type: "language", pack: "langues", name: "Commune" }
  ];

  worldItemCases.forEach(({ type, name }) => {
    it(`fiche d'Item '${type}'`, () => {
      fetchWorldItem(name).then((item) => item.sheet.render(true));
      latestItemSheet().should("be.visible");
      checkContrast(".application.sheet.item", `item:${type}`);
    });
  });

  compendiumItemCases.forEach(({ type, pack, name }) => {
    it(`fiche d'Item '${type}' (compendium)`, () => {
      fetchCompendiumItem(pack, name).then((item) => item.sheet.render(true));
      latestItemSheet().should("be.visible");
      checkContrast(".application.sheet.item", `item:${type}`);
    });
  });
});
