// Destruction des morts-vivants : sur échec, un mort-vivant de FI sous le seuil du Clerc est détruit
// (PV 0, « mort ») au lieu d'être Effrayé.

const createdActorIds = [];
const createdSceneItemIds = [];
let casterId;

// Marqueur de fin du message « détruit », lu dans la locale active.
let destroyedFlavorMarker;
function loadDestroyedFlavorMarker() {
  return cy
    .window()
    .its("game.i18n.lang")
    .then((lang) => cy.readFile(`lang/${lang}.json`))
    .then((json) => {
      const template = json.DND_CUSTOM.Roll.SaveFailUndeadDestroyed;
      destroyedFlavorMarker = template.slice(template.lastIndexOf("}") + 1);
    });
}

function grantTurnUndead(win, actorId) {
  return win.game.actors.get(actorId).createEmbeddedDocuments("Item", [
    win.JSON.parse(
      JSON.stringify({
        name: "Test Canalisation divine",
        type: "feature",
        system: {
          savingThrow: "wis",
          appliesCondition: "frightened",
          requiresCreatureTypes: ["undead"],
          uses: { max: 1, value: 1, recharge: "shortRest" }
        }
      })
    )
  ]);
}

function grantDestroyUndead(win, actorId) {
  return win.game.actors.get(actorId).createEmbeddedDocuments("Item", [
    win.JSON.parse(JSON.stringify({ name: "Destruction des morts-vivants", type: "feature", system: {} }))
  ]);
}

function createUndeadWithToken(win, { name, challengeRating, wisMod }) {
  return win.Actor.create(
    win.JSON.parse(
      win.JSON.stringify({
        name,
        type: "npc",
        system: { creatureType: "undead", challengeRating, abilities: { wis: { mod: wisMod } } }
      })
    )
  ).then((actor) =>
    actor
      .getTokenDocument(win.JSON.parse(win.JSON.stringify({ x: 450, y: 450 })))
      .then((tokenDoc) =>
        win.canvas.scene
          .createEmbeddedDocuments("Token", [win.JSON.parse(win.JSON.stringify(tokenDoc.toObject()))])
          .then((tokens) => ({ actorId: actor.id, tokenId: tokens[0].id }))
      )
  );
}

before(() => {
  cy.loginAsGM();
  cy.createReadyCharacter({
    name: "Destroy Undead Cleric",
    origin: "ashar",
    classKey: "cleric",
    skills: ["religion", "insight"]
  }).then((id) => {
    casterId = id;
    createdActorIds.push(id);
  });
  cy.window().then((win) => win.game.actors.get(casterId).sheet.close());
  // Niveau 5 : seuil de FI 1/2.
  cy.window().then((win) =>
    win.game.actors
      .get(casterId)
      .update(win.JSON.parse(win.JSON.stringify({ "system.attributes.level": 5 })), { dndCustomWizard: true })
  );
  loadDestroyedFlavorMarker();
});

after(() => {
  cy.loginAsGM();
  cy.window().then((win) => {
    const cleanup = [];
    if (createdSceneItemIds.length) cleanup.push(win.canvas.scene.deleteEmbeddedDocuments("Token", createdSceneItemIds));
    if (createdActorIds.length) cleanup.push(win.Actor.deleteDocuments(createdActorIds));
    return Promise.all(cleanup);
  });
});

describe("Destruction des morts-vivants — Clerc 5, seuil de FI par niveau", () => {
  beforeEach(() => cy.loginAsGM());

  // Nouvel Item à chaque appel : bouton ciblé par data-item-id.
  function castOn(tokenId) {
    let featureId;
    cy.window()
      .then((win) => grantTurnUndead(win, casterId))
      .then((items) => {
        featureId = items[0].id;
      });
    cy.window().then((win) => win.canvas.tokens.get(tokenId).setTarget(true, { releaseOthers: true }));
    cy.window().then((win) => win.game.actors.get(casterId).sheet.render(true));
    cy.get("input.actor-name", { timeout: 15000 }).should("be.visible");
    cy.get(".application.character").find('nav.tabs [data-tab="abilities"]').click();
    cy.then(() => {
      cy.get(`.application.character li[data-item-id="${featureId}"] button[data-action="rollFeatureSave"]`).click();
    });
    cy.window().then((win) => win.game.actors.get(casterId).sheet.close());
    return cy.wrap(null).then(() => featureId);
  }

  it("FI sous le seuil + Capacité possédée + échec du jet : détruit (PV à 0, état 'dead'), pas Effrayé (T-TIERC-DESTROY-001)", () => {
    cy.window()
      .then((win) => createUndeadWithToken(win, { name: "Test Weak Zombie", challengeRating: "1/4", wisMod: -2 }))
      .then(({ actorId, tokenId }) => {
        createdActorIds.push(actorId);
        createdSceneItemIds.push(tokenId);
        cy.window().then((win) => grantDestroyUndead(win, casterId));
        cy.forceD20(1);
        castOn(tokenId).then(() => {
          cy.window().should((win) => {
            // Acteur synthétique du token non lié.
            const undead = win.canvas.tokens.get(tokenId).actor;
            expect(undead.system.attributes.hp.value, "PV à 0").to.equal(0);
            expect(undead.statuses.has("dead"), "état 'dead' appliqué").to.be.true;
            expect(undead.statuses.has("frightened"), "pas Effrayé (détruit, pas repoussé)").to.be.false;
            const message = win.game.messages.contents.at(-1);
            expect(message.flavor ?? "", "flavor de destruction (gabarit SaveFailUndeadDestroyed)").to.include(
              destroyedFlavorMarker
            );
          });
        });
      });
  });

  it("FI AU-DESSUS du seuil : repoussé (Effrayé) comme d'habitude, pas détruit (T-TIERC-DESTROY-002)", () => {
    cy.window()
      .then((win) => createUndeadWithToken(win, { name: "Test Strong Wraith", challengeRating: "1", wisMod: -2 }))
      .then(({ actorId, tokenId }) => {
        createdActorIds.push(actorId);
        createdSceneItemIds.push(tokenId);
        cy.window().then((win) => grantDestroyUndead(win, casterId));
        cy.forceD20(1);
        castOn(tokenId).then(() => {
          cy.window().should((win) => {
            const undead = win.canvas.tokens.get(tokenId).actor;
            expect(undead.statuses.has("frightened"), "repoussé (FI trop haute pour être détruit)").to.be.true;
            expect(undead.statuses.has("dead"), "pas détruit").to.be.false;
            expect(undead.system.attributes.hp.value, "PV inchangés").to.be.greaterThan(0);
          });
        });
      });
  });

  it("FI sous le seuil MAIS Capacité non possédée : repoussé (Effrayé), pas détruit (T-TIERC-DESTROY-003)", () => {
    cy.window()
      .then((win) => createUndeadWithToken(win, { name: "Test Weak Skeleton", challengeRating: "1/8", wisMod: -2 }))
      .then(({ actorId, tokenId }) => {
        createdActorIds.push(actorId);
        createdSceneItemIds.push(tokenId);
        // Retire tous les exemplaires de Destruction des morts-vivants.
        cy.window().then((win) => {
          const ids = win.game.actors
            .get(casterId)
            .items.filter((i) => i.name === "Destruction des morts-vivants")
            .map((i) => i.id);
          return ids.length ? win.game.actors.get(casterId).deleteEmbeddedDocuments("Item", ids) : null;
        });
        cy.forceD20(1);
        castOn(tokenId).then(() => {
          cy.window().should((win) => {
            const undead = win.canvas.tokens.get(tokenId).actor;
            expect(undead.statuses.has("frightened"), "repoussé (Capacité absente)").to.be.true;
            expect(undead.statuses.has("dead"), "pas détruit").to.be.false;
          });
        });
      });
  });
});
