// Couvre le chantier "plusieurs sous-classes par classe" (inspiration BG3, cf.
// ClaudeFiles/ANOMALIES_ACTIVES.md > "Gros chantier") pour le Paladin : 2 nouvelles sous-classes
// ajoutées (Serment des Anciens/ancients, Serment de Vengeance/vengeance), en plus du Serment de
// Dévotion déjà existant. Vérifie l'octroi des Capacités liées ET le scénario minimal de chaque
// mécanique active (charge à usage limité décomptée).

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

after(() => {
  cy.loginAsGM();
  cy.window().then((win) => {
    const cleanup = [win.Actor.deleteDocuments(createdActorIds)];
    if (createdSceneItemIds.length) cleanup.push(win.canvas.scene.deleteEmbeddedDocuments("Token", createdSceneItemIds));
    return Promise.all(cleanup);
  });
});

describe("Sous-classes de Paladin — Serment des Anciens / Serment de Vengeance", () => {
  it("Serment des Anciens — Voile des anciens utilisable, charge décomptée (T-SUB-PALADIN-001)", () => {
    cy.loginAsPlayer();
    cy.createReadyCharacter({
      name: "Sub Paladin Ancients",
      origin: "ravenmoor",
      classKey: "paladin",
      skills: ["religion", "persuasion"]
    }).then((actorId) => {
      createdActorIds.push(actorId);

      cy.window().then((win) => {
        const actor = win.game.actors.get(actorId);
        return actor.update(
          win.JSON.parse(win.JSON.stringify({ "system.attributes.level": 3, "system.subclass": "ancients" })),
          { dndCustomWizard: true }
        );
      });

      cy.window().should((win) => {
        const actor = win.game.actors.get(actorId);
        expect(actor.items.find((i) => i.name === "Voile des anciens"), "Capacité octroyée").to.exist;
      });

      cy.openActorSheet(actorId);
      goToTab("abilities");

      // "Voile des anciens" n'a pas ses propres charges (`system.uses` absent) : elle consomme
      // la réserve PARTAGÉE "Canalisation divine (Paladin)" (`system.costsResource`, cf.
      // world-items/features.json) — bouton réel "useResourceTechnique" (pas
      // "useFeatureCharge"), qui décompte `uses.value` de la réserve partagée, pas de la
      // Capacité elle-même (cf. #onUseResourceTechnique, feature-actions-mixin.js).
      withItemId(actorId, "Voile des anciens", (itemId) => {
        cy.window().its("game.messages.size").then((before) => {
          cy.get(`li[data-item-id="${itemId}"] button[data-action="useResourceTechnique"]`).click();

          cy.window({ timeout: 10000 }).should((win) => {
            expect(win.game.messages.size, "message d'utilisation posté").to.be.greaterThan(before);
            const resource = win.game.actors.get(actorId).items.find((i) => i.name === "Canalisation divine (Paladin)");
            expect(resource.system.uses.value, "charge de la réserve partagée décomptée").to.equal(0);
          });
        });
      });
    });
  });

  it("Serment de Vengeance — Traque implacable utilisable, charge décomptée (T-SUB-PALADIN-002)", () => {
    cy.loginAsPlayer();
    cy.createReadyCharacter({
      name: "Sub Paladin Vengeance",
      origin: "ravenmoor",
      classKey: "paladin",
      skills: ["religion", "persuasion"]
    }).then((actorId) => {
      createdActorIds.push(actorId);

      cy.window().then((win) => {
        const actor = win.game.actors.get(actorId);
        return actor.update(
          win.JSON.parse(win.JSON.stringify({ "system.attributes.level": 3, "system.subclass": "vengeance" })),
          { dndCustomWizard: true }
        );
      });

      cy.window().should((win) => {
        const actor = win.game.actors.get(actorId);
        expect(actor.items.find((i) => i.name === "Traque implacable"), "Capacité octroyée").to.exist;
      });

      // "Traque implacable" a `grantsCondition: "hunted"` (pose l'état "Traqué" sur une cible,
      // cf. world-items/features.json) : son bouton réel est "grantFeatureCondition" (pas
      // "useFeatureCharge"), et #onGrantFeatureCondition exige une cible ciblée (game.user.
      // targets) pour poster son message — sans cible, il se contente d'un avertissement UI sans
      // toucher au chat. Comme "Voile des anciens" ci-dessus, consomme la réserve PARTAGÉE
      // "Canalisation divine (Paladin)" (`costsResource`), pas sa propre charge. Joueur n'a pas
      // la permission de créer un Token sur la scène (cf. T-TIERC-HUNT-* qui vérifie déjà cette
      // mécanique en détail côté MJ) : bascule en session MJ pour la créature cible ET
      // l'interaction (MJ a accès à toute fiche quel que soit son propriétaire).
      cy.loginAsGM();
      cy.window()
        .then((win) => createActor(win, { name: "Quarry Vengeance", type: "npc", system: { attributes: { hp: { value: 10, max: 10 } } } }))
        .then((quarryActor) => cy.window().then((win) => createToken(win, quarryActor.id, 1000, 1000)))
        .then((quarryTokenId) => targetToken(quarryTokenId));

      cy.window().then((win) => win.game.actors.get(actorId).sheet.render(true));
      cy.get(".application.character input.actor-name", { timeout: 15000 }).should("be.visible");
      goToTab("abilities");

      withItemId(actorId, "Traque implacable", (itemId) => {
        cy.window().its("game.messages.size").then((before) => {
          cy.get(`li[data-item-id="${itemId}"] button[data-action="grantFeatureCondition"]`).click();

          cy.window({ timeout: 10000 }).should((win) => {
            expect(win.game.messages.size, "message d'utilisation posté").to.be.greaterThan(before);
            const resource = win.game.actors.get(actorId).items.find((i) => i.name === "Canalisation divine (Paladin)");
            expect(resource.system.uses.value, "charge de la réserve partagée décomptée").to.equal(0);
          });
        });
      });
    });
  });
});
