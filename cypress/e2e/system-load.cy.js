// Test E2E "au réel" : vérifie que le système dnd-custom-ai se charge correctement dans une
// vraie instance Foundry VTT (lancée via docker-compose.yml, cf. tests/README.md). Complète
// tests/ (unitaire/data/dom/visuel, isolé de Foundry) sans le
// remplacer : c'est la seule couche qui touche le vrai client Foundry.
//
// Prérequis manuel avant de lancer ce test : un monde nommé "Test World" (cf.
// Cypress.expose("testWorld"), dossier "test-world" cf. Cypress.expose("testWorldId")) doit exister
// dans l'instance Docker, avec le système dnd-custom-ai actif, ET être lancé (actif) au moins
// une fois. Foundry ne propose pas de création de monde en une requête HTTP simple (formulaire
// multi-étapes) : le créer une fois à la main via l'UI (http://localhost:30001), il persiste
// ensuite dans le volume ./data monté par docker-compose.yml.
//
// Particularité Foundry + Cypress : Foundry protège /setup, /join, /game... contre le
// clickjacking en rejetant toute requête de DOCUMENT dont l'en-tête Sec-Fetch-Dest vaut autre
// chose que "document"/"empty" (View.assertDocumentDestination côté serveur), et Cypress charge
// l'application testée dans une iframe. Les navigations pilotées par cy.visit() passent (c'est
// la navigation déclenchée par la page elle-même après un submit qui est rejetée, cf.
// cy.joinWorldAs() dans cypress/support/e2e.js pour le détail et le contournement) ; le contenu
// de /setup reste en revanche inexploitable ici, seule l'URL est vérifiée ci-dessous — ce qui
// suffit à valider qu'un login admin fonctionne. Les requêtes POST vers /setup (ex. action
// "launchWorld") ne sont pas soumises à cette protection, mais depuis Foundry 14.370 elles
// doivent prouver leur origine (middleware CSRF, cf. l'en-tête Sec-Fetch-Site posé sur le
// cy.request ci-dessous).
describe("Chargement du système dnd-custom-ai", () => {
  it("permet à l'administrateur de revenir à l'écran de configuration", () => {
    cy.visit("/join");

    cy.get('input[name="adminPassword"]').type(Cypress.expose("adminKey"));
    cy.get('#join-game-setup button[type="submit"]').click();

    cy.url({ timeout: 15000 }).should("include", "/setup");

    // Relance immédiatement le monde de test (désactivé par l'action ci-dessus) pour ne pas
    // casser le test suivant, ni les prochains runs de la suite.
    cy.request({
      method: "POST",
      url: "/setup",
      // Depuis Foundry 14.370 : un middleware CSRF (dist/server/express.mjs) rejette en 400
      // ({"error":"The request could not be processed."}) tout POST qui ne prouve pas son
      // origine — soit `Sec-Fetch-Site: same-origin`, soit un en-tête `Origin` égal à
      // `<protocole>://<Host>`. cy.request part du process Node de Cypress (pas du navigateur),
      // donc aucun de ces en-têtes n'est posé automatiquement : sans cette ligne, la relance du
      // monde échoue silencieusement et toute la suite part sur un monde inactif.
      headers: {
        "Content-Type": "application/json",
        "Sec-Fetch-Site": "same-origin",
      },
      body: { action: "launchWorld", world: Cypress.expose("testWorldId") },
    });
  });

  it("charge le monde de test avec le système actif", () => {
    // La séquence de connexion (et le contournement de la protection anti-clickjacking de
    // Foundry qu'elle exige, cf. commentaire d'en-tête) vit dans cy.joinWorldAs()
    // (cypress/support/e2e.js) : elle attend aussi #interface puis game.ready, Foundry pouvant
    // être lent à charger ses assets et compendiums. Le monde relancé par le test précédent a
    // ainsi le temps de finir son initialisation serveur.
    cy.joinWorldAs("Gamemaster");

    cy.window().its("game.system.id").should("eq", Cypress.expose("systemId"));
    // Garde-fou obligatoire : échoue explicitement si le monde testé charge une version du
    // système différente de system.json local (cf. cypress/support/e2e.js pour le pourquoi).
    cy.assertSystemVersionMatches();
  });
});
