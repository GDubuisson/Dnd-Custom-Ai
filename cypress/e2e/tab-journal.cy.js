// T-JOURNAL-001/002 : onglet Journal, champs Biographie et Notes (ProseMirror).

const createdActorIds = [];
let sharedActorId;

function sheetRoot() {
  return cy.get(".application.character");
}

function openSheet(actorId) {
  cy.window().then((win) => win.game.actors.get(actorId).sheet.render(true));
  return cy.get("input.actor-name", { timeout: 15000 }).should("be.visible");
}

function updateActor(win, actor, data, options = {}) {
  return actor.update(win.JSON.parse(win.JSON.stringify(data)), options);
}

before(() => {
  cy.loginAsPlayer();
  cy.createReadyCharacter({
    name: "Journal T-JOURNAL",
    origin: "fleuraine",
    classKey: "fighter",
    skills: ["athletics", "intimidation"]
  }).then((id) => {
    sharedActorId = id;
    createdActorIds.push(id);
  });
});

after(() => {
  if (!createdActorIds.length) return;
  cy.loginAsGM();
  cy.window().then((win) => win.Actor.deleteDocuments(createdActorIds));
});

describe("Onglet Journal, session Joueur", () => {
  beforeEach(() => {
    cy.loginAsPlayer();
    openSheet(sharedActorId);
    sheetRoot().find('nav.tabs [data-tab="journal"]').click();
    sheetRoot().find('section.tab[data-tab="journal"]').should("have.class", "active");
  });

  it("le champ Biographie est éditable et la valeur persiste (T-JOURNAL-001)", () => {
    sheetRoot().find('prose-mirror[name="system.biography"] [contenteditable="true"]').click().type("Née à Fleuraine.");
    // La sauvegarde passe par le bouton `data-action="save"` (un blur ne suffit pas).
    sheetRoot().find('prose-mirror[name="system.biography"] button[data-action="save"]').click();
    cy.window().should((win) => {
      expect(win.game.actors.get(sharedActorId).system.biography).to.include("Née à Fleuraine.");
    });
  });

  it("le champ Notes est éditable et la valeur persiste (T-JOURNAL-002)", () => {
    sheetRoot().find('prose-mirror[name="system.notes"] [contenteditable="true"]').click().type("Doit de l'argent au forgeron.");
    sheetRoot().find('prose-mirror[name="system.notes"] button[data-action="save"]').click();
    cy.window().should((win) => {
      expect(win.game.actors.get(sharedActorId).system.notes).to.include("Doit de l'argent au forgeron.");
    });
  });

  it("le champ Biographie grandit avec un texte long, sans défilement interne (anomalie 2026-08-19)", () => {
    // Contenu dépassant largement les 8rem minimum : le champ doit grandir.
    const longText = Array.from(
      { length: 20 },
      (_, i) => `<p>Ligne ${i + 1} d'un texte volontairement long pour dépasser la hauteur minimale du champ.</p>`
    ).join("");
    cy.window().then((win) => updateActor(win, win.game.actors.get(sharedActorId), { "system.biography": longText }));
    cy.then(() => openSheet(sharedActorId));
    sheetRoot().find('nav.tabs [data-tab="journal"]').click();
    sheetRoot().find('section.tab[data-tab="journal"]').should("have.class", "active");

    sheetRoot()
      .find('prose-mirror[name="system.biography"]')
      .should(($el) => {
        const el = $el[0];
        expect(el.clientHeight, "doit grandir bien au-delà du plancher de 8rem (~128px)").to.be.greaterThan(300);
        expect(
          el.scrollHeight - el.clientHeight,
          `aucun défilement interne attendu (scrollHeight ${el.scrollHeight} vs clientHeight ${el.clientHeight})`
        ).to.be.at.most(2);
      });
  });
});
