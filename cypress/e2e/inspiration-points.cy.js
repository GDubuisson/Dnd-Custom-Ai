// Points d'inspiration (PI, règle maison — 2026-08-25, sur demande explicite de l'utilisateur) :
// ressource libre accordée manuellement par le MJ (system.attributes.inspirationPoints,
// CharacterData uniquement), dépensée pour relancer intégralement un test de caractéristique ou
// de compétence déjà lancé. Contrairement à Chanceux/Chance du Fiélon/Indomptable
// (cf. tier-a-mechanics.cy.js) qui gardent le message d'origine et postent une relance à la
// suite, ce mécanisme SUPPRIME le message d'origine du chat (`message.delete()`) — seul le
// nouveau jet reste visible, résultat toujours conservé.

const createdActorIds = [];

function sheetRoot() {
  return cy.get(".application.character");
}

function goToTab(tabId) {
  sheetRoot().find(`nav.tabs [data-tab="${tabId}"]`).click();
  sheetRoot().find(`section.tab[data-tab="${tabId}"]`).should("have.class", "active");
}

function updateActor(win, actor, data, options = {}) {
  return actor.update(win.JSON.parse(win.JSON.stringify(data)), options);
}

function openChatTab() {
  return cy.window().then((win) => win.document.querySelector('#sidebar-tabs [data-tab="chat"]')?.click());
}

after(() => {
  cy.loginAsGM();
  cy.window().then((win) => win.Actor.deleteDocuments(createdActorIds));
});

describe("Points d'inspiration — jet de caractéristique", () => {
  let charId;

  before(() => {
    cy.loginAsPlayer();
    cy.createReadyCharacter({ name: "Inspired Ability Roller", origin: "fleuraine", classKey: "fighter", skills: ["athletics", "intimidation"] }).then(
      (id) => {
        charId = id;
        createdActorIds.push(id);
      }
    );
    cy.window().then((win) => updateActor(win, win.game.actors.get(charId), { "system.attributes.inspirationPoints": 2 }));
  });

  beforeEach(() => cy.loginAsPlayer());

  it("remplace le jet d'origine, décrémente le compteur, conserve le nouveau résultat (T-INSP-001)", () => {
    cy.openActorSheet(charId);
    goToTab("stats");

    let originalMessageId;
    let originalFlavor;
    cy.window().its("game.messages.size").then((sizeBefore) => {
      sheetRoot().find('button[data-action="rollAbility"][data-key="str"]').click();
      cy.window().should((win) => {
        expect(win.game.messages.size, "le jet initial doit être posté").to.equal(sizeBefore + 1);
      });
    });
    cy.window().then((win) => {
      const original = win.game.messages.contents.at(-1);
      originalMessageId = original.id;
      originalFlavor = original.flavor;
    });

    openChatTab();
    cy.get(".chat-message", { timeout: 10000 }).last().find(".dnd-spend-inspiration-btn").should("be.visible").and("contain.text", "2").click();

    cy.window().should((win) => {
      expect(win.game.messages.get(originalMessageId), "le message d'origine doit disparaître du chat").to.equal(undefined);
      const actor = win.game.actors.get(charId);
      expect(actor.system.attributes.inspirationPoints, "un point d'inspiration consommé").to.equal(1);
    });
    cy.window().then((win) => {
      const replacement = win.game.messages.contents.at(-1);
      expect(replacement.id, "un nouveau message distinct de l'ancien").to.not.equal(originalMessageId);
      const expectedFlavor = win.game.i18n.format("DND_CUSTOM.Chat.InspirationReroll", {
        name: win.game.actors.get(charId).name,
        flavor: originalFlavor
      });
      expect(replacement.flavor).to.equal(expectedFlavor);
    });
  });
});

describe("Points d'inspiration — jet de compétence", () => {
  let charId;

  before(() => {
    cy.loginAsPlayer();
    cy.createReadyCharacter({ name: "Inspired Skill Roller", origin: "fleuraine", classKey: "fighter", skills: ["athletics", "intimidation"] }).then(
      (id) => {
        charId = id;
        createdActorIds.push(id);
      }
    );
    cy.window().then((win) => updateActor(win, win.game.actors.get(charId), { "system.attributes.inspirationPoints": 1 }));
  });

  beforeEach(() => cy.loginAsPlayer());

  it("le bouton apparaît aussi sur un test de compétence, jusqu'à épuisement (T-INSP-002)", () => {
    cy.openActorSheet(charId);
    goToTab("stats");

    let originalMessageId;
    cy.window().its("game.messages.size").then((sizeBefore) => {
      sheetRoot().find('button[data-action="rollSkill"][data-key="athletics"]').click();
      cy.window().should((win) => {
        expect(win.game.messages.size).to.equal(sizeBefore + 1);
      });
    });
    cy.window().then((win) => {
      originalMessageId = win.game.messages.contents.at(-1).id;
    });

    openChatTab();
    cy.get(".chat-message", { timeout: 10000 }).last().find(".dnd-spend-inspiration-btn").should("be.visible").click();

    cy.window().should((win) => {
      expect(win.game.messages.get(originalMessageId)).to.equal(undefined);
      expect(win.game.actors.get(charId).system.attributes.inspirationPoints, "dernier point consommé").to.equal(0);
    });

    // Plus aucun point : un second jet ne doit plus proposer le bouton.
    cy.window().then((win) => win.game.actors.get(charId).sheet.render(true));
    goToTab("stats");
    cy.window().its("game.messages.size").then((sizeBefore) => {
      sheetRoot().find('button[data-action="rollSkill"][data-key="athletics"]').click();
      cy.window().should((win) => {
        expect(win.game.messages.size).to.equal(sizeBefore + 1);
      });
    });
    openChatTab();
    cy.get(".chat-message", { timeout: 10000 }).last().find(".dnd-spend-inspiration-btn").should("not.exist");
  });
});

describe("Points d'inspiration — hors-scope (sauvegarde, aucun point)", () => {
  let charId;

  before(() => {
    cy.loginAsPlayer();
    cy.createReadyCharacter({ name: "No Inspiration Saver", origin: "fleuraine", classKey: "fighter", skills: ["athletics", "intimidation"] }).then(
      (id) => {
        charId = id;
        createdActorIds.push(id);
      }
    );
    // inspirationPoints reste à sa valeur par défaut (0), aucun octroi du MJ.
  });

  beforeEach(() => cy.loginAsPlayer());

  it("aucun bouton sur un jet de sauvegarde, même avec des points disponibles (T-INSP-003)", () => {
    cy.window().then((win) => updateActor(win, win.game.actors.get(charId), { "system.attributes.inspirationPoints": 3 }));
    cy.openActorSheet(charId);
    goToTab("stats");

    cy.window().its("game.messages.size").then((sizeBefore) => {
      sheetRoot().find('button[data-action="rollSave"][data-key="wis"]').click();
      cy.window().should((win) => {
        expect(win.game.messages.size).to.equal(sizeBefore + 1);
      });
    });
    openChatTab();
    cy.get(".chat-message", { timeout: 10000 }).last().find(".dnd-spend-inspiration-btn").should("not.exist");
  });

  it("aucun bouton sur un test de caractéristique sans point d'inspiration (T-INSP-004)", () => {
    cy.window().then((win) => updateActor(win, win.game.actors.get(charId), { "system.attributes.inspirationPoints": 0 }));
    cy.openActorSheet(charId);
    goToTab("stats");

    cy.window().its("game.messages.size").then((sizeBefore) => {
      sheetRoot().find('button[data-action="rollAbility"][data-key="dex"]').click();
      cy.window().should((win) => {
        expect(win.game.messages.size).to.equal(sizeBefore + 1);
      });
    });
    openChatTab();
    cy.get(".chat-message", { timeout: 10000 }).last().find(".dnd-spend-inspiration-btn").should("not.exist");
  });
});
