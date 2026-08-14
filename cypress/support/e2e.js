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
