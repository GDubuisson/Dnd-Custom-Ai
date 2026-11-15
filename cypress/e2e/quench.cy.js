// Lance les tests d'intégration Quench depuis Cypress (modules quench et dnd-custom-ai-quench-tests activés).
// Le panneau Quench doit être rendu avant `quench.runBatches()`.
describe("Tests d'intégration Quench (vrai pipeline Document)", () => {
  it("exécute les batches dndCustomAi.actorCreation, dndCustomAi.wizard et dndCustomAi.combatReaction sans échec", () => {
    // Session MJ.
    cy.joinWorldAs("Gamemaster");
    // Vérifie la version du système chargé.
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
