// Suivi non bloquant de l'Action / Action bonus : rappel en combat, silence hors combat,
// exemption Attaque supplémentaire, libellé Action bonus.

const createdActorIds = [];
const createdCombatIds = [];
const createdSceneItemIds = [];

const MAIN_HAND = 0;

function sheetRoot() {
  return cy.get(".application.character");
}

function goToTab(tabId) {
  sheetRoot().find(`nav.tabs [data-tab="${tabId}"]`).click();
  sheetRoot().find(`section.tab[data-tab="${tabId}"]`).should("have.class", "active");
}

function equipmentSlotEl(index) {
  return sheetRoot().find(".equipment-slot").eq(index);
}

function updateActor(win, actor, data, options = {}) {
  return actor.update(win.JSON.parse(win.JSON.stringify(data)), options);
}

function withItemId(actorId, itemName, callback) {
  return cy
    .window()
    .then((win) => {
      const item = win.game.actors.get(actorId).items.find((candidate) => candidate.name === itemName);
      expect(item, `Item '${itemName}' introuvable sur l'Actor`).to.exist;
      return item.id;
    })
    .then(callback);
}

function grantCompendiumItem(win, actorId, packName, itemName) {
  const pack = win.game.packs.get(`dnd-custom-ai.${packName}`);
  return pack.getIndex().then(() => {
    const entry = [...pack.index].find((candidate) => candidate.name === itemName);
    expect(entry, `Item '${itemName}' introuvable dans le compendium ${packName}`).to.exist;
    return pack.getDocument(entry._id).then((doc) =>
      win.game.actors.get(actorId).createEmbeddedDocuments("Item", [win.JSON.parse(win.JSON.stringify(doc.toObject()))])
    );
  });
}

function createTarget(name, ac) {
  let tokenId;
  cy.loginAsGM();
  return cy
    .window()
    .then((win) =>
      win.Actor.create(win.JSON.parse(win.JSON.stringify({ name, type: "npc", system: { attributes: { ac: { value: ac } } } })))
    )
    .then((actor) => {
      createdActorIds.push(actor.id);
      return cy.window().then((win) =>
        win.canvas.scene
          .createEmbeddedDocuments("Token", [win.JSON.parse(win.JSON.stringify({ actorId: actor.id, x: 200, y: 200 }))])
          .then((tokens) => {
            tokenId = tokens[0].id;
            createdSceneItemIds.push(tokenId);
            return tokenId;
          })
      );
    });
}

function targetToken(tokenId) {
  return cy.window().then((win) => win.canvas.tokens.get(tokenId).setTarget(true, { releaseOthers: true }));
}

// Le rappel suit le message du jet : chercher dans tous les nouveaux messages.
let knownMessageCount = null;
function resetMessageBaseline() {
  return cy.window().its("game.messages.size").then((size) => {
    knownMessageCount = size;
  });
}
function newMessages() {
  return cy.window().then((win) => win.game.messages.contents.slice(knownMessageCount));
}
function expectMessageContaining(expectedText) {
  return cy.window({ timeout: 10000 }).should((win) => {
    const messages = win.game.messages.contents.slice(knownMessageCount);
    const found = messages.some((message) => (message.content ?? "").includes(expectedText) || (message.flavor ?? "").includes(expectedText));
    expect(found, `un message contenant "${expectedText}" doit apparaître parmi ${messages.length} nouveau(x) message(s)`).to.be.true;
  });
}
// Texte de rappel attendu, construit depuis le libellé localisé.
function expectedActionEconomyReminder(name, activation) {
  return cy.window().then((win) =>
    win.game.i18n.format("DND_CUSTOM.Chat.ActionEconomyReminder", {
      name,
      action: win.game.i18n.localize(`DND_CUSTOM.Item.ActivationTypes.${activation}`)
    })
  );
}

function expectNoMessageContaining(unexpectedText) {
  return cy.wait(1000).then(() =>
    newMessages().then((messages) => {
      const found = messages.some((message) => (message.content ?? "").includes(unexpectedText) || (message.flavor ?? "").includes(unexpectedText));
      expect(found, `aucun message ne doit contenir "${unexpectedText}" (${messages.length} nouveau(x) message(s))`).to.be.false;
    })
  );
}

let fighterId;
let extraAttackFighterId;
let outOfCombatFighterId;

before(() => {
  cy.loginAsPlayer();

  cy.createReadyCharacter({
    name: "Action Economy Fighter",
    origin: "fleuraine",
    classKey: "fighter",
    skills: ["athletics", "intimidation"]
  }).then((id) => {
    fighterId = id;
    createdActorIds.push(id);
  });

  cy.createReadyCharacter({
    name: "Action Economy Extra Attack Fighter",
    origin: "fleuraine",
    classKey: "fighter",
    skills: ["athletics", "intimidation"]
  }).then((id) => {
    extraAttackFighterId = id;
    createdActorIds.push(id);
    cy.window().then((win) => grantCompendiumItem(win, id, "capacites", "Attaque supplémentaire (Guerrier)"));
  });

  cy.createReadyCharacter({
    name: "Action Economy Out Of Combat Fighter",
    origin: "fleuraine",
    classKey: "fighter",
    skills: ["athletics", "intimidation"]
  }).then((id) => {
    outOfCombatFighterId = id;
    createdActorIds.push(id);
  });

  // Seuls fighterId et extraAttackFighterId sont Combattants.
  cy.loginAsGM();
  cy.window().then((win) =>
    win.Combat.create(win.JSON.parse(win.JSON.stringify({ scene: win.canvas.scene.id, active: true }))).then((combat) => {
      createdCombatIds.push(combat.id);
      return combat.createEmbeddedDocuments(
        "Combatant",
        win.JSON.parse(
          win.JSON.stringify([
            { actorId: fighterId, initiative: 10 },
            { actorId: extraAttackFighterId, initiative: 5 }
          ])
        )
      );
    })
  );
});

after(() => {
  cy.loginAsGM();
  cy.window().then((win) => {
    const cleanup = [win.Actor.deleteDocuments(createdActorIds)];
    if (createdCombatIds.length) cleanup.push(win.Combat.deleteDocuments(createdCombatIds));
    if (createdSceneItemIds.length) cleanup.push(win.canvas.scene.deleteEmbeddedDocuments("Token", createdSceneItemIds));
    return Promise.all(cleanup);
  });
});

describe("Suivi de l'action du tour — jets d'attaque à l'arme", () => {
  beforeEach(() => {
    cy.loginAsPlayer();
  });

  it("premier jet d'attaque du tour : aucun rappel, Action marquée consommée", () => {
    createTarget("Action Economy Target 1", 5).then((tokenId) => {
      cy.loginAsPlayer();
      cy.window().then((win) =>
        updateActor(win, win.game.actors.get(fighterId), { "system.combat.actionAvailable": true }, { dndCustomWizard: true })
      );
      cy.openActorSheet(fighterId);
      goToTab("equipment");
      resetMessageBaseline();
      targetToken(tokenId);
      equipmentSlotEl(MAIN_HAND).find(".equipment-roll-btn-attack").click();

      // Message et `actionAvailable` vérifiés dans le même `should()` (update postérieur).
      cy.window({ timeout: 10000 }).should((win) => {
        expect(win.game.messages.size, "le jet d'attaque poste un message").to.be.greaterThan(knownMessageCount);
        expect(win.game.messages.size - knownMessageCount, "un seul message (le jet), aucun rappel").to.equal(1);
        expect(win.game.actors.get(fighterId).system.combat.actionAvailable, "Action désormais consommée").to.be.false;
      });
    });
  });

  it("second jet d'attaque du même tour : rappel de chat non-bloquant, le jet se fait quand même", () => {
    createTarget("Action Economy Target 2", 5).then((tokenId) => {
      cy.loginAsPlayer();
      cy.window().then((win) =>
        updateActor(win, win.game.actors.get(fighterId), { "system.combat.actionAvailable": false }, { dndCustomWizard: true })
      );
      cy.openActorSheet(fighterId);
      goToTab("equipment");
      resetMessageBaseline();
      targetToken(tokenId);
      equipmentSlotEl(MAIN_HAND).find(".equipment-roll-btn-attack").click();

      expectedActionEconomyReminder("Action Economy Fighter", "action").then((expected) => expectMessageContaining(expected));
    });
  });

  it("Attaque supplémentaire : deux jets d'attaque consécutifs, aucun rappel", () => {
    createTarget("Action Economy Target 3", 5).then((tokenId) => {
      cy.loginAsPlayer();
      cy.window().then((win) =>
        updateActor(win, win.game.actors.get(extraAttackFighterId), { "system.combat.actionAvailable": true }, { dndCustomWizard: true })
      );
      cy.openActorSheet(extraAttackFighterId);
      goToTab("equipment");
      targetToken(tokenId);

      resetMessageBaseline();
      equipmentSlotEl(MAIN_HAND).find(".equipment-roll-btn-attack").click();
      cy.window({ timeout: 10000 }).should((win) => {
        expect(win.game.messages.size).to.be.greaterThan(knownMessageCount);
        expect(win.game.actors.get(extraAttackFighterId).system.combat.actionAvailable, "Action consommée dès le 1er jet").to.be.false;
      });

      resetMessageBaseline();
      equipmentSlotEl(MAIN_HAND).find(".equipment-roll-btn-attack").click();
      cy.window({ timeout: 10000 }).should((win) => {
        expect(win.game.messages.size, "le 2e jet d'attaque poste bien son propre message").to.be.greaterThan(knownMessageCount);
      });
      expectedActionEconomyReminder("Action Economy Extra Attack Fighter", "action").then((unexpected) =>
        expectNoMessageContaining(unexpected)
      );
    });
  });
});

describe("Hors combat — aucun suivi, aucun rappel", () => {
  beforeEach(() => {
    cy.loginAsPlayer();
  });

  it("jet d'attaque à l'arme hors combat : aucun rappel, Action jamais consommée", () => {
    createTarget("Action Economy Target Out Of Combat", 5).then((tokenId) => {
      cy.loginAsPlayer();
      cy.window().then((win) =>
        updateActor(
          win,
          win.game.actors.get(outOfCombatFighterId),
          { "system.combat.actionAvailable": false },
          { dndCustomWizard: true }
        )
      );
      cy.openActorSheet(outOfCombatFighterId);
      goToTab("equipment");
      resetMessageBaseline();
      targetToken(tokenId);
      equipmentSlotEl(MAIN_HAND).find(".equipment-roll-btn-attack").click();

      cy.window({ timeout: 10000 })
        .should((win) => {
          expect(win.game.messages.size, "le jet d'attaque poste un message").to.be.greaterThan(knownMessageCount);
        })
        .then((win) => {
          expect(win.game.messages.size - knownMessageCount, "un seul message (le jet), aucun rappel hors combat").to.equal(1);
          expect(
            win.game.actors.get(outOfCombatFighterId).system.combat.actionAvailable,
            "hors combat, la valeur n'est jamais touchée par ce suivi"
          ).to.be.false;
        });
    });
  });
});

describe("Suivi de l'Action bonus du tour — Capacité 'Second souffle' (Guerrier)", () => {
  beforeEach(() => {
    cy.loginAsPlayer();
  });

  it("Action bonus déjà consommée : rappel de chat au libellé 'Action bonus', la Capacité s'utilise quand même", () => {
    cy.window().then((win) =>
      updateActor(win, win.game.actors.get(fighterId), { "system.combat.bonusActionAvailable": false }, { dndCustomWizard: true })
    );
    cy.openActorSheet(fighterId);
    goToTab("abilities");

    withItemId(fighterId, "Second souffle", (itemId) => {
      // Second souffle mis à jour en session MJ (`activation: "bonusAction"`, charge rechargée).
      cy.loginAsGM();
      cy.window().then((win) =>
        updateActor(win, win.game.actors.get(fighterId).items.get(itemId), {
          "system.activation": "bonusAction",
          "system.uses.value": 1
        })
      );
      cy.loginAsPlayer();
      cy.openActorSheet(fighterId);
      goToTab("abilities");

      resetMessageBaseline();
      cy.get(`li[data-item-id="${itemId}"] button[data-action="rollFeature"]`).click();

      expectedActionEconomyReminder("Action Economy Fighter", "bonusAction").then((expected) =>
        expectMessageContaining(expected)
      );
    });
  });
});
