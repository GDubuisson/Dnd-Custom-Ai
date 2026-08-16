// Implémente la section 7 (T-JOURNAL-001, T-JOURNAL-002) de tests/E2E_TEST_PLAN.md — onglet
// Journal (tab-journal.hbs) : Biographie et Notes (deux champs ProseMirror libres, propriété du
// Joueur). Les langues connues (ex T-JOURNAL-001/002, "liste + glisser-déposer") ont été
// déplacées vers l'onglet Capacités le 2026-08-16 (retour de test — cf. tab-abilities.cy.js >
// "Onglet Capacités/Sorts — langues connues", T-ABIL-022/023) ; le Journal ne contient donc plus
// que ces deux champs de texte libre.

const createdActorIds = [];
let sharedActorId;

function sheetRoot() {
  return cy.get(".application.character");
}

function openSheet(actorId) {
  cy.window().then((win) => win.game.actors.get(actorId).sheet.render(true));
  return cy.get("input.actor-name", { timeout: 15000 }).should("be.visible");
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
    // Un simple blur (perte de focus, ex. cliquer ailleurs) ne suffit PAS à sauvegarder : le
    // `<prose-mirror>` de Foundry ne déclenche aucun évènement natif "change" sur un
    // contenteditable au blur (limitation connue des navigateurs) — vérifié en conditions
    // réelles (blur explicite + 2s d'attente, toujours rien en base). La sauvegarde passe par le
    // bouton dédié de la barre d'outils, `data-action="save"` (menu du haut de l'éditeur).
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
});
