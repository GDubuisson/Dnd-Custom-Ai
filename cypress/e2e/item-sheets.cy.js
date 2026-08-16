// Implémente la section 12 (T-ITEM-001 à T-ITEM-003) de tests/E2E_TEST_PLAN.md — fiches d'Item
// (item-sheets.js, templates/item/*.hbs). Un Item par type (les 9 du plan : weapon/armor/
// feature/gear/language/origin/class/spell/tool — "subclass" n'est pas listé séparément, sa
// fiche est de toute façon la même que "class", cf. registerSheet dans dnd-custom-ai.js et
// reference-sheets.cy.js > T-REF-002), pris dans les Items du monde déjà importés pour les
// types physiques (weapon/armor/gear/tool, cf. world-items/*.json) ou dans leur compendium pour
// les autres (feature/origin/class/spell/language, cf. content-import.js) — session MJ tout du
// long : ouvrir/éditer une fiche d'Item de compendium exige des droits d'écriture que
// l'ownership du pack (PLAYER: OBSERVER, system.json) refuse à un Joueur.

function fetchCompendiumItem(pack, name) {
  return cy
    .window()
    .then((win) => win.game.packs.get(`dnd-custom-ai.${pack}`).getDocuments())
    .then((docs) => {
      const item = docs.find((candidate) => candidate.name === name);
      expect(item, `prérequis : l'Item '${name}' existe dans le compendium ${pack}`).to.exist;
      return item;
    });
}

function fetchWorldItem(name) {
  return cy.window().then((win) => {
    const item = win.game.items.find((candidate) => candidate.name === name);
    expect(item, `prérequis : l'Item '${name}' existe dans les Items du monde`).to.exist;
    return item;
  });
}

function latestItemSheet() {
  return cy.get(".application.sheet.item", { timeout: 10000 });
}

before(() => {
  cy.loginAsGM();
});

beforeEach(() => {
  cy.loginAsGM();
});

describe("Fiches d'Item — ouverture de chaque type", () => {
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
    it(`ouvre la fiche d'un Item de type '${type}' sans erreur (T-ITEM-001)`, () => {
      fetchWorldItem(name).then((item) => item.sheet.render(true));
      latestItemSheet().should("be.visible").and("contain.text", name);
    });
  });

  compendiumItemCases.forEach(({ type, pack, name }) => {
    it(`ouvre la fiche d'un Item de type '${type}' sans erreur (T-ITEM-001)`, () => {
      fetchCompendiumItem(pack, name).then((item) => item.sheet.render(true));
      latestItemSheet().should("be.visible").and("contain.text", name);
    });
  });
});

describe("Fiches d'Item — édition et champs conditionnels", () => {
  it("un champ simple modifié persiste après fermeture/réouverture (T-ITEM-002)", () => {
    fetchWorldItem("Gourdin").then((item) => item.sheet.render(true));
    latestItemSheet().find('input[name="system.weight"]').clear().type("2.5").blur();

    cy.window().should((win) => {
      const item = win.game.items.find((candidate) => candidate.name === "Gourdin");
      expect(item.system.weight).to.equal(2.5);
    });

    cy.window().then((win) => win.game.items.find((candidate) => candidate.name === "Gourdin").sheet.close());
    cy.window().then((win) => win.game.items.find((candidate) => candidate.name === "Gourdin").sheet.render(true));
    latestItemSheet().find('input[name="system.weight"]').should("have.value", "2.5");

    // Remet le poids d'origine pour ne pas fausser un futur run de cette spec/d'une autre
    // utilisant le même Item du monde (ex. tab-inventory.cy.js).
    cy.window().then((win) => {
      const item = win.game.items.find((candidate) => candidate.name === "Gourdin");
      return item.update(win.JSON.parse(win.JSON.stringify({ "system.weight": 0.9 })));
    });
  });

  it("le champ Dégâts (Polyvalente) apparaît seulement une fois la propriété activée (T-ITEM-003)", () => {
    fetchWorldItem("Gourdin").then((item) => {
      expect(item.system.properties.versatile, "prérequis : 'Gourdin' n'est pas Polyvalente par défaut").to.be.false;
      item.sheet.render(true);
    });

    latestItemSheet().find('input[name="system.damageVersatile.dice"]').should("not.exist");
    latestItemSheet().find('input[name="system.properties.versatile"]').check();
    latestItemSheet().find('input[name="system.damageVersatile.dice"]').should("exist");

    // Nettoyage : remet la propriété à son état par défaut.
    cy.window().then((win) => {
      const item = win.game.items.find((candidate) => candidate.name === "Gourdin");
      return item.update(win.JSON.parse(win.JSON.stringify({ "system.properties.versatile": false })));
    });
  });
});
