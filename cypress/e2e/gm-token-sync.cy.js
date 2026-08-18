// Couvre le point "Bugs de synchronisation" de ClaudeFiles/ANOMALIES_ACTIVES.md : un token de
// personnage joueur posé sur une scène AVANT que le correctif actorLink (dnd-custom-ai.js >
// preCreateActor/ensureCharacterTokensLinked) n'existe, et déjà désynchronisé (PV différents) à
// ce moment-là, reste `actorLink: false` pour toujours — la migration automatique refuse par
// sécurité de le relier de force. Seule la Macro "Resynchroniser un token"
// (scripts/helpers/token-sync.js > resyncControlledToken) permet ensuite au MJ de trancher.
//
// Reproduit ici directement en désynchronisant un token fraîchement posé (mêmes symptômes que le
// cas réel : `actorLink: false` + PV différents entre le token et la fiche `game.actors`), sans
// dépendre d'un monde ancien.

const createdActorIds = [];
const createdSceneItemIds = [];

function placeUnlinkedToken(actorId) {
  return cy.window().then((win) => {
    const actor = win.game.actors.get(actorId);
    return actor.getTokenDocument(win.JSON.parse(win.JSON.stringify({ x: 100, y: 100 }))).then((tokenDoc) => {
      const data = win.JSON.parse(win.JSON.stringify(tokenDoc.toObject()));
      data.actorLink = false;
      return win.canvas.scene.createEmbeddedDocuments("Token", [data]).then((tokens) => {
        const tokenId = tokens[0].id;
        createdSceneItemIds.push(tokenId);
        return tokenId;
      });
    });
  });
}

function controlToken(tokenId) {
  return cy.window().then((win) => win.canvas.tokens.get(tokenId).control({ releaseOthers: true }));
}

after(() => {
  cy.loginAsGM();
  cy.window().then((win) => {
    const cleanup = [win.Actor.deleteDocuments(createdActorIds)];
    if (createdSceneItemIds.length) cleanup.push(win.canvas.scene.deleteEmbeddedDocuments("Token", createdSceneItemIds));
    return Promise.all(cleanup);
  });
});

describe("Macro MJ « Resynchroniser un token »", () => {
  it("token désynchronisé — garder les PV du token (T-SYNC-001)", () => {
    cy.loginAsPlayer();
    cy.createReadyCharacter({
      name: "Sync Token Wins Fighter",
      origin: "ravenmoor",
      classKey: "fighter",
      skills: ["athletics", "intimidation"]
    }).then((actorId) => {
      createdActorIds.push(actorId);
      cy.loginAsGM();

      let tokenId;
      placeUnlinkedToken(actorId).then((id) => {
        tokenId = id;

        cy.window().then((win) =>
          win.canvas.tokens.get(tokenId).document.actor.update(win.JSON.parse(win.JSON.stringify({ "system.attributes.hp.value": 1 })))
        );

        cy.window().should((win) => {
          expect(win.game.actors.get(actorId).system.attributes.hp.value, "fiche encore intacte avant résolution").to.not.equal(1);
          expect(win.canvas.tokens.get(tokenId).document.actorLink, "précondition : token non lié").to.be.false;
        });

        controlToken(tokenId);
        cy.window().then((win) => {
          win.game.dndCustomAi.resyncControlledToken();
        });

        cy.get("dialog.application.dialog", { timeout: 10000 }).should("exist");
        cy.get('dialog.application.dialog input[type="radio"][name="keepHp"][value="token"]').check();
        cy.get('dialog.application.dialog button[data-action="ok"]').click();

        cy.window().should((win) => {
          expect(win.game.actors.get(actorId).system.attributes.hp.value, "PV du token conservés sur la fiche").to.equal(1);
          expect(win.canvas.scene.tokens.get(tokenId).actorLink, "token relié après résolution").to.be.true;
        });
      });
    });
  });

  it("token désynchronisé — garder les PV de la fiche (T-SYNC-002)", () => {
    cy.loginAsPlayer();
    cy.createReadyCharacter({
      name: "Sync Sheet Wins Fighter",
      origin: "ravenmoor",
      classKey: "fighter",
      skills: ["athletics", "intimidation"]
    }).then((actorId) => {
      createdActorIds.push(actorId);
      cy.loginAsGM();

      let tokenId;
      let originalHp;
      cy.window().then((win) => {
        originalHp = win.game.actors.get(actorId).system.attributes.hp.value;
      });

      placeUnlinkedToken(actorId).then((id) => {
        tokenId = id;

        cy.window().then((win) =>
          win.canvas.tokens.get(tokenId).document.actor.update(win.JSON.parse(win.JSON.stringify({ "system.attributes.hp.value": 1 })))
        );

        controlToken(tokenId);
        cy.window().then((win) => {
          win.game.dndCustomAi.resyncControlledToken();
        });

        cy.get("dialog.application.dialog", { timeout: 10000 }).should("exist");
        cy.get('dialog.application.dialog input[type="radio"][name="keepHp"][value="sheet"]').check();
        cy.get('dialog.application.dialog button[data-action="ok"]').click();

        cy.window().should((win) => {
          expect(win.game.actors.get(actorId).system.attributes.hp.value, "fiche inchangée").to.equal(originalHp);
          expect(win.canvas.scene.tokens.get(tokenId).actorLink, "token relié après résolution").to.be.true;
          expect(win.canvas.tokens.get(tokenId).actor.system.attributes.hp.value, "le token affiche maintenant les PV de la fiche").to.equal(
            originalHp
          );
        });
      });
    });
  });

  it("token non lié mais déjà synchronisé — relié directement, sans fenêtre (T-SYNC-003)", () => {
    cy.loginAsPlayer();
    cy.createReadyCharacter({
      name: "Sync Already Matching Fighter",
      origin: "ravenmoor",
      classKey: "fighter",
      skills: ["athletics", "intimidation"]
    }).then((actorId) => {
      createdActorIds.push(actorId);
      cy.loginAsGM();

      placeUnlinkedToken(actorId).then((tokenId) => {
        controlToken(tokenId);
        cy.window().then((win) => win.game.dndCustomAi.resyncControlledToken());

        cy.window().should((win) => {
          expect(win.canvas.scene.tokens.get(tokenId).actorLink, "relié sans fenêtre de choix").to.be.true;
        });
        cy.get("dialog.application.dialog").should("not.exist");
      });
    });
  });
});
