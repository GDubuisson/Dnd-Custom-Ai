// Rappel d'attaque d'opportunité quand un PNJ hostile quitte l'allonge (1,50 m) d'un PJ ayant sa réaction.
// Grille de test : 100 px par case de 1,5 m (1 px = 0,015 m).

const createdActorIds = [];
const createdCombatIds = [];
const createdSceneItemIds = [];

let fighterId;
let fighterTokenId;
let originalGrid;

function updateActor(win, actor, data, options = {}) {
  return actor.update(win.JSON.parse(win.JSON.stringify(data)), options);
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
      return { content: win.game.messages.contents.at(-1).content };
    });
}
function expectNoNewMessage() {
  return cy.wait(1500).then(() =>
    cy.window().then((win) => {
      expect(win.game.messages.size, "aucun nouveau message").to.equal(knownMessageCount);
    })
  );
}

before(() => {
  cy.loginAsGM();
  // Grille déterministe, restaurée en after() (scène partagée).
  cy.window().then((win) => {
    originalGrid = { distance: win.canvas.scene.grid.distance, units: win.canvas.scene.grid.units, size: win.canvas.scene.grid.size };
    return win.canvas.scene.update(win.JSON.parse(win.JSON.stringify({ grid: { distance: 1.5, units: "m", size: 100 } })));
  });

  cy.loginAsPlayer();
  cy.createReadyCharacter({ name: "Opportunity Fighter", origin: "fleuraine", classKey: "fighter", skills: ["athletics", "intimidation"] }).then(
    (id) => {
      fighterId = id;
      createdActorIds.push(id);
    }
  );
  cy.window().then((win) => win.game.actors.get(fighterId)?.sheet?.close());

  cy.loginAsGM();
  cy.window()
    .then((win) => createToken(win, fighterId, 1000, 1000))
    .then((tokenId) => {
      fighterTokenId = tokenId;
    });
});

after(() => {
  cy.loginAsGM();
  cy.window().then((win) => {
    const cleanup = [
      win.Actor.deleteDocuments(createdActorIds),
      win.canvas.scene.update(win.JSON.parse(win.JSON.stringify({ grid: originalGrid })))
    ];
    if (createdCombatIds.length) cleanup.push(win.Combat.deleteDocuments(createdCombatIds));
    if (createdSceneItemIds.length) cleanup.push(win.canvas.scene.deleteEmbeddedDocuments("Token", createdSceneItemIds));
    return Promise.all(cleanup);
  });
});

describe("Attaque d'opportunité — rappel automatique au déplacement d'un PNJ hostile", () => {
  let preyActorId;
  let preyTokenId;

  beforeEach(() => {
    cy.loginAsGM();
  });

  // PNJ hostile neuf par test, décalé de `initialOffsetPx` en x (60px = 0,9 m).
  function setupPreyAndCombat(initialOffsetPx) {
    return cy
      .window()
      .then((win) => win.Actor.create(win.JSON.parse(win.JSON.stringify({ name: "Opportunity Prey", type: "npc", system: {} }))))
      .then((actor) => {
        preyActorId = actor.id;
        createdActorIds.push(actor.id);
        return cy.window().then((win) => createToken(win, preyActorId, 1000 + initialOffsetPx, 1000));
      })
      .then((tokenId) => {
        preyTokenId = tokenId;
        return cy
          .window()
          .then((win) => win.canvas.tokens.get(preyTokenId).document.update(win.JSON.parse(win.JSON.stringify({ disposition: win.CONST.TOKEN_DISPOSITIONS.HOSTILE }))));
      })
      .then(() =>
        cy.window().then((win) =>
          win.Combat.create(win.JSON.parse(win.JSON.stringify({ scene: win.canvas.scene.id, active: true }))).then((combat) => {
            createdCombatIds.push(combat.id);
            return combat.createEmbeddedDocuments(
              "Combatant",
              win.JSON.parse(
                win.JSON.stringify([
                  { actorId: fighterId, tokenId: fighterTokenId, initiative: 10 },
                  { actorId: preyActorId, tokenId: preyTokenId, initiative: 5 }
                ])
              )
            );
          })
        )
      );
  }

  it("le PNJ hostile quitte la portée de mêlée (0,9 m -> 4,5 m) : message de rappel posté", () => {
    setupPreyAndCombat(60).then(() => {
      cy.window().then((win) =>
        updateActor(win, win.game.actors.get(fighterId), { "system.combat.reactionAvailable": true }, { dndCustomWizard: true })
      );
      resetMessageBaseline();
      cy.window().then((win) => win.canvas.tokens.get(preyTokenId).document.update(win.JSON.parse(win.JSON.stringify({ x: 1300, y: 1000 }))));

      cy.window()
        .its("game.i18n")
        .then((i18n) => i18n.format("DND_CUSTOM.Chat.OpportunityAttackAvailable", { reactor: "Opportunity Fighter", mover: "Opportunity Prey" }))
        .then((expected) => {
          lastMessage().then((message) => {
            expect(message.content).to.include(expected);
          });
        });
    });
  });

  it("le PNJ hostile reste à portée (0,9 m -> 1,2 m) : aucun message", () => {
    setupPreyAndCombat(60).then(() => {
      resetMessageBaseline();
      cy.window().then((win) => win.canvas.tokens.get(preyTokenId).document.update(win.JSON.parse(win.JSON.stringify({ x: 1080, y: 1000 }))));
      expectNoNewMessage();
    });
  });

  it("réaction déjà consommée : aucun message même si le PNJ hostile quitte la portée", () => {
    setupPreyAndCombat(60).then(() => {
      cy.window().then((win) =>
        updateActor(win, win.game.actors.get(fighterId), { "system.combat.reactionAvailable": false }, { dndCustomWizard: true })
      );
      resetMessageBaseline();
      cy.window().then((win) => win.canvas.tokens.get(preyTokenId).document.update(win.JSON.parse(win.JSON.stringify({ x: 1300, y: 1000 }))));
      expectNoNewMessage();
    });
  });
});
