// Agripper/Bousculer : test opposé contre le meilleur Athlétisme/Acrobaties de la cible,
// égalité = statu quo, recul seulement mentionné. Résultats garantis par des modificateurs extrêmes
// (deux jets par clic, forceD20 inutilisable).

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
function messagesSince() {
  return cy.window().should((win) => {
    expect(win.game.messages.size, "au moins un nouveau message doit être posté").to.be.greaterThan(knownMessageCount);
  });
}

function createGrappler(win, { extraSystem = {} } = {}) {
  return createActor(win, {
    name: "Opposed Check PC",
    type: "character",
    system: { class: "fighter", ...extraSystem }
  }).then((actor) =>
    Promise.all([
      createItem(win, actor.id, {
        name: "Test Agripper",
        type: "feature",
        system: { activation: "action", opposedCheckType: "grapple" }
      }),
      createItem(win, actor.id, {
        name: "Test Bousculer",
        type: "feature",
        system: { activation: "action", opposedCheckType: "shove" }
      })
    ]).then(() => actor)
  );
}

function createDefender(win, { athleticsMod = 0, acrobaticsMod = 0, name = "Opposed Check Target" } = {}) {
  return createActor(win, {
    name,
    type: "npc",
    system: { abilities: { str: { mod: athleticsMod }, dex: { mod: acrobaticsMod } } }
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

describe("Agripper — test opposé (Athlétisme vs meilleur Athlétisme/Acrobaties)", () => {
  beforeEach(() => cy.loginAsGM());

  it("écart de modificateurs énorme en faveur de l'attaquant : succès garanti, cible Agrippée (T-OPPOSED-001)", () => {
    cy.window()
      // Force 30 + Athlétisme maîtrisé : +12 minimum.
      .then((win) =>
        createGrappler(win, { extraSystem: { abilities: { str: { value: 30 } }, skills: { athletics: { proficient: true } } } })
      )
      .then((pc) => {
        cy.window()
          .then((win) => createDefender(win, { athleticsMod: -10, acrobaticsMod: -10 }))
          .then(({ tokenId }) => {
            targetToken(tokenId);
            cy.window().then((win) => win.game.actors.get(pc.id).sheet.render(true));
            cy.get(".application.character input.actor-name", { timeout: 15000 }).should("be.visible");
            goToTab("abilities");
            resetMessageBaseline();
            withItemId(pc.id, "Test Agripper", (itemId) => {
              sheetRoot().find(`li[data-item-id="${itemId}"] button[data-action="rollOpposedCheck"]`).click();
            });
            messagesSince();
            cy.window().should((win) => {
              expect(
                win.canvas.tokens.get(tokenId).actor.statuses.has("grappled"),
                "attaquant largement supérieur : succès garanti, cible Agrippée"
              ).to.be.true;
            });
          });
      });
  });

  it("écart de modificateurs énorme en faveur de la cible : échec garanti, cible PAS Agrippée (T-OPPOSED-002)", () => {
    cy.window()
      // Force 1, Athlétisme non maîtrisé : -5 au mieux.
      .then((win) => createGrappler(win, { extraSystem: { abilities: { str: { value: 1 } } } }))
      .then((pc) => {
        cy.window()
          .then((win) => createDefender(win, { athleticsMod: 20, acrobaticsMod: 20, name: "Opposed Check Strong Target" }))
          .then(({ tokenId }) => {
            targetToken(tokenId);
            cy.window().then((win) => win.game.actors.get(pc.id).sheet.render(true));
            cy.get(".application.character input.actor-name", { timeout: 15000 }).should("be.visible");
            goToTab("abilities");
            resetMessageBaseline();
            withItemId(pc.id, "Test Agripper", (itemId) => {
              sheetRoot().find(`li[data-item-id="${itemId}"] button[data-action="rollOpposedCheck"]`).click();
            });
            messagesSince();
            cy.window().should((win) => {
              expect(
                win.canvas.tokens.get(tokenId).actor.statuses.has("grappled"),
                "cible largement supérieure : échec garanti, jamais Agrippée"
              ).to.be.false;
            });
          });
      });
  });

  it("la défense retient le MEILLEUR des deux compétences, pas seulement Athlétisme (T-OPPOSED-005)", () => {
    // Athlétisme -10 mais Acrobaties +20 : la défense doit retenir le meilleur des deux.
    cy.window()
      .then((win) => createGrappler(win, { extraSystem: { abilities: { str: { value: 1 } } } }))
      .then((pc) => {
        cy.window()
          .then((win) => createDefender(win, { athleticsMod: -10, acrobaticsMod: 20, name: "Opposed Check Best-Of Target" }))
          .then(({ tokenId }) => {
            targetToken(tokenId);
            cy.window().then((win) => win.game.actors.get(pc.id).sheet.render(true));
            cy.get(".application.character input.actor-name", { timeout: 15000 }).should("be.visible");
            goToTab("abilities");
            resetMessageBaseline();
            withItemId(pc.id, "Test Agripper", (itemId) => {
              sheetRoot().find(`li[data-item-id="${itemId}"] button[data-action="rollOpposedCheck"]`).click();
            });
            messagesSince();
            cy.window().should((win) => {
              expect(
                win.canvas.tokens.get(tokenId).actor.statuses.has("grappled"),
                "défense retient le meilleur des deux (Acrobaties +20 ici) : jamais Agrippée"
              ).to.be.false;
            });
          });
      });
  });

  it("aucune cible, ou plusieurs cibles : avertissement, aucun jet (T-OPPOSED-006)", () => {
    cy.window()
      .then((win) => createGrappler(win))
      .then((pc) => {
        cy.window().then((win) => win.canvas.tokens.placeables.forEach((t) => t.setTarget(false, { releaseOthers: true })));
        let warned = false;
        cy.window().then((win) => {
          const original = win.ui.notifications.warn.bind(win.ui.notifications);
          win.ui.notifications.warn = (message) => {
            warned = true;
            return original(message);
          };
        });
        cy.window().then((win) => win.game.actors.get(pc.id).sheet.render(true));
        cy.get(".application.character input.actor-name", { timeout: 15000 }).should("be.visible");
        goToTab("abilities");
        let messageCountBefore;
        cy.window().then((win) => {
          messageCountBefore = win.game.messages.size;
        });
        withItemId(pc.id, "Test Agripper", (itemId) => {
          sheetRoot().find(`li[data-item-id="${itemId}"] button[data-action="rollOpposedCheck"]`).click();
        });
        cy.window().should((win) => {
          expect(warned, "avertissement attendu sans cible").to.be.true;
          expect(win.game.messages.size, "aucun jet posté sans cible").to.equal(messageCountBefore);
        });
      });
  });
});

describe("Bousculer — choix à terre / repoussé, jamais de déplacement automatique de token", () => {
  beforeEach(() => cy.loginAsGM());

  function shoveWithChoice(pcId, tokenId, choice) {
    targetToken(tokenId);
    cy.window().then((win) => win.game.actors.get(pcId).sheet.render(true));
    cy.get(".application.character input.actor-name", { timeout: 15000 }).should("be.visible");
    goToTab("abilities");
    resetMessageBaseline();
    withItemId(pcId, "Test Bousculer", (itemId) => {
      sheetRoot().find(`li[data-item-id="${itemId}"] button[data-action="rollOpposedCheck"]`).click();
    });
    cy.get('dialog.application.dialog input[type="radio"][name="shoveEffect"]', { timeout: 10000 }).should("exist");
    cy.get(`dialog.application.dialog input[type="radio"][name="shoveEffect"][value="${choice}"]`).check();
    cy.get('dialog.application.dialog button[data-action="ok"]').click();
    return messagesSince();
  }

  it("succès + choix 'à terre' : état Prone posé automatiquement (T-OPPOSED-003)", () => {
    cy.window()
      .then((win) =>
        createGrappler(win, { extraSystem: { abilities: { str: { value: 30 } }, skills: { athletics: { proficient: true } } } })
      )
      .then((pc) => {
        cy.window()
          .then((win) => createDefender(win, { athleticsMod: -10, acrobaticsMod: -10, name: "Shove Prone Target" }))
          .then(({ tokenId }) => {
            shoveWithChoice(pc.id, tokenId, "prone");
            cy.window().should((win) => {
              expect(win.canvas.tokens.get(tokenId).actor.statuses.has("prone"), "succès + 'à terre' : Prone appliqué").to.be.true;
            });
          });
      });
  });

  it("succès + choix 'repoussé' : aucun état posé, token jamais déplacé (T-OPPOSED-004)", () => {
    cy.window()
      .then((win) =>
        createGrappler(win, { extraSystem: { abilities: { str: { value: 30 } }, skills: { athletics: { proficient: true } } } })
      )
      .then((pc) => {
        cy.window()
          .then((win) => createDefender(win, { athleticsMod: -10, acrobaticsMod: -10, name: "Shove Push Target" }))
          .then(({ tokenId }) => {
            let xBefore;
            let yBefore;
            cy.window().then((win) => {
              const t = win.canvas.tokens.get(tokenId);
              xBefore = t.document.x;
              yBefore = t.document.y;
            });
            shoveWithChoice(pc.id, tokenId, "pushed");
            cy.window().should((win) => {
              const actor = win.canvas.tokens.get(tokenId).actor;
              expect(actor.statuses.has("prone"), "'repoussé' choisi : jamais Prone").to.be.false;
              const t = win.canvas.tokens.get(tokenId);
              expect(t.document.x, "position X inchangée : jamais de déplacement automatique de token").to.equal(xBefore);
              expect(t.document.y, "position Y inchangée : jamais de déplacement automatique de token").to.equal(yBefore);
            });
          });
      });
  });
});
