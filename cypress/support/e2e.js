// Support file Cypress, chargé automatiquement avant chaque spec e2e (cf. cypress.config.js >
// e2e.supportFile).
import "@testing-library/cypress/add-commands";

// Garde-fou obligatoire : à appeler dans CHAQUE spec juste après avoir confirmé `game.ready`
// (avant toute assertion métier), sur le modèle de system-load.cy.js/quench.cy.js. Vérifie que
// le système chargé dans l'instance Foundry testée correspond à la version locale de
// system.json — sans ce contrôle, un mauvais montage Docker (ou un système jamais reconstruit/
// rechargé après une modif locale) fait tourner toute la suite contre du code périmé sans que
// rien ne le signale (incident réel, cf. [[project_docker_e2e_testing_setup]]). Échec volontaire
// et explicite plutôt qu'un faux vert : à l'utilisateur de corriger (relancer le monde, vérifier
// les montages docker-compose.yml), pas à Cypress de deviner quoi faire.
Cypress.Commands.add("assertSystemVersionMatches", () => {
  cy.window({ timeout: 20000 })
    .its("game.system.version")
    .should((actual) => {
      const expected = Cypress.env("expectedSystemVersion");
      expect(
        actual,
        `game.system.version ("${actual}") ne correspond pas à system.json local ("${expected}") — ` +
          `le monde testé charge une version périmée du système, pas le code en cours de dev. ` +
          `Vérifier docker-compose.yml (montages) et relancer le monde avant de refaire tourner les tests.`
      ).to.equal(expected);
    });
});

// Connexion en tant qu'utilisateur Joueur (cf. Cypress.env("testPlayerName"), cypress.config.js)
// plutôt que Gamemaster : la majorité des scénarios de tests/E2E_TEST_PLAN.md s'exécutent
// délibérément côté Joueur propriétaire (cf. sa section "Conventions"), pas MJ — seuls les
// scénarios dont le comportement dépend explicitement du rôle (ex. T-WIZ-013) utilisent une
// connexion Gamemaster dédiée, comme dans system-load.cy.js/quench.cy.js. Même séquence
// join/garde-fous que ces deux specs (iframe Sec-Fetch-Dest, vérification de version).
// Même séquence que system-load.cy.js/quench.cy.js, factorisée ici pour être réutilisable par
// toute nouvelle spec (cf. wizard.cy.js > T-WIZ-013 et son nettoyage final, seul scénario de la
// section 1 dont le comportement dépend explicitement du rôle MJ).
Cypress.Commands.add("loginAsGM", () => {
  cy.intercept({ url: "**/game" }, (req) => { delete req.headers["sec-fetch-dest"]; });
  cy.intercept({ url: "**/join" }, (req) => { delete req.headers["sec-fetch-dest"]; });

  cy.visit("/", { timeout: 30000 });
  cy.url({ timeout: 15000 }).should("include", "/join");
  cy.get('select[name="userid"]').select("Gamemaster");
  cy.get('#join-game-form button[type="submit"]').click();

  cy.get("#interface", { timeout: 30000 }).should("be.visible");
  cy.window({ timeout: 20000 }).its("game.ready").should("eq", true);
  cy.assertSystemVersionMatches();
});

Cypress.Commands.add("loginAsPlayer", () => {
  cy.intercept({ url: "**/game" }, (req) => { delete req.headers["sec-fetch-dest"]; });
  cy.intercept({ url: "**/join" }, (req) => { delete req.headers["sec-fetch-dest"]; });

  cy.visit("/", { timeout: 30000 });
  cy.url({ timeout: 15000 }).should("include", "/join");

  cy.get('select[name="userid"]').select(Cypress.env("testPlayerName"));
  cy.get('#join-game-form button[type="submit"]').click();

  cy.get("#interface", { timeout: 30000 }).should("be.visible");
  cy.window({ timeout: 20000 }).its("game.ready").should("eq", true);
  cy.assertSystemVersionMatches();

  // Foundry ouvre automatiquement la fenêtre "User Configuration" pour un Joueur qui n'a pas
  // encore de personnage assigné (`game.user.character` vide) — comportement du cœur Foundry,
  // rien à voir avec ce système. Découvert au premier run réel (2026-08-15) : cette fenêtre
  // reste ouverte pendant tout le test, entre en collision avec des sélecteurs génériques
  // (`input[name="name"]` matchait son champ à elle plutôt que celui de l'assistant, cf.
  // wizard.cy.js > T-WIZ-008) et peut recouvrir d'autres éléments. On la ferme systématiquement
  // ici plutôt que dans chaque spec. `{force: true}` : son bouton de fermeture peut lui-même
  // être recouvert par une notification au moment de ce clic (cf. viewportWidth/Height,
  // cypress.config.js).
  cy.get("body").then(($body) => {
    const userConfig = $body.find('[id^="UserConfig-"]');
    if (userConfig.length) {
      cy.wrap(userConfig).find('[data-action="close"]').first().click({ force: true });
    }
  });
});
