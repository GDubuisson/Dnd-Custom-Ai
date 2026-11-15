// Chargement du système dans l'instance Foundry Docker. Prérequis : monde « Test World » existant,
// système actif. Seule l'URL de /setup est vérifiable depuis l'iframe Cypress.
describe("Chargement du système dnd-custom-ai", () => {
  it("permet à l'administrateur de revenir à l'écran de configuration", () => {
    cy.visit("/join");

    cy.get('input[name="adminPassword"]').type(Cypress.expose("adminKey"));
    cy.get('#join-game-setup button[type="submit"]').click();

    cy.url({ timeout: 15000 }).should("include", "/setup");

    // Relance le monde de test pour les specs suivantes.
    cy.request({
      method: "POST",
      url: "/setup",
      // `Sec-Fetch-Site` requis par le middleware CSRF de Foundry sur les POST.
      headers: {
        "Content-Type": "application/json",
        "Sec-Fetch-Site": "same-origin",
      },
      body: { action: "launchWorld", world: Cypress.expose("testWorldId") },
    });
  });

  it("charge le monde de test avec le système actif", () => {
    // Connexion via cy.joinWorldAs(), qui attend game.ready.
    cy.joinWorldAs("Gamemaster");

    cy.window().its("game.system.id").should("eq", Cypress.expose("systemId"));
    // Vérifie la version du système chargé.
    cy.assertSystemVersionMatches();
  });
});
