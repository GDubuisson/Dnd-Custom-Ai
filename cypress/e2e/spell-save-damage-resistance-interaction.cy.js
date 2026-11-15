// Réduction de sauvegarde (halfOnSave) puis affinité de type cumulées, chacune arrondie séparément :
// floor(floor(montant × sauvegarde) × type).

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

function createToken(win, actorId, x, y) {
  return win.game.actors
    .get(actorId)
    .getTokenDocument(win.JSON.parse(win.JSON.stringify({ x, y })))
    .then((tokenDoc) =>
      win.canvas.scene
        .createEmbeddedDocuments("Token", [win.JSON.parse(win.JSON.stringify(tokenDoc.toObject()))])
        .then((tokens) => {
          createdSceneItemIds.push(tokens[0].id);
          return tokens[0].id;
        })
    );
}

function targetToken(tokenId) {
  return cy.window().then((win) => win.canvas.tokens.get(tokenId).setTarget(true, { releaseOthers: true }));
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
      return { id: message.id, total: message.rolls?.[0]?.total };
    });
}

// Lance le sort (sauvegarde forcée) puis son jet de dégâts.
function castSaveSpellAndRollDamage(casterId, itemName, targetTokenId, forcedFace) {
  targetToken(targetTokenId);
  cy.openActorSheet(casterId);
  goToTab("abilities");
  cy.forceD20(forcedFace);
  withItemId(casterId, itemName, (itemId) => {
    cy.get(`li[data-item-id="${itemId}"] button[data-action="castSpell"]`).click();
  });
  // Laisse #onCastSpell (asynchrone) terminer.
  cy.wait(1000);
  return withItemId(casterId, itemName, (itemId) => {
    resetMessageBaseline();
    cy.get(`li[data-item-id="${itemId}"] button[data-action="rollSpellDamage"]`).click();
    return lastMessage().then((roll) => {
      cy.window().then((win) => win.game.actors.get(casterId).sheet.close());
      return cy.wrap(roll);
    });
  });
}

function applyDamageFromMessage(messageId) {
  cy.window().then((win) => win.document.querySelector('#sidebar-tabs [data-tab="chat"]')?.click());
  cy.get(`[data-message-id="${messageId}"]`, { timeout: 10000 }).first().find("button.dnd-apply-damage-btn").click();
}

function createNpcTarget(win, { name, extraSystem = {} }) {
  return createActor(win, {
    name,
    type: "npc",
    system: { attributes: { hp: { value: 100, max: 100 } }, abilities: { dex: { mod: 0 } }, ...extraSystem }
  }).then((actor) => createToken(win, actor.id, 1000, 1000).then((tokenId) => ({ actorId: actor.id, tokenId })));
}

after(() => {
  cy.loginAsGM();
  cy.window().then((win) => {
    const cleanup = [win.Actor.deleteDocuments(createdActorIds)];
    if (createdSceneItemIds.length) cleanup.push(win.canvas.scene.deleteEmbeddedDocuments("Token", createdSceneItemIds));
    return Promise.all(cleanup);
  });
});

describe("Sort à sauvegarde (halfOnSave) + résistance/immunité de type — les 2 réductions se cumulent, arrondies séparément", () => {
  let casterId;

  before(() => {
    cy.loginAsGM();
    cy.window()
      .then((win) => createActor(win, { name: "Interaction Test Wizard", type: "character", system: { class: "wizard" } }))
      .then((actor) => {
        casterId = actor.id;
        return cy.window().then((win) =>
          createItem(win, casterId, {
            name: "Test Interaction Bolt",
            type: "spell",
            system: { classes: ["wizard"], level: 0, save: { ability: "dex", halfOnSave: true }, damage: { dice: "10", type: "fire" } }
          })
        );
      });
  });

  beforeEach(() => cy.loginAsGM());

  it("réussite de la sauvegarde + résistance au feu : les 2 réductions s'appliquent (pas une seule) (T-INTERACT-001)", () => {
    cy.window()
      .then((win) => createNpcTarget(win, { name: "Save+Resist Success Target", extraSystem: { damageResistances: ["fire"] } }))
      .then(({ tokenId }) => {
        castSaveSpellAndRollDamage(casterId, "Test Interaction Bolt", tokenId, 20).then((roll) => {
          applyDamageFromMessage(roll.id);
          cy.window().should((win) => {
            expect(
              win.canvas.tokens.get(tokenId).actor.system.attributes.hp.value,
              "réussite (moitié) PUIS résistance (moitié à nouveau) : arrondis séparés, pas une seule réduction de moitié"
            ).to.equal(100 - Math.floor(Math.floor(roll.total / 2) / 2));
          });
        });
      });
  });

  it("échec de la sauvegarde (dégâts pleins) + résistance au feu : seule la résistance réduit (T-INTERACT-002)", () => {
    cy.window()
      .then((win) => createNpcTarget(win, { name: "Save Fail+Resist Target", extraSystem: { damageResistances: ["fire"] } }))
      .then(({ tokenId }) => {
        castSaveSpellAndRollDamage(casterId, "Test Interaction Bolt", tokenId, 1).then((roll) => {
          applyDamageFromMessage(roll.id);
          cy.window().should((win) => {
            expect(
              win.canvas.tokens.get(tokenId).actor.system.attributes.hp.value,
              "échec : multiplicateur de sauvegarde à 1, seule la résistance de type réduit (moitié)"
            ).to.equal(100 - Math.floor(roll.total / 2));
          });
        });
      });
  });

  it("réussite de la sauvegarde + immunité au feu : aucun dégât (l'immunité reste prioritaire) (T-INTERACT-003)", () => {
    cy.window()
      .then((win) => createNpcTarget(win, { name: "Save+Immune Target", extraSystem: { damageImmunities: ["fire"] } }))
      .then(({ tokenId }) => {
        castSaveSpellAndRollDamage(casterId, "Test Interaction Bolt", tokenId, 20).then((roll) => {
          applyDamageFromMessage(roll.id);
          cy.window().should((win) => {
            expect(
              win.canvas.tokens.get(tokenId).actor.system.attributes.hp.value,
              "immunité au type : aucun dégât, quel que soit le résultat de la sauvegarde"
            ).to.equal(100);
          });
        });
      });
  });
});
