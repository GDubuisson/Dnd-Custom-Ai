// Chantier "Niveau C" (2026-08-24, sur demande explicite après revue de
// ClaudeFiles/MECANIQUES_A_AUTOMATISER.md) : étend "Repousser les morts-vivants"
// (turn-undead-feature.cy.js, déjà mécanisé) avec "Destruction des morts-vivants" (Clerc 5,
// SRD 5e) — quand la cible (mort-vivant) échoue son jet ET que sa FI est sous le seuil du
// niveau du Clerc (table SRD : 1/2 au niv. 5, 1 au niv. 8, 2 au niv. 11, 3 au niv. 14, 4 au
// niv. 17), elle est DÉTRUITE (PV à 0, état "dead") au lieu d'être seulement repoussée (Effrayé).
// cf. #onRollFeatureSave > destroysUndead (actor-sheet.js), isUndeadDestroyed/
// destroyUndeadThreshold (mêmes fichier).

const createdActorIds = [];
const createdSceneItemIds = [];
let casterId;

// Chaînes localisées chargées dynamiquement depuis game.i18n.lang (le monde de test tourne en
// anglais, pas en français — jamais de chaîne DND_CUSTOM.* codée en dur ici, même patron que
// loadStringsForActiveLocale dans wizard.cy.js). Seul le texte FIXE après le dernier `{...}`
// du gabarit ("and is destroyed (Destroy Undead).") sert de marqueur — évite de recalculer le DD
// exact juste pour vérifier QUEL des deux gabarits (SaveFail/SaveFailUndeadDestroyed) a été posté.
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
  // Niveau 5 : seuil de FI "1/2" (destroyUndeadThreshold, actor-sheet.js).
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

  // Un nouvel Item "Test Canalisation divine" par appel (jamais supprimé) : ciblage du bouton
  // par data-item-id, jamais par nom — même piège déjà documenté dans turn-undead-feature.cy.js
  // (un exemplaire épuisé d'un test précédent serait sinon silencieusement re-ciblé).
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
            // Token NPC non lié (actorLink: false par défaut) : l'acteur SYNTHÉTIQUE du token,
            // pas le "prototype" du monde — même piège déjà documenté (turn-undead-feature.cy.js).
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
        // Retire TOUS les exemplaires de "Destruction des morts-vivants" (T-TIERC-DESTROY-001/002
        // en ont chacun accordé un, jamais supprimé — hasFeature ne teste QUE la présence d'AU
        // MOINS un exemplaire, en laisser un seul suffirait à fausser ce test) : vérifie
        // explicitement le comportement SANS cette Capacité.
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
