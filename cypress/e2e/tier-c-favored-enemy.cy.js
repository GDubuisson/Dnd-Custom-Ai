// Ennemi juré : choix définitif d'un type de créature, avantage en Survie et aux tests
// d'Intelligence contre une cible ciblée de ce type.

const createdActorIds = [];
const createdSceneItemIds = [];

function sheetRoot() {
  return cy.get(".application.character");
}

function goToTab(tabId) {
  sheetRoot().find(`nav.tabs [data-tab="${tabId}"]`).click();
  sheetRoot().find(`section.tab[data-tab="${tabId}"]`).should("have.class", "active");
}

function createActor(win, data) {
  return win.Actor.create(win.JSON.parse(win.JSON.stringify(data))).then((actor) => {
    createdActorIds.push(actor.id);
    return actor;
  });
}

function createItem(win, actorId, data) {
  return win.game.actors.get(actorId).createEmbeddedDocuments("Item", [win.JSON.parse(win.JSON.stringify(data))]);
}

function createNpcWithToken(win, { name, creatureType }) {
  return win.Actor.create(win.JSON.parse(win.JSON.stringify({ name, type: "npc", system: { creatureType } }))).then(
    (actor) =>
      actor
        .getTokenDocument(win.JSON.parse(win.JSON.stringify({ x: 450, y: 450 })))
        .then((tokenDoc) =>
          win.canvas.scene
            .createEmbeddedDocuments("Token", [win.JSON.parse(win.JSON.stringify(tokenDoc.toObject()))])
            .then((tokens) => ({ actorId: actor.id, tokenId: tokens[0].id }))
        )
  );
}

function targetToken(tokenId) {
  return cy.window().then((win) => win.canvas.tokens.get(tokenId).setTarget(true, { releaseOthers: true }));
}

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
      const message = win.game.messages.contents.at(-1);
      return { formula: (message.rolls?.[0]?.formula ?? "").replace(/\s+/g, "") };
    });
}

after(() => {
  cy.loginAsGM();
  cy.window().then((win) => {
    const cleanup = [win.Actor.deleteDocuments(createdActorIds)];
    if (createdSceneItemIds.length) cleanup.push(win.canvas.scene.deleteEmbeddedDocuments("Token", createdSceneItemIds));
    return Promise.all(cleanup);
  });
});

describe("Ennemi juré — choix de type, avantage Survie/Intelligence contre la cible ciblée", () => {
  let rangerId;
  let beastId;
  let beastTokenId;
  let humanoidId;
  let humanoidTokenId;

  before(() => {
    cy.loginAsGM();
    cy.window()
      .then((win) => createActor(win, { name: "Favored Enemy Ranger", type: "character", system: { class: "ranger" } }))
      .then((actor) => {
        rangerId = actor.id;
        return cy.window().then((win) =>
          createItem(win, rangerId, {
            name: "Test Ennemi juré",
            type: "feature",
            system: { grantsChoice: "favoredEnemyType" }
          })
        );
      });
    cy.window()
      .then((win) => createNpcWithToken(win, { name: "Test Favored Beast", creatureType: "beast" }))
      .then(({ actorId, tokenId }) => {
        beastId = actorId;
        beastTokenId = tokenId;
        createdActorIds.push(actorId);
        createdSceneItemIds.push(tokenId);
      });
    cy.window()
      .then((win) => createNpcWithToken(win, { name: "Test Non-Favored Humanoid", creatureType: "humanoid" }))
      .then(({ actorId, tokenId }) => {
        humanoidId = actorId;
        humanoidTokenId = tokenId;
        createdActorIds.push(actorId);
        createdSceneItemIds.push(tokenId);
      });

    // cy.then() attend la création des Actors avant de lire rangerId ; choix du type « beast ».
    cy.then(() => cy.openActorSheet(rangerId));
    goToTab("abilities");
    cy.window().then((win) => {
      const item = win.game.actors.get(rangerId).items.find((i) => i.name === "Test Ennemi juré");
      cy.get(`li[data-item-id="${item.id}"] button[data-action="chooseFeatureOption"]`).click();
    });
    cy.get("dialog.application.dialog", { timeout: 10000 }).should("exist");
    cy.get('dialog.application.dialog input[type="radio"][name="chosenOption"][value="beast"]').check();
    cy.get("dialog.application.dialog button[data-action=\"ok\"]").click();
    cy.window().should((win) => {
      expect(win.game.actors.get(rangerId).system.combat.favoredEnemyType, "type choisi persisté").to.equal("beast");
    });
    cy.window().then((win) => win.game.actors.get(rangerId).sheet.close());
  });

  beforeEach(() => cy.loginAsGM());

  it("cible du type favori ciblée : avantage à Survie ET à Intelligence (T-TIERC-FAVORED-001)", () => {
    targetToken(beastTokenId);
    cy.openActorSheet(rangerId);
    goToTab("stats");

    resetMessageBaseline();
    sheetRoot().find('button[data-action="rollSkill"][data-key="survival"]').click();
    lastMessage().then((roll) => {
      expect(roll.formula, "avantage à Survie contre le type favori ciblé").to.include("2d20kh1");
    });

    resetMessageBaseline();
    sheetRoot().find('button[data-action="rollAbility"][data-key="int"]').click();
    lastMessage().then((roll) => {
      expect(roll.formula, "avantage à Intelligence contre le type favori ciblé").to.include("2d20kh1");
    });
  });

  it("cible d'un AUTRE type ciblée : aucun avantage (T-TIERC-FAVORED-002)", () => {
    targetToken(humanoidTokenId);
    cy.openActorSheet(rangerId);
    goToTab("stats");

    resetMessageBaseline();
    sheetRoot().find('button[data-action="rollSkill"][data-key="survival"]').click();
    lastMessage().then((roll) => {
      expect(roll.formula, "aucun avantage contre un type différent").to.match(/^1d20/);
    });

    resetMessageBaseline();
    sheetRoot().find('button[data-action="rollAbility"][data-key="int"]').click();
    lastMessage().then((roll) => {
      expect(roll.formula, "aucun avantage contre un type différent").to.match(/^1d20/);
    });
  });

  it("aucune cible ciblée : aucun avantage, aucun test qui n'est pas Survie/Intelligence concerné (T-TIERC-FAVORED-003)", () => {
    cy.window().then((win) => win.game.user.targets.forEach((t) => t.setTarget(false)));
    cy.openActorSheet(rangerId);
    goToTab("stats");

    resetMessageBaseline();
    sheetRoot().find('button[data-action="rollSkill"][data-key="survival"]').click();
    lastMessage().then((roll) => {
      expect(roll.formula, "aucune cible : aucun avantage").to.match(/^1d20/);
    });

    // Perception ne bénéficie pas d'Ennemi juré.
    targetToken(beastTokenId);
    resetMessageBaseline();
    sheetRoot().find('button[data-action="rollSkill"][data-key="perception"]').click();
    lastMessage().then((roll) => {
      expect(roll.formula, "Perception jamais concernée par Ennemi juré").to.match(/^1d20/);
    });
  });
});
