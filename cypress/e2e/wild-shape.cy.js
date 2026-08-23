// Chantier "Forme sauvage" (Druide, 2026-08-23) — cadrage avec l'utilisateur (ANOMALIES_ACTIVES.md) :
// réutilise le même principe que "Combat monté" (chantier "Combat automatisé avancé") : un
// nouvel Actor de type "wildShapeForm" (même NpcData/DndCustomNpcSheet que "mount", cf.
// dnd-custom-ai.js) représente la bête prise, ciblé puis lié via le bouton dédié "Prendre forme"
// de la Capacité elle-même (system.entersWildShape, item-data.js). Sa propre réserve de PV sert
// de 2e réserve pendant la transformation : retour automatique à la forme normale à 0 PV de
// forme (dégâts excédentaires jamais reportés sur le personnage, SRD 5e), ou manuel à tout
// moment ("Redevenir soi-même", onglet Statistiques).

const createdActorIds = [];
const createdSceneItemIds = [];

function sheetRoot() {
  return cy.get(".application.character");
}

function goToTab(tabId) {
  sheetRoot().find(`nav.tabs [data-tab="${tabId}"]`).click();
  sheetRoot().find(`section.tab[data-tab="${tabId}"]`).should("have.class", "active");
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

let druidId;
let wolfFormId;
let wolfFormTokenId;

before(() => {
  cy.loginAsPlayer();
  cy.createReadyCharacter({ name: "Wild Shape Druid", origin: "fleuraine", classKey: "druid", skills: ["nature", "survival"] }).then(
    (id) => {
      druidId = id;
      createdActorIds.push(id);
    }
  );
  // "Forme sauvage" requiert le niveau 2 (grantClassContent) : plutôt que de faire monter de
  // niveau ce personnage de test level 1 (dance supplémentaire + dépend d'un réimport de
  // compendium à jour, cf. piège documenté ailleurs), l'Item est créé DIRECTEMENT avec les
  // données actuelles de world-items/features.json (même pattern que deferred-rider-spells.cy.js
  // pour un contenu modifié cette session).
  cy.window().then((win) =>
    win.game.actors.get(druidId).createEmbeddedDocuments(
      "Item",
      win.JSON.parse(
        win.JSON.stringify([
          {
            name: "Forme sauvage",
            type: "feature",
            system: {
              class: "druid",
              level: 2,
              activation: "bonusAction",
              entersWildShape: true,
              requiresRoll: false,
              uses: { max: 2, value: 2, recharge: "shortRest" }
            }
          }
        ])
      )
    )
  );
  cy.window().then((win) => win.game.actors.get(druidId)?.sheet?.close());

  cy.loginAsGM();
  cy.window()
    .then((win) =>
      win.Actor.create(
        win.JSON.parse(
          win.JSON.stringify({
            name: "Wolf Form",
            type: "wildShapeForm",
            system: { size: "m", creatureType: "beast", attributes: { hp: { value: 11, max: 11 } } }
          })
        )
      )
    )
    .then((actor) => {
      wolfFormId = actor.id;
      createdActorIds.push(actor.id);
      return cy.window().then((win) => createToken(win, wolfFormId, 400, 400));
    })
    .then((tokenId) => {
      wolfFormTokenId = tokenId;
    });
});

after(() => {
  cy.loginAsGM();
  cy.window().then((win) => {
    const cleanup = [win.Actor.deleteDocuments(createdActorIds)];
    if (createdSceneItemIds.length) cleanup.push(win.canvas.scene.deleteEmbeddedDocuments("Token", createdSceneItemIds));
    return Promise.all(cleanup);
  });
});

describe("Forme sauvage — prise de forme, chip de statut, retour volontaire", () => {
  beforeEach(() => {
    cy.loginAsPlayer();
  });

  it("aucune cible : avertissement, aucune charge consommée", () => {
    cy.window().then((win) =>
      updateActor(win, win.game.actors.get(druidId), { "system.combat.wildShapeActorId": "" }, { dndCustomWizard: true })
    );
    cy.loginAsGM();
    cy.window().then((win) =>
      updateActor(win, win.game.actors.get(druidId).items.find((i) => i.name === "Forme sauvage"), { "system.uses.value": 2 })
    );
    cy.loginAsPlayer();
    cy.openActorSheet(druidId);
    goToTab("abilities");

    cy.window().then((win) => [...win.game.user.targets].forEach((t) => t.setTarget(false)));
    withItemId(druidId, "Forme sauvage", (itemId) => {
      cy.get(`li[data-item-id="${itemId}"] button[data-action="enterWildShape"]`).click();
    });

    cy.window().should((win) => {
      expect(win.game.actors.get(druidId).system.combat.wildShapeActorId, "aucune forme liée sans cible").to.equal("");
      const item = win.game.actors.get(druidId).items.find((i) => i.name === "Forme sauvage");
      expect(item.system.uses.value, "aucune charge consommée sans cible valide").to.equal(2);
    });
  });

  it("cible valide : prend la forme, décompte une charge, chip visible sur l'onglet Statistiques", () => {
    cy.openActorSheet(druidId);
    goToTab("abilities");
    targetToken(wolfFormTokenId);
    withItemId(druidId, "Forme sauvage", (itemId) => {
      cy.get(`li[data-item-id="${itemId}"] button[data-action="enterWildShape"]`).click();
    });

    cy.window().should((win) => {
      expect(win.game.actors.get(druidId).system.combat.wildShapeActorId, "forme liée après ciblage").to.equal(wolfFormId);
      const item = win.game.actors.get(druidId).items.find((i) => i.name === "Forme sauvage");
      expect(item.system.uses.value, "une charge décomptée").to.equal(1);
    });

    goToTab("stats");
    sheetRoot().find(".mount-chip").contains("Wolf Form");
    sheetRoot().find(".mount-chip").contains("11/11");
  });

  it("retour volontaire : le bouton 'Redevenir soi-même' vide le lien, sans rendre la charge", () => {
    cy.openActorSheet(druidId);
    goToTab("stats");
    sheetRoot().find('[data-action="revertWildShape"]').click();

    cy.window().should((win) => {
      expect(win.game.actors.get(druidId).system.combat.wildShapeActorId, "forme retirée").to.equal("");
      const item = win.game.actors.get(druidId).items.find((i) => i.name === "Forme sauvage");
      expect(item.system.uses.value, "charge jamais rendue par un retour volontaire").to.equal(1);
    });
    sheetRoot().find(".mount-chip").contains("Wolf Form").should("not.exist");
  });
});

describe("Forme sauvage — retour automatique à 0 PV de forme", () => {
  beforeEach(() => {
    cy.loginAsPlayer();
  });

  it("les PV de la forme tombent à 0 : retour automatique + message de chat", () => {
    cy.openActorSheet(druidId);
    goToTab("abilities");
    targetToken(wolfFormTokenId);
    withItemId(druidId, "Forme sauvage", (itemId) => {
      cy.get(`li[data-item-id="${itemId}"] button[data-action="enterWildShape"]`).click();
    });
    cy.window().should((win) => {
      expect(win.game.actors.get(druidId).system.combat.wildShapeActorId).to.equal(wolfFormId);
    });

    cy.loginAsGM();
    cy.window().then((win) => win.game.messages.size).then((baseline) => {
      cy.window().then((win) => updateActor(win, win.game.actors.get(wolfFormId), { "system.attributes.hp.value": 0 }));

      cy.window({ timeout: 10000 }).should((win) => {
        expect(win.game.actors.get(druidId).system.combat.wildShapeActorId, "retour automatique à la forme normale").to.equal("");
        expect(win.game.messages.size, "un message de fin de forme est posté").to.be.greaterThan(baseline);
      });

      cy.window()
        .its("game.i18n")
        .then((i18n) => i18n.format("DND_CUSTOM.Chat.WildShapeEnded", { name: "Wild Shape Druid", form: "Wolf Form" }))
        .then((expected) => {
          cy.window().then((win) => {
            const found = win.game.messages.contents.slice(baseline).some((m) => (m.content ?? "").includes(expected));
            expect(found, `message contenant "${expected}"`).to.be.true;
          });
        });
    });
  });
});
