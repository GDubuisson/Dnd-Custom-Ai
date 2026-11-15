// Configuration Cypress des tests E2E contre l'instance Foundry Docker (cf. docker-compose.yml).
// Fichier en ESM (`"type": "module"` dans package.json).
import { defineConfig } from "cypress";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dns from "node:dns";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Résolution IPv6 prioritaire de « localhost » (best-effort, cf. `baseUrl`).
dns.setDefaultResultOrder("ipv6first");

// Version de system.json locale, comparée à game.system.version (cy.assertSystemVersionMatches).
const expectedSystemVersion = JSON.parse(
  fs.readFileSync(path.join(__dirname, "system.json"), "utf8")
).version;

export default defineConfig({
  e2e: {
    // Adresse IPv6 littérale pour éviter la résolution DNS ; remplacer par 127.0.0.1 si IPv4 redevient fiable.
    baseUrl: "http://[::1]:30001", // Port mappé par docker-compose.yml
    supportFile: "cypress/support/e2e.js",
    specPattern: "cypress/e2e/**/*.cy.{js,jsx,ts,tsx}",
    video: true, // Enregistre les échecs en vidéo
    screenshotOnRunFailure: true,
    // Foundry exige une fenêtre d'au moins 1024 × 768.
    viewportWidth: 1280,
    viewportHeight: 800,
    defaultCommandTimeout: 10000, // Foundry peut être lent à charger
    requestTimeout: 10000,
    responseTimeout: 30000,
    // Configuration non sensible lue via `Cypress.expose("clé")`.
    expose: {
      adminKey: "test-admin-key", // Doit correspondre à FOUNDRY_ADMIN_KEY dans docker-compose.yml
      systemId: "dnd-custom-ai",
      testWorld: "Test World",
      testWorldId: "test-world", // Nom du dossier dans data/Data/worlds/, utilisé pour relancer le monde via l'API POST /setup (action launchWorld)
      expectedSystemVersion,
      // Joueur du monde de test, avec la permission « Créer des acteurs ».
      testPlayerName: "Player1",
    },
    setupNodeEvents() {
      // Aucun plugin nécessaire.
    },
  },
});
