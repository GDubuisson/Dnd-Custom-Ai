// Exécute les tests d'intégration Quench (cf. tests/quench/quench-tests.js) depuis Cypress,
// pour qu'ils tournent dans la même passe que system-load.cy.js. Complète l'E2E "chargement du
// système" par une vérification du vrai pipeline Document (Actor.create, calcul de PV dérivés).
//
// Prérequis manuel (cf. tests/README.md) : les modules "quench" et "dnd-custom-ai-quench-tests"
// doivent être activés dans le monde de test (Configurer le monde > Gérer les modules) — pas
// automatisable simplement, comme la création du monde lui-même.
//
// Particularité : l'API `quench.runBatches()` échoue avec une TypeError si le panneau Quench
// (son Application) n'a jamais été rendu — son code de progression essaie de mettre à jour des
// éléments DOM qui n'existent pas encore. Il faut donc appeler `quench.app.render({force:true})`
// et laisser le temps au rendu avant de lancer les tests.
describe("Tests d'intégration Quench (vrai pipeline Document)", () => {
  it("exécute les batches dndCustomAi.actorCreation, dndCustomAi.wizard et dndCustomAi.combatReaction sans échec", () => {
    // Connexion MJ (et non Joueur comme la majorité des specs) : les batches Quench créent des
    // Documents et touchent au pipeline complet. La séquence de connexion elle-même vit dans
    // cy.joinWorldAs() (cypress/support/e2e.js), qui porte le contournement de la protection
    // anti-clickjacking de Foundry.
    cy.joinWorldAs("Gamemaster");
    // Garde-fou obligatoire : échoue explicitement si le monde testé charge une version du
    // système différente de system.json local (cf. cypress/support/e2e.js pour le pourquoi) —
    // sinon les tests Quench ci-dessous pourraient valider un pipeline Document périmé.
    cy.assertSystemVersionMatches();

    cy.window({ timeout: 20000 }).should("have.property", "quench");
    cy.window().then((win) => win.quench.app.render({ force: true }));
    cy.wait(1500);

    cy.window()
      .then((win) => {
        return new Promise((resolve, reject) => {
          win.Hooks.once("quenchReports", resolve);
          win.quench.runBatches("dndCustomAi.actorCreation", "dndCustomAi.wizard", "dndCustomAi.combatReaction").catch(reject);
        });
      })
      .then((results) => {
        const report = JSON.parse(results.json);
        cy.log(`Quench: ${report.stats.passes}/${report.stats.tests} tests passés`);
        expect(report.stats.tests, "au moins un test Quench doit avoir tourné").to.be.greaterThan(0);
        expect(report.stats.failures, "aucun échec Quench").to.equal(0);
      });
  });
});
