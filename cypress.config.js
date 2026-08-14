// Configuration Cypress pour les tests E2E "au réel" contre une instance Foundry VTT lancée
// via Docker (cf. docker-compose.yml + ClaudeFiles/testing/SETUP_TESTING.md). Complète la
// suite tests/ (unitaire/data/dom/visuel, cf. tests/README.md) sans la remplacer : ici on
// teste le vrai client Foundry, pas des fixtures isolées.
// `package.json` déclare "type": "module" (cf. tests/run.js) : ce fichier doit rester en
// syntaxe ESM (import/export), pas require/module.exports (CommonJS), sous peine d'erreur
// "require is not defined" au chargement par Cypress.
import { defineConfig } from "cypress";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Version locale de system.json au moment de lancer Cypress : comparée à game.system.version
// une fois le monde chargé (cf. cy.assertSystemVersionMatches(), cypress/support/e2e.js).
// Garde-fou ajouté suite à un vrai incident : un mauvais chemin de montage dans
// docker-compose.yml a fait tourner toute une session de tests contre une ancienne copie du
// système installée via le gestionnaire de paquets Foundry, jamais contre le code local en
// cours de dev — indétectable sans ce contrôle (cf. [[project_docker_e2e_testing_setup]]).
const expectedSystemVersion = JSON.parse(
  fs.readFileSync(path.join(__dirname, "system.json"), "utf8")
).version;

export default defineConfig({
  e2e: {
    // 127.0.0.1 explicite (pas "localhost") : sur Windows, "localhost" résout en IPv6 (::1) en
    // priorité côté navigateur, et le transfert de port IPv6 de Docker Desktop s'est révélé
    // significativement moins fiable que l'IPv4 dans cet environnement ("socket hang up"
    // systématique côté Cypress/Chrome alors que curl, qui préfère IPv4, fonctionnait toujours).
    baseUrl: "http://127.0.0.1:30001", // Port mappé par docker-compose.yml
    supportFile: "cypress/support/e2e.js",
    specPattern: "cypress/e2e/**/*.cy.{js,jsx,ts,tsx}",
    video: true, // Enregistre les échecs en vidéo
    screenshotOnRunFailure: true,
    defaultCommandTimeout: 10000, // Foundry peut être lent à charger
    requestTimeout: 10000,
    responseTimeout: 30000,
    env: {
      adminKey: "test-admin-key", // Doit correspondre à FOUNDRY_ADMIN_KEY dans docker-compose.yml
      systemId: "dnd-custom-ai",
      testWorld: "Test World",
      testWorldId: "test-world", // Nom du dossier dans data/Data/worlds/, utilisé pour relancer le monde via l'API POST /setup (action launchWorld)
      expectedSystemVersion,
    },
    setupNodeEvents(on, config) {
      // Rien à brancher pour l'instant (pas de plugin/tâche custom nécessaire).
    },
  },
});
