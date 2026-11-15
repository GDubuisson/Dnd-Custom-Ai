// T-I18N-001/002 : sous la locale active du monde de test (anglais), aucune clé brute
// `DND_CUSTOM.*` ne doit apparaître dans le texte affiché.

const createdActorIds = [];

function findRawKeyLeaks(win, selector) {
  const root = win.document.querySelector(selector);
  expect(root, `sélecteur '${selector}' introuvable`).to.exist;
  const text = root.textContent ?? "";
  return text.match(/DND_CUSTOM\.[A-Za-z0-9_.]+/g) ?? [];
}

after(() => {
  if (!createdActorIds.length) return;
  cy.loginAsGM();
  cy.window().then((win) => win.Actor.deleteDocuments(createdActorIds));
});

describe("Internationalisation — aucune clé DND_CUSTOM.* brute affichée, locale active (EN)", () => {
  it("fiche personnage complète, tous les onglets (T-I18N-001)", () => {
    cy.loginAsPlayer();
    cy.createReadyCharacter({
      name: "I18N Fighter",
      origin: "fleuraine",
      classKey: "fighter",
      skills: ["athletics", "intimidation"]
    }).then((id) => {
      createdActorIds.push(id);
      cy.window().then((win) => win.game.actors.get(id).sheet.render(true));
      cy.get("input.actor-name", { timeout: 15000 }).should("be.visible");

      const tabs = ["stats", "equipment", "inventory", "abilities", "journal"];
      tabs.forEach((tab) => {
        cy.get(".application.character").find(`nav.tabs [data-tab="${tab}"]`).click();
        cy.get(".application.character")
          .find(`section.tab[data-tab="${tab}"]`)
          .should("have.class", "active")
          .then(() => {
            cy.window().then((win) => {
              const leaks = findRawKeyLeaks(win, `.application.character section.tab[data-tab="${tab}"]`);
              expect(leaks, `clés brutes trouvées dans l'onglet '${tab}': ${leaks.join(", ")}`).to.have.length(0);
            });
          });
      });

      // En-tête de fiche, vérifié une fois.
      cy.window().then((win) => {
        const leaks = findRawKeyLeaks(win, ".application.character header.dnd-custom-ai");
        expect(leaks, `clés brutes trouvées dans l'en-tête: ${leaks.join(", ")}`).to.have.length(0);
      });
    });
  });

  it("assistant de création, y compris les résumés dynamiques Origine/Classe (T-I18N-002)", () => {
    cy.loginAsPlayer();
    cy.window()
      .then((win) => win.Actor.create(win.JSON.parse(win.JSON.stringify({ name: "I18N Wizard Check", type: "character" }))))
      .then((actor) => {
        createdActorIds.push(actor.id);
        cy.get("form.character-wizard", { timeout: 15000 }).should("be.visible");

        // Sélectionne Origine et Classe pour afficher les résumés dynamiques.
        cy.get('select[name="origin"]').select("ravenmoor");
        cy.get('select[name="classKey"]').select("wizard");

        cy.window().then((win) => {
          const leaks = findRawKeyLeaks(win, "form.character-wizard");
          expect(leaks, `clés brutes trouvées dans l'assistant: ${leaks.join(", ")}`).to.have.length(0);
        });

        // Ferme l'assistant sans soumettre.
        cy.window().then((win) => win.game.actors.get(actor.id)?.sheet?.close?.());
      });
  });
});
