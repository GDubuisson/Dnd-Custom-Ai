// Implémente Sort Prudent/Sort Élevé (Métamagie, Ensorceleur) — 2 des 8 options SRD de
// Métamagie, seules automatisables avec l'existant (revue de conception du 2026-08-22,
// ANOMALIES_ACTIVES.md, périmètre choisi explicitement avec l'utilisateur : les 6 autres
// modifient portée/durée/composantes/économie d'action, non trackées ici).
//
// Modèle retenu (cf. helpers/metamagic.js > chooseMetamagicOption, branche `save?.ability` de
// #onCastSpell dans actor-sheet.js) : même convention Maj/Ctrl-clic que l'avantage/désavantage
// des jets d'attaque (rollCheck) — Maj-clic sur "Lancer" = Sort Prudent (réussite automatique
// d'UNE cible ciblée), Ctrl-clic = Sort Élevé (désavantage sur le jet d'UNE cible ciblée),
// aucune touche = comportement inchangé (aucune fenêtre, aucun point dépensé). Coûte 1 point de
// "Sorcellerie innée" à chaque activation ; choix de la cible seulement si plusieurs sont
// ciblées.
//
// "Métamagie"/"Sorcellerie innée" créées UNE SEULE FOIS (before), réserve remise à 1 point au
// début de chaque test (piège déjà rencontré sur d'autres specs de ce lot : recréer ces Items à
// chaque test laisserait des doublons épuisés, et `.find(name)` retomberait sur le mauvais) — un
// nouveau sort de test est en revanche créé à chaque fois, toujours ciblé par son propre id.

const createdActorIds = [];
const createdSceneItemIds = [];
let casterId;
let sorceryId;
let targetAId;
let targetATokenId;
let targetBId;
let targetBTokenId;

function sheetRoot() {
  return cy.get(".application.character");
}

function updateActor(win, actor, data, options = {}) {
  return actor.update(win.JSON.parse(JSON.stringify(data)), options);
}

function grantTestSpell(win) {
  return win.game.actors.get(casterId).createEmbeddedDocuments("Item", [
    win.JSON.parse(
      JSON.stringify({
        name: "Test Careful Spell",
        type: "spell",
        system: { classes: ["sorcerer"], level: 1, save: { ability: "wis", halfOnSave: false } }
      })
    )
  ]);
}

function createNpcWithToken(win, { name, wisMod }) {
  return win.Actor.create(win.JSON.parse(JSON.stringify({ name, type: "npc", system: { abilities: { wis: { mod: wisMod } } } }))).then(
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

before(() => {
  cy.loginAsGM();
  cy.createReadyCharacter({
    name: "Metamagic Sorcerer",
    origin: "ashar",
    classKey: "sorcerer",
    skills: ["arcana", "persuasion"]
  }).then((id) => {
    casterId = id;
    createdActorIds.push(id);
  });
  // Emplacements de niveau 1 largement suffisants pour tous les casts de cette spec, sans
  // dépendre du remplissage réel à la création (hors-sujet ici).
  cy.window().then((win) => updateActor(win, win.game.actors.get(casterId), { "system.spells.slots.1.value": 10 }));
  cy.window()
    .then((win) =>
      win.game.actors.get(casterId).createEmbeddedDocuments("Item", [
        win.JSON.parse(JSON.stringify({ name: "Métamagie", type: "feature", system: {} })),
        win.JSON.parse(
          JSON.stringify({ name: "Sorcellerie innée", type: "feature", system: { uses: { max: 5, value: 1, recharge: "longRest" } } })
        )
      ])
    )
    .then(() => {
      cy.window().then((win) => {
        sorceryId = win.game.actors.get(casterId).items.find((i) => i.name === "Sorcellerie innée").id;
      });
    });
  cy.window().then((win) => win.game.actors.get(casterId).sheet.close());

  cy.window()
    .then((win) => createNpcWithToken(win, { name: "Metamagic Target A", wisMod: -2 }))
    .then(({ actorId, tokenId }) => {
      targetAId = actorId;
      targetATokenId = tokenId;
      createdActorIds.push(actorId);
      createdSceneItemIds.push(tokenId);
    });
  cy.window()
    .then((win) => createNpcWithToken(win, { name: "Metamagic Target B", wisMod: -2 }))
    .then(({ actorId, tokenId }) => {
      targetBId = actorId;
      targetBTokenId = tokenId;
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

describe("Métamagie — Sort Prudent (Maj-clic) et Sort Élevé (Ctrl-clic)", () => {
  beforeEach(() => {
    cy.loginAsGM();
    cy.window().then((win) => updateActor(win, win.game.actors.get(casterId).items.get(sorceryId), { "system.uses.value": 1 }));
    // Toujours remis à une valeur large avant chaque test : le niveau 1 (Ensorceleur, lanceur
    // complet) n'a que 2 emplacements réels, tout juste suffisants pour 1-2 casts — sans ce
    // reset, les tests suivants échouent avec "aucun emplacement disponible" plutôt que de
    // tester la Métamagie elle-même.
    cy.window().then((win) => updateActor(win, win.game.actors.get(casterId), { "system.spells.slots.1.value": 10 }));
  });

  function castWithModifier(clickOptions) {
    let spellId;
    cy.window()
      .then((win) => grantTestSpell(win))
      .then((items) => {
        spellId = items[0].id;
      });
    cy.window().then((win) => win.canvas.tokens.get(targetATokenId).setTarget(true, { releaseOthers: true }));
    cy.window().then((win) => win.game.actors.get(casterId).sheet.render(true));
    cy.get("input.actor-name", { timeout: 15000 }).should("be.visible");
    sheetRoot().find('nav.tabs [data-tab="abilities"]').click();
    cy.then(() => {
      cy.get(`.application.character li[data-item-id="${spellId}"] button[data-action="castSpell"]`).click(clickOptions);
    });
    cy.window().then((win) => win.game.actors.get(casterId).sheet.close());
  }

  it("Maj-clic (Sort Prudent) : réussite automatique, 1 point dépensé", () => {
    cy.forceD20(1); // si le Sort Prudent ne fonctionnait pas, un 1 naturel échouerait à coup sûr
    castWithModifier({ shiftKey: true });
    cy.window().should((win) => {
      const message = win.game.messages.contents.at(-1);
      expect(message.speaker.actor, "message posté au nom de la cible").to.equal(targetAId);
      expect(message.content, "réussite automatique (Sort Prudent), aucun jet réel").to.include("Metamagic Target A");
      const sorcery = win.game.actors.get(casterId).items.get(sorceryId);
      expect(sorcery.system.uses.value, "1 point de sorcellerie dépensé").to.equal(0);
    });
  });

  it("Ctrl-clic (Sort Élevé) : jet au désavantage (2d20kl1)", () => {
    castWithModifier({ ctrlKey: true });
    cy.window().should((win) => {
      const message = win.game.messages.contents.at(-1);
      expect(message.rolls[0].formula.replace(/\s/g, ""), "formule au désavantage").to.include("2d20kl1");
      const sorcery = win.game.actors.get(casterId).items.get(sorceryId);
      expect(sorcery.system.uses.value, "1 point de sorcellerie dépensé").to.equal(0);
    });
  });

  it("aucune touche maintenue : comportement normal inchangé, aucun point dépensé", () => {
    castWithModifier({});
    cy.window().should((win) => {
      const message = win.game.messages.contents.at(-1);
      expect(message.rolls[0].formula.replace(/\s/g, ""), "jet normal, pas de désavantage").to.not.include("2d20");
      const sorcery = win.game.actors.get(casterId).items.get(sorceryId);
      expect(sorcery.system.uses.value, "aucun point dépensé sans Métamagie activée").to.equal(1);
    });
  });

  it("plusieurs cibles ciblées : fenêtre de choix de la cible affichée", () => {
    let spellId;
    cy.window()
      .then((win) => grantTestSpell(win))
      .then((items) => {
        spellId = items[0].id;
      });
    cy.window().then((win) => {
      win.canvas.tokens.get(targetATokenId).setTarget(true, { releaseOthers: true });
      win.canvas.tokens.get(targetBTokenId).setTarget(true, { releaseOthers: false });
    });
    cy.window().then((win) => win.game.actors.get(casterId).sheet.render(true));
    cy.get("input.actor-name", { timeout: 15000 }).should("be.visible");
    sheetRoot().find('nav.tabs [data-tab="abilities"]').click();
    cy.forceD20(1);
    cy.then(() => {
      cy.get(`.application.character li[data-item-id="${spellId}"] button[data-action="castSpell"]`).click({ shiftKey: true });
    });

    cy.window()
      .its("game.i18n")
      .then((i18n) => i18n.localize("DND_CUSTOM.Spells.MetamagicCarefulTitle"))
      .then((title) => {
        cy.get("dialog.application.dialog[open] .window-title", { timeout: 10000 }).should("contain.text", title);
      });
    cy.get('dialog.application.dialog[open] select[name="targetActorId"]').select(targetBId);
    cy.get('dialog.application.dialog[open] button[data-action="ok"]').click();
    cy.get("dialog.application.dialog[open]").should("not.exist");

    cy.window().should((win) => {
      // 2 messages postés (un par cible) : celui de la cible B (choisie pour le Sort Prudent)
      // doit être une réussite automatique, celui de A un jet normal (1 naturel forcé -> échec).
      const messages = win.game.messages.contents.slice(-2);
      const forB = messages.find((m) => m.speaker.actor === targetBId);
      const forA = messages.find((m) => m.speaker.actor === targetAId);
      expect(forB, "message pour la cible B (Sort Prudent)").to.exist;
      expect(forA, "message pour la cible A (jet normal)").to.exist;
      expect(forB.content, "cible B protégée par le Sort Prudent").to.include("Metamagic Target B");
    });
  });
});
