// Configuration Cypress pour les tests E2E "au réel" contre une instance Foundry VTT lancée
// via Docker (cf. docker-compose.yml + tests/README.md). Complète la
// suite tests/ (unitaire/data/dom/visuel, cf. tests/README.md) sans la remplacer : ici on
// teste le vrai client Foundry, pas des fixtures isolées.
// `package.json` déclare "type": "module" (cf. tests/run.js) : ce fichier doit rester en
// syntaxe ESM (import/export), pas require/module.exports (CommonJS), sous peine d'erreur
// "require is not defined" au chargement par Cypress.
import { defineConfig } from "cypress";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dns from "node:dns";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Résolution DNS de "localhost" : gardée en tentative de mitigation (cf. historique ci-dessous),
// mais s'est révélée INSUFFISANTE à elle seule le 2026-08-16 — `dns.setDefaultResultOrder`
// n'affecte que la résolution DNS de hostnames, or le processus Cypress a continué à échouer
// ("socket hang up") avec `baseUrl` en hostname MÊME AVEC ce réglage actif, alors qu'un `curl`
// simultané vers `http://localhost:30001/` réussissait sans problème et que forcer `baseUrl` en
// adresse LITTÉRALE IPv6 (`http://[::1]:30001`, cf. plus bas) a immédiatement résolu le
// problème. Diagnostic exact non élucidé (comportement de résolution DNS spécifique au
// sous-processus Cypress, différent de celui de Node "nu" testé via `node -e "fetch(...)"`, qui
// lui réussissait) — plutôt que de continuer à chasser ce mécanisme, `baseUrl` contourne
// maintenant la résolution DNS entièrement (voir plus bas), rendant ce réglage best-effort.
dns.setDefaultResultOrder("ipv6first");

// Historique (résumé, cf. [[project_docker_e2e_testing_setup]] pour le détail complet) : la
// fiabilité IPv4 vs IPv6 du transfert de port Docker Desktop sur cette machine s'est déjà
// inversée au moins 3 fois entre le 2026-08-14 et le 2026-08-16. Si "socket hang up"/"Empty
// reply from server" réapparaît malgré `baseUrl` en adresse littérale ci-dessous : retester les
// deux familles (`curl -4`/`curl -6 http://localhost:30001/`, `curl "http://[::1]:30001/"`,
// `curl -4 http://127.0.0.1:30001/`) AVANT de supposer que `[::1]` est encore la bonne adresse —
// si IPv4 redevient la famille fiable, remplacer `[::1]` par `127.0.0.1` ci-dessous.

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
    // Adresse IPv6 littérale (pas un hostname) : contourne complètement la résolution DNS,
    // dont le comportement s'est avéré peu fiable pour le processus Cypress lui-même (cf.
    // dns.setDefaultResultOrder ci-dessus). Un futur retournement de la famille IPv4/IPv6
    // fiable côté Docker Desktop se corrige à un seul endroit (cette ligne).
    baseUrl: "http://[::1]:30001", // Port mappé par docker-compose.yml
    supportFile: "cypress/support/e2e.js",
    specPattern: "cypress/e2e/**/*.cy.{js,jsx,ts,tsx}",
    video: true, // Enregistre les échecs en vidéo
    screenshotOnRunFailure: true,
    // Foundry refuse de fonctionner correctement sous 1024x768 et affiche une notification
    // d'erreur PERMANENTE ("Foundry Virtual Tabletop requires usable window dimensions of
    // 1024px by 768px or greater") qui reste ensuite affichée par-dessus toute la page — au
    // premier run réel (2026-08-15), le viewport par défaut de Cypress (1000x660) déclenchait
    // ça et la notification finissait par recouvrir des boutons cliqués par des tests plus
    // tard dans la même session (cf. T-WIZ-018, wizard.cy.js). Marge au-delà du minimum requis.
    viewportWidth: 1280,
    viewportHeight: 800,
    defaultCommandTimeout: 10000, // Foundry peut être lent à charger
    requestTimeout: 10000,
    responseTimeout: 30000,
    env: {
      adminKey: "test-admin-key", // Doit correspondre à FOUNDRY_ADMIN_KEY dans docker-compose.yml
      systemId: "dnd-custom-ai",
      testWorld: "Test World",
      testWorldId: "test-world", // Nom du dossier dans data/Data/worlds/, utilisé pour relancer le monde via l'API POST /setup (action launchWorld)
      expectedSystemVersion,
      // Utilisateur Joueur (non-GM) du monde de test, requis par cypress/e2e/wizard.cy.js — la
      // majorité des scénarios de l'assistant de création s'exécutent en tant que Joueur, pas
      // MJ (cf. tests/E2E_TEST_PLAN.md > Conventions). Doit exister dans le monde de test
      // (Configurer les joueurs) ET avoir la permission "Créer des acteurs" accordée
      // (Configuration du monde > Permissions), sans quoi Actor.create() échoue côté serveur
      // pour ce rôle — nouveau prérequis, cf. tests/README.md.
      testPlayerName: "Player1",
    },
    setupNodeEvents(on, config) {
      // Rien à brancher pour l'instant (pas de plugin/tâche custom nécessaire).
    },
  },
});
