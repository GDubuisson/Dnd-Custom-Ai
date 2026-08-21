// Test E2E "au réel" : vérifie que le système dnd-custom-ai se charge correctement dans une
// vraie instance Foundry VTT (lancée via docker-compose.yml, cf. tests/README.md). Complète
// tests/ (unitaire/data/dom/visuel, isolé de Foundry) sans le
// remplacer : c'est la seule couche qui touche le vrai client Foundry.
//
// Prérequis manuel avant de lancer ce test : un monde nommé "Test World" (cf.
// Cypress.env("testWorld"), dossier "test-world" cf. Cypress.env("testWorldId")) doit exister
// dans l'instance Docker, avec le système dnd-custom-ai actif, ET être lancé (actif) au moins
// une fois. Foundry ne propose pas de création de monde en une requête HTTP simple (formulaire
// multi-étapes) : le créer une fois à la main via l'UI (http://localhost:30001), il persiste
// ensuite dans le volume ./data monté par docker-compose.yml.
//
// Particularité Foundry + Cypress : Foundry protège son panneau admin (/setup) contre le
// clickjacking en rejetant (401) toute requête GET dont l'en-tête Sec-Fetch-Dest vaut "iframe"
// (cf. SetupView#handleGet côté serveur). Cypress charge systématiquement l'application testée
// dans une iframe, donc le CONTENU de /setup n'est jamais consultable via cy.visit/cy.get une
// fois cette page atteinte : seule l'URL change (utile pour vérifier qu'un login admin
// fonctionne). En revanche les requêtes POST vers /setup (ex. action "launchWorld") ne sont pas
// concernées par cette protection et fonctionnent normalement via cy.request().
describe("Chargement du système dnd-custom-ai", () => {
  it("permet à l'administrateur de revenir à l'écran de configuration", () => {
    cy.visit("/join");

    cy.get('input[name="adminPassword"]').type(Cypress.env("adminKey"));
    cy.get('#join-game-setup button[type="submit"]').click();

    cy.url({ timeout: 15000 }).should("include", "/setup");

    // Relance immédiatement le monde de test (désactivé par l'action ci-dessus) pour ne pas
    // casser le test suivant, ni les prochains runs de la suite.
    cy.request({
      method: "POST",
      url: "/setup",
      headers: { "Content-Type": "application/json" },
      body: { action: "launchWorld", world: Cypress.env("testWorldId") },
    });
  });

  it("charge le monde de test avec le système actif", () => {
    // Foundry rejette (401) toute requête GET vers /join, /game ou /setup dont l'en-tête
    // Sec-Fetch-Dest vaut "iframe" (protection anti-clickjacking, cf. commentaire d'en-tête).
    // Seule la toute première navigation d'un test (cy.visit initial) passe ce contrôle ; toute
    // navigation déclenchée ensuite par l'appli elle-même (window.location après un submit,
    // cy.reload) est vue par Chrome comme réellement imbriquée dans l'iframe du test runner et
    // se fait rejeter. On neutralise donc cet en-tête sur toutes les requêtes de document vers
    // ces routes pour toute la durée du test.
    cy.intercept({ url: "**/game" }, (req) => {
      delete req.headers["sec-fetch-dest"];
    });
    cy.intercept({ url: "**/join" }, (req) => {
      delete req.headers["sec-fetch-dest"];
    });

    // Laisse le temps au monde relancé par le test précédent de finir son initialisation
    // serveur avant de visiter la racine.
    cy.visit("/", { timeout: 30000 });
    cy.url({ timeout: 15000 }).should("include", "/join");

    cy.get('input[name="username"]').type("Gamemaster");
    cy.get('#join-game-form button[type="submit"]').click();

    // Foundry peut être lent à charger (assets, compendiums) : timeout étendu, cf.
    // defaultCommandTimeout de la config qui ne s'applique pas à ce get() explicite.
    cy.get("#interface", { timeout: 30000 }).should("be.visible");

    cy.window().its("game.system.id").should("eq", Cypress.env("systemId"));
    // Garde-fou obligatoire : échoue explicitement si le monde testé charge une version du
    // système différente de system.json local (cf. cypress/support/e2e.js pour le pourquoi).
    cy.assertSystemVersionMatches();
  });
});
