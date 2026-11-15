// Compendium « adversaires » : 15 PNJ (humanoïdes et bêtes réelles), attaques jouables et butin.

const createdActorIds = [];

function sheetRoot() {
  return cy.get(".application.npc");
}

// Attend la fin de l'import automatique ; ne jamais relancer l'import (doublons).
function waitForAdversairesImport() {
  return cy.window({ timeout: 20000 }).should((win) => {
    const pack = win.game.packs.get("dnd-custom-ai.adversaires");
    expect(pack, "compendium 'adversaires' introuvable").to.exist;
    expect(pack.index.size, "import automatique du bestiaire pas encore terminé").to.equal(15);
  });
}

after(() => {
  cy.loginAsGM();
  cy.window().then((win) => win.Actor.deleteDocuments(createdActorIds));
});

describe("Compendium \"Adversaires\" — présence et contenu", () => {
  beforeEach(() => cy.loginAsGM());

  it("existe, contient exactement les 15 PNJ attendus, aucune créature hors scope (T-ADV-001)", () => {
    waitForAdversairesImport();
    cy.window().then(async (win) => {
      const pack = win.game.packs.get("dnd-custom-ai.adversaires");
      expect(pack, "compendium 'adversaires' introuvable").to.exist;
      const index = await pack.getIndex();

      const expectedHumanoids = ["Brigand", "Maraudeur", "Garde", "Espion", "Chef de brigands", "Mercenaire vétéran", "Chevalier"];
      const expectedBeasts = ["Rat", "Corbeau", "Loup", "Sanglier", "Serpent venimeux", "Panthère", "Crocodile", "Ours brun"];
      const names = [...index].map((entry) => entry.name);

      expect(names, "15 entrées attendues").to.have.length(15);
      for (const name of [...expectedHumanoids, ...expectedBeasts]) {
        expect(names, `"${name}" absent du compendium`).to.include(name);
      }
    });
  });

  it("aucune entrée n'est du type humanoid/beast en dehors de la liste attendue (T-ADV-002)", () => {
    waitForAdversairesImport();
    cy.window().then(async (win) => {
      const pack = win.game.packs.get("dnd-custom-ai.adversaires");
      const docs = await pack.getDocuments();
      for (const doc of docs) {
        expect(["humanoid", "beast"], `"${doc.name}" a un type de créature hors scope : ${doc.system.creatureType}`).to.include(
          doc.system.creatureType
        );
      }
    });
  });
});

describe("PNJ humanoïde importé depuis le compendium — Brigand", () => {
  let brigandId;

  before(() => {
    cy.loginAsGM();
    waitForAdversairesImport();
    cy.window().then(async (win) => {
      const pack = win.game.packs.get("dnd-custom-ai.adversaires");
      const index = await pack.getIndex();
      const entry = [...index].find((candidate) => candidate.name === "Brigand");
      const source = await pack.getDocument(entry._id);
      const imported = await win.Actor.create(win.JSON.parse(win.JSON.stringify(source.toObject())));
      brigandId = imported.id;
      createdActorIds.push(brigandId);
    });
  });

  beforeEach(() => cy.loginAsGM());

  it("a une attaque jouable et son butin (Cimeterre, Dague, bourse) une fois importé (T-ADV-003)", () => {
    cy.window().then((win) => {
      const actor = win.game.actors.get(brigandId);
      expect(actor.system.attacks, "au moins une attaque").to.have.length.greaterThan(0);
      expect(actor.system.attacks[0].name).to.equal("Cimeterre");
      const itemNames = actor.items.map((item) => item.name);
      expect(itemNames).to.include.members(["Cimeterre", "Dague", "Bourse de quelques pièces"]);
    });

    cy.openActorSheet(brigandId);
    sheetRoot().find(`nav.tabs [data-tab="stats"]`).click();
    sheetRoot().find(`section.tab[data-tab="stats"]`).should("have.class", "active");
    sheetRoot().find('button[data-action="rollAttack"][data-index="0"]').should("exist");

    // Onglet Butin.
    sheetRoot().find(`nav.tabs [data-tab="loot"]`).click();
    sheetRoot().find(`section.tab[data-tab="loot"]`).should("have.class", "active");
    sheetRoot().contains(".inventory-table td", "Cimeterre").should("exist");
    sheetRoot().contains(".inventory-table td", "Bourse de quelques pièces").should("exist");
  });
});

describe("PNJ à attaques multiples importé depuis le compendium — Ours brun", () => {
  let bearId;

  before(() => {
    cy.loginAsGM();
    waitForAdversairesImport();
    cy.window().then(async (win) => {
      const pack = win.game.packs.get("dnd-custom-ai.adversaires");
      const index = await pack.getIndex();
      const entry = [...index].find((candidate) => candidate.name === "Ours brun");
      const source = await pack.getDocument(entry._id);
      const imported = await win.Actor.create(win.JSON.parse(win.JSON.stringify(source.toObject())));
      bearId = imported.id;
      createdActorIds.push(bearId);
    });
  });

  beforeEach(() => cy.loginAsGM());

  let knownMessageCount = null;
  function resetMessageBaseline() {
    return cy.window().its("game.messages.size").then((size) => {
      knownMessageCount = size;
    });
  }
  function lastMessage() {
    return cy
      .window()
      .should((win) => {
        expect(win.game.messages.size, "un nouveau message doit être posté").to.be.greaterThan(knownMessageCount);
      })
      .then((win) => {
        knownMessageCount = win.game.messages.size;
        return win.game.messages.contents.at(-1);
      });
  }

  it("Morsure et Griffe se lancent indépendamment, avec leur propre butin (fourrure, griffes) (T-ADV-004)", () => {
    cy.window().then((win) => {
      const actor = win.game.actors.get(bearId);
      expect(actor.system.attacks.map((a) => a.name)).to.deep.equal(["Morsure", "Griffe"]);
    });

    cy.openActorSheet(bearId);
    sheetRoot().find(`nav.tabs [data-tab="stats"]`).click();

    resetMessageBaseline();
    sheetRoot().find('button[data-action="rollAttack"][data-index="0"]').click();
    lastMessage().then((message) => expect(message.flavor).to.include("Morsure"));

    resetMessageBaseline();
    sheetRoot().find('button[data-action="rollAttack"][data-index="1"]').click();
    lastMessage().then((message) => expect(message.flavor).to.include("Griffe"));

    sheetRoot().find(`nav.tabs [data-tab="loot"]`).click();
    sheetRoot().contains(".inventory-table td", "Fourrure d'ours").should("exist");
    sheetRoot().contains(".inventory-table td", "Griffes d'ours").should("exist");
  });
});
