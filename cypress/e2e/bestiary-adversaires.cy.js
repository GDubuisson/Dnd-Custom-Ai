// Compendium « adversaires » (réservé au MJ) : bestiaire rangé par phase de campagne puis par milieu,
// monde scellé respecté en phase 0, attaques jouables et butin.

const createdActorIds = [];

function sheetRoot() {
  return cy.get(".application.npc");
}

// Attend la fin de l'import automatique ; ne jamais relancer l'import (doublons).
function waitForAdversairesImport() {
  return cy.waitForContentImport();
}

/** Chemin de dossiers d'un document de compendium, de la racine au dossier direct. */
function folderPath(pack, doc) {
  const names = [];
  let folderId = doc._source.folder;
  while (folderId) {
    const folder = pack.folders.get(folderId);
    names.unshift(folder.name);
    folderId = folder._source.folder;
  }
  return names;
}

after(() => {
  cy.loginAsGM();
  cy.window().then((win) => win.Actor.deleteDocuments(createdActorIds));
});

describe("Compendium \"Adversaires\" — présence et contenu", () => {
  beforeEach(() => cy.loginAsGM());

  it("contient exactement les créatures de world-items/npcs.json (T-ADV-001)", () => {
    waitForAdversairesImport();
    cy.readFile("world-items/npcs.json").then((npcs) => {
      cy.window().then(async (win) => {
        const index = await win.game.packs.get("dnd-custom-ai.adversaires").getIndex();
        const names = [...index].map((entry) => entry.name).sort();
        expect(names).to.deep.equal(npcs.map((npc) => npc.name).sort());
        // Humains et bêtes de la 1.3.0 toujours présents.
        expect(names).to.include.members(["Brigand", "Chevalier", "Passwacht", "Ours brun", "Loup"]);
      });
    });
  });

  it("monde scellé : en phase 0, hors du large, uniquement des humanoïdes et des bêtes (T-ADV-002)", () => {
    waitForAdversairesImport();
    cy.window().then(async (win) => {
      const docs = await win.game.packs.get("dnd-custom-ai.adversaires").getDocuments();
      for (const doc of docs) {
        const { phase, habitat } = doc.flags["dnd-custom-ai"] ?? {};
        if (phase !== 0 || habitat === "abyss") continue;
        expect(["humanoid", "beast"], `"${doc.name}" : ${doc.system.creatureType} en phase 0`).to.include(doc.system.creatureType);
      }
    });
  });

  it("range les créatures par phase puis par milieu (T-ADV-005)", () => {
    waitForAdversairesImport();
    cy.window().then(async (win) => {
      const pack = win.game.packs.get("dnd-custom-ai.adversaires");
      const byName = new Map((await pack.getDocuments()).map((doc) => [doc.name, doc]));
      // Libellés dans la langue du client MJ qui a lancé l'import.
      const label = (key) => win.game.i18n.localize(`DND_CUSTOM.${key}`);
      const phase0 = label("Bestiary.Phases.0");
      const phase1 = label("Bestiary.Phases.1");
      const logne = label("Bestiary.Habitats.siteLogne");
      const expected = {
        "Brigand": [phase0, label("Bestiary.Habitats.common")],
        "Passwacht": [phase0, label("Regions.altenmark")],
        "Kraken": [phase0, label("Bestiary.Habitats.abyss")],
        "Grand-loup de Logne": [phase0, logne],
        "Arbre éveillé": [phase1, logne],
        "Kraken (affaibli près des côtes)": [phase1, label("Bestiary.Habitats.coast")]
      };
      for (const [name, path] of Object.entries(expected)) {
        expect(byName.get(name), `"${name}" absent`).to.exist;
        expect(folderPath(pack, byName.get(name)), name).to.deep.equal(path);
      }
      // Aucune créature hors dossier.
      const unfiled = [...byName.values()].filter((doc) => !doc._source.folder).map((doc) => doc.name);
      expect(unfiled, "créatures sans dossier").to.deep.equal([]);
    });
  });
});

describe("Compendium \"Adversaires\" — invisible des joueurs", () => {
  it("un joueur ne voit ni le compendium ni ses dossiers (T-ADV-006)", () => {
    cy.loginAsPlayer();
    cy.window().then((win) => {
      const pack = win.game.packs.get("dnd-custom-ai.adversaires");
      expect(pack.visible, "compendium visible d'un joueur").to.equal(false);
      expect(pack.testUserPermission(win.game.user, "OBSERVER"), "droit d'observation d'un joueur").to.equal(false);
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
