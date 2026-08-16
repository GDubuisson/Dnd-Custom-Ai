// Implémente la section 13 (T-DND-001 à T-DND-003) de tests/E2E_TEST_PLAN.md — glisser-déposer
// entre fiches (inventory-drag-drop.js). Même technique que tab-journal.cy.js > T-JOURNAL-002 :
// un vrai DragEvent avec un DataTransfer contenant {type:"Item", uuid} dispatché directement sur
// la racine de la fiche cible, sans repasser par le DOM d'une ligne source réelle — fidèle à ce
// que Foundry lit lui-même côté récepteur (_onDropItem, cf. son commentaire), sans dépendre du
// moteur HTML5 natif du navigateur qu'un vrai drag utilisateur engagerait.

const createdActorIds = [];

function dispatchDrop(win, rootSelector, uuid) {
  const dataTransfer = new win.DataTransfer();
  dataTransfer.setData("text/plain", win.JSON.stringify({ type: "Item", uuid }));
  const dropEvent = new win.DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer });
  win.document.querySelector(rootSelector).dispatchEvent(dropEvent);
}

function updateActor(win, actor, data, options = {}) {
  return actor.update(win.JSON.parse(win.JSON.stringify(data)), options);
}

let characterActorId;
let vehicleActorId;

before(() => {
  cy.loginAsGM();
  cy.window()
    .then((win) => win.Actor.create(win.JSON.parse(win.JSON.stringify({ name: "DnD Character", type: "character" }))))
    .then((actor) => {
      characterActorId = actor.id;
      createdActorIds.push(actor.id);
      return cy.window().then((win) =>
        updateActor(
          win,
          actor,
          { "system.class": "fighter", "system.origin": "fleuraine" },
          { dndCustomWizard: true }
        )
      );
    });
  cy.window()
    .then((win) => win.Actor.create(win.JSON.parse(win.JSON.stringify({ name: "DnD Vehicle", type: "vehicle" }))))
    .then((actor) => {
      vehicleActorId = actor.id;
      createdActorIds.push(actor.id);
    });
});

after(() => {
  cy.loginAsGM();
  cy.window().then((win) => win.Actor.deleteDocuments(createdActorIds));
});

describe("Glisser-déposer entre fiches, session MJ", () => {
  beforeEach(() => {
    cy.loginAsGM();
  });

  it("transfère un objet d'un Actor vers un autre, sans le dupliquer (T-DND-001)", () => {
    let weaponItemId;
    let weaponUuid;

    cy.window().then((win) => {
      const source = win.game.items.find((item) => item.type === "weapon" && item.name === "Gourdin");
      return win.game.actors.get(characterActorId).createEmbeddedDocuments("Item", [source.toObject()]);
    });
    cy.window().then((win) => {
      const item = win.game.actors.get(characterActorId).items.find((candidate) => candidate.name === "Gourdin");
      weaponItemId = item.id;
      weaponUuid = item.uuid;
    });

    cy.window().then((win) => win.game.actors.get(characterActorId).sheet.render(true));
    cy.window().then((win) => win.game.actors.get(vehicleActorId).sheet.render(true));
    cy.wait(500);

    cy.window().then((win) => {
      dispatchDrop(win, ".application.vehicle", weaponUuid);
    });

    cy.window().should((win) => {
      const source = win.game.actors.get(characterActorId).items.get(weaponItemId);
      expect(source, "l'objet doit être retiré de la fiche source, pas dupliqué").to.not.exist;
      const moved = win.game.actors.get(vehicleActorId).items.find((candidate) => candidate.name === "Gourdin");
      expect(moved, "l'objet doit apparaître sur la fiche destination").to.exist;
    });

    // Nettoyage : retire l'objet transféré pour ne pas fausser un futur run de cette spec.
    cy.window().then((win) => {
      const moved = win.game.actors.get(vehicleActorId).items.find((candidate) => candidate.name === "Gourdin");
      return moved?.delete();
    });
  });

  it("un drop en dehors de toute fiche ne fait rien, sans erreur JS (T-DND-002)", () => {
    let jsErrorFired = false;
    cy.on("uncaught:exception", () => {
      jsErrorFired = true;
      return false;
    });

    cy.window().then((win) => {
      const source = win.game.items.find((item) => item.type === "weapon" && item.name === "Gourdin");
      dispatchDrop(win, "body", source.uuid);
    });

    cy.window().should((win) => {
      expect(jsErrorFired, "aucune erreur JS ne doit avoir été levée").to.be.false;
      // "body" n'est câblé à aucun DragDrop de fiche : rien ne doit avoir été créé nulle part.
      const onCharacter = win.game.actors.get(characterActorId).items.find((i) => i.name === "Gourdin");
      const onVehicle = win.game.actors.get(vehicleActorId).items.find((i) => i.name === "Gourdin");
      expect(onCharacter, "rien ne doit avoir été créé sur le personnage").to.not.exist;
      expect(onVehicle, "rien ne doit avoir été créé sur le véhicule").to.not.exist;
    });
  });

  it("importe une entrée de compendium par glisser-déposer, dupliquée localement (T-DND-003)", () => {
    let sourceUuid;

    cy.window()
      .then((win) => win.game.packs.get("dnd-custom-ai.dons").getDocuments())
      .then((docs) => {
        const feat = docs.find((candidate) => candidate.name === "Alerte");
        expect(feat, "prérequis : le Don 'Alerte' existe dans le compendium").to.exist;
        sourceUuid = feat.uuid;
      });

    cy.window().then((win) => win.game.actors.get(characterActorId).sheet.render(true));
    cy.wait(500);
    cy.window().then((win) => dispatchDrop(win, ".application.character", sourceUuid));

    cy.window().should((win) => {
      const imported = win.game.actors.get(characterActorId).items.find((candidate) => candidate.name === "Alerte");
      expect(imported, "le Don doit être dupliqué localement sur l'Actor").to.exist;
    });

    // La source du compendium ne doit jamais être affectée par un import (copie, pas déplacement
    // — cf. commentaire de _onDropItem, inventory-drag-drop.js : `item.actor` reste vide pour un
    // document de compendium, donc jamais supprimé).
    cy.window().then((win) => win.game.packs.get("dnd-custom-ai.dons").getDocuments()).should((docs) => {
      expect(docs.find((candidate) => candidate.name === "Alerte"), "le Don reste dans le compendium").to.exist;
    });

    cy.window().then((win) => {
      const imported = win.game.actors.get(characterActorId).items.find((candidate) => candidate.name === "Alerte");
      return imported?.delete();
    });
  });
});
