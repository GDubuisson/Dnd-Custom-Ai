// Implémente "Repousser les morts-vivants" (Canalisation divine, Clerc) — une des 4 Capacités
// à choix identifiées dans la revue de conception du 2026-08-22 (ANOMALIES_ACTIVES.md), la seule
// des 4 réellement mécanisable avec l'existant : en SRD 5e, Repousser les morts-vivants est
// universel à TOUS les Clercs (indépendant du Domaine choisi), contrairement à ce que laissait
// entendre le texte précédent ("propre à votre Domaine divin").
//
// Modèle retenu (cf. FeatureData#savingThrow/appliesCondition/requiresCreatureType,
// item-data.js ; #onRollFeatureSave, actor-sheet.js) : même mécanisme que le jet de sauvegarde
// de cible des sorts (SpellData#save) mais pour une Capacité — le Clerc ne roule jamais
// lui-même, seul le DD (spellSaveDC) compte face au jet de CHAQUE cible ciblée ; échec ET bon
// type de créature (undead) = Effrayé appliqué automatiquement (Actor#toggleStatusEffect).
//
// Capacité de test créée directement via createEmbeddedDocuments (comme les autres specs de ce
// lot) plutôt que depuis le compendium, pour un DD/uses déterministes.

const createdActorIds = [];
const createdSceneItemIds = [];
let casterId;
let undeadId;
let undeadTokenId;
let livingId;
let livingTokenId;

function abilityModifier(score) {
  return Math.floor((score - 10) / 2);
}
function proficiencyBonusFor(level) {
  return Math.ceil(level / 4) + 1;
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
          requiresCreatureType: "undead",
          uses: { max: 1, value: 1, recharge: "shortRest" }
        }
      })
    )
  ]);
}

function createNpcWithToken(win, { name, creatureType, wisMod }) {
  return win.Actor.create(
    win.JSON.parse(
      JSON.stringify({ name, type: "npc", system: { creatureType, abilities: { wis: { mod: wisMod } } } })
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
    name: "Turn Undead Cleric",
    origin: "ashar",
    classKey: "cleric",
    skills: ["religion", "insight"]
  }).then((id) => {
    casterId = id;
    createdActorIds.push(id);
  });
  cy.window().then((win) => win.game.actors.get(casterId).sheet.close());

  cy.window()
    .then((win) => createNpcWithToken(win, { name: "Test Skeleton", creatureType: "undead", wisMod: -2 }))
    .then(({ actorId, tokenId }) => {
      undeadId = actorId;
      undeadTokenId = tokenId;
      createdActorIds.push(actorId);
      createdSceneItemIds.push(tokenId);
    });
  cy.window()
    .then((win) => createNpcWithToken(win, { name: "Test Guard", creatureType: "humanoid", wisMod: 1 }))
    .then(({ actorId, tokenId }) => {
      livingId = actorId;
      livingTokenId = tokenId;
      createdActorIds.push(actorId);
      createdSceneItemIds.push(tokenId);
    });
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

describe("Repousser les morts-vivants — jet de sauvegarde de Sagesse, Effrayé si échec", () => {
  beforeEach(() => cy.loginAsGM());

  function castOn(tokenId) {
    // Un nouvel Item "Test Canalisation divine" par appel (jamais supprimé, plusieurs coexistent
    // sur le même personnage au fil des tests) : ciblage du bouton par data-item-id (featureId),
    // jamais par nom — `.contains("li", ...)` prendrait le premier trouvé, potentiellement un
    // exemplaire déjà épuisé d'un test précédent (piège rencontré en écrivant ce test : le clic
    // atterrissait silencieusement sur l'Item épuisé, `#consumeFeatureCharge` renvoyait `null`
    // avant tout jet, laissant croire à tort que le mécanisme fonctionnait).
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

  it("mort-vivant, échec du jet (1 naturel) : Effrayé appliqué, charge consommée", () => {
    cy.forceD20(1);
    castOn(undeadTokenId).then((featureId) => {
      cy.window().should((win) => {
        // Token NPC non lié (actorLink: false par défaut) : l'effet est appliqué à l'acteur
        // SYNTHÉTIQUE propre à ce token (win.canvas.tokens.get(id).actor), pas à l'acteur
        // "prototype" du monde (win.game.actors.get(id)) — comportement Foundry normal, chaque
        // token d'un même Actor doit pouvoir avoir son propre état.
        const undead = win.canvas.tokens.get(undeadTokenId).actor;
        expect(undead.statuses.has("frightened"), "Effrayé appliqué à la cible").to.be.true;
        const feature = win.game.actors.get(casterId).items.get(featureId);
        expect(feature.system.uses.value, "charge consommée").to.equal(0);
        const message = win.game.messages.contents.at(-1);
        expect(message.speaker.actor, "message posté au nom de la cible").to.equal(undeadId);
      });
    });
  });

  it("mort-vivant, réussite du jet (20 naturel) : aucun effet appliqué", () => {
    // Repart d'un état propre : le test précédent a pu laisser cette même cible Effrayée.
    cy.window().then((win) => win.canvas.tokens.get(undeadTokenId).actor.toggleStatusEffect("frightened", { active: false }));
    cy.forceD20(20);
    castOn(undeadTokenId).then(() => {
      cy.window().should((win) => {
        const undead = win.canvas.tokens.get(undeadTokenId).actor;
        expect(undead.statuses.has("frightened"), "aucun effet en cas de réussite").to.be.false;
      });
    });
  });

  it("cible NON mort-vivante : aucun jet, aucun effet, message informatif dédié", () => {
    cy.forceD20(1);
    castOn(livingTokenId).then(() => {
      cy.window().should((win) => {
        const living = win.canvas.tokens.get(livingTokenId).actor;
        expect(living.statuses.has("frightened"), "jamais concerné, mauvais type de créature").to.be.false;
        const message = win.game.messages.contents.at(-1);
        expect(message.speaker.actor, "message informatif posté au nom de la cible non concernée").to.equal(livingId);
      });
    });
  });
});
