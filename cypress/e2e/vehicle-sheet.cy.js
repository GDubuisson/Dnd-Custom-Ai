// T-VEH-001 à 003 : fiche Véhicule (formulaire unique, sans distinction de rôle), en session MJ.

const createdActorIds = [];

function sheetRoot() {
  return cy.get(".application.vehicle");
}

function openSheet(actorId) {
  cy.window().then((win) => win.game.actors.get(actorId).sheet.render(true));
  return sheetRoot().should("be.visible");
}

function updateActor(win, actor, data, options = {}) {
  return actor.update(win.JSON.parse(win.JSON.stringify(data)), options);
}

let sharedActorId;

before(() => {
  cy.loginAsGM();
  cy.window()
    .then((win) => win.Actor.create(win.JSON.parse(win.JSON.stringify({ name: "Recon Chariot", type: "vehicle" }))))
    .then((actor) => {
      sharedActorId = actor.id;
      createdActorIds.push(actor.id);
    });
});

after(() => {
  cy.loginAsGM();
  cy.window().then((win) => win.Actor.deleteDocuments(createdActorIds));
});

describe("Fiche Véhicule, session MJ", () => {
  beforeEach(() => {
    cy.loginAsGM();
    openSheet(sharedActorId);
  });

  it("s'ouvre sans erreur, champs de base présents (T-VEH-001)", () => { // NOSONAR : assertions portées par les helpers (sheetRoot()…should)
    sheetRoot().find('input[name="name"]').should("have.value", "Recon Chariot");
    sheetRoot().find('input[name="system.attributes.speed"]').should("exist");
    sheetRoot().find('input[name="system.attributes.hp.value"]').should("exist");
    sheetRoot().find('input[name="system.carryCapacity"]').should("exist");
  });

  it("la barre de PV se recalcule, bornée entre 0 et 100% (T-VEH-002)", () => { // NOSONAR : assertions portées par les helpers (sheetRoot()…should)
    cy.window().then((win) => {
      const actor = win.game.actors.get(sharedActorId);
      return updateActor(win, actor, { "system.attributes.hp.max": 20, "system.attributes.hp.value": 10 });
    });
    sheetRoot().find(".hp-bar-fill").invoke("attr", "style").should("include", "width: 50%");

    cy.window().then((win) => {
      const actor = win.game.actors.get(sharedActorId);
      return updateActor(win, actor, { "system.attributes.hp.value": 999 });
    });
    sheetRoot().find(".hp-bar-fill").invoke("attr", "style").should("include", "width: 100%");

    cy.window().then((win) => {
      const actor = win.game.actors.get(sharedActorId);
      return updateActor(win, actor, { "system.attributes.hp.value": 0 });
    });
    sheetRoot().find(".hp-bar-fill").invoke("attr", "style").should("include", "width: 0%");
  });

  it("un objet weapon/armor/gear/tool ajouté apparaît dans l'inventaire du véhicule (T-VEH-003)", () => {
    cy.window().then((win) => {
      const source = win.game.items.find((item) => item.type === "gear" && item.name === "Torche");
      expect(source, "prérequis : l'objet 'Torche' existe dans les Items du monde").to.exist;
      return win.game.actors.get(sharedActorId).createEmbeddedDocuments("Item", [source.toObject()]);
    });

    openSheet(sharedActorId);
    cy.window().then((win) => {
      const item = win.game.actors.get(sharedActorId).items.find((candidate) => candidate.name === "Torche");
      expect(item, "l'objet doit être présent sur l'Actor véhicule").to.exist;
      sheetRoot().find(`tr[data-item-id="${item.id}"] .item-name-link`).should("contain.text", "Torche");
    });
  });
});
