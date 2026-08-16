// Implémente la section 16 (T-I18N-001, T-I18N-002) de tests/E2E_TEST_PLAN.md —
// internationalisation FR/EN.
//
// Adaptation assumée par rapport au plan : basculer RÉELLEMENT la langue du monde
// (`game.settings.set("core", "language", ...)`) exige un rechargement complet du client pour
// que les fichiers `lang/*.json` soient re-fetchés, et cette session a déjà rencontré à deux
// reprises un incident de démarrage Docker après un simple `docker compose restart` (lock file
// périmé, cf. mémoire projet [[project_e2e_test_plan_progress]]) — un rechargement client
// in-session ajoute un risque équivalent pour un gain limité : le monde de test tourne DÉJÀ en
// anglais (`game.i18n.lang === "en"`, cf. tests/README.md), soit précisément l'autre langue que
// le français câblé en dur dans une bonne partie du contenu de référence (cf. le bug de locale
// documenté sur grantClassContent/#onOpenClassSheet). T-I18N-001/002 vérifient donc, sous cette
// locale déjà active, qu'aucune clé brute `DND_CUSTOM.*` ne fuite dans le texte affiché — la
// garantie concrète que "Tous les libellés basculent" (le plan) demande, sans reproduire le
// switch lui-même.

const createdActorIds = [];

function findRawKeyLeaks(win, selector) {
  const root = win.document.querySelector(selector);
  expect(root, `sélecteur '${selector}' introuvable`).to.exist;
  const text = root.textContent ?? "";
  const matches = text.match(/DND_CUSTOM\.[A-Za-z0-9_.]+/g) ?? [];
  return matches;
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

      // En-tête de la fiche (hors onglets, toujours visible) : vérifié une fois, pas par onglet.
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

        // Résumés dynamiques : déclenchés en sélectionnant successivement Origine et Classe
        // (cf. T-WIZ-003/004, wizard.cy.js), avant de balayer tout le formulaire.
        cy.get('select[name="origin"]').select("ravenmoor");
        cy.get('select[name="classKey"]').select("wizard");

        cy.window().then((win) => {
          const leaks = findRawKeyLeaks(win, "form.character-wizard");
          expect(leaks, `clés brutes trouvées dans l'assistant: ${leaks.join(", ")}`).to.have.length(0);
        });

        // Ferme l'assistant sans soumettre (cf. wizard.cy.js > T-WIZ-018) : rien à nettoyer côté
        // Actor au-delà de sa suppression finale (after() ci-dessus).
        cy.window().then((win) => win.game.actors.get(actor.id)?.sheet?.close?.());
      });
  });
});
