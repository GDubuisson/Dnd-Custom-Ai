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
import dns from "node:dns";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Résolution DNS de "localhost" ici, PAS le choix IPv4/IPv6 lui-même : diagnostiqué le
// 2026-08-15 sur cette machine, situation inverse de celle documentée ci-dessous pour baseUrl
// (::1 fonctionnait, 127.0.0.1 renvoyait "Empty reply from server"/"socket hang up" — l'exact
// opposé du problème résolu le 2026-08-14). Cause réelle : l'ordre par défaut de
// dns.lookup("localhost") sous Node (pas Windows Defender, ni un antivirus, ni un proxy —
// écartés un par un) renvoyait l'adresse IPv4 en premier sans se rabattre sur IPv6 en cas
// d'échec (contrairement à curl/navigateurs qui font un vrai Happy Eyeballs), donc `baseUrl`
// en hostname échouait même quand IPv6 fonctionnait très bien. `dns.setDefaultResultOrder`
// est l'API Node équivalente au flag CLI `--dns-result-order`, utilisable ici (contrairement à
// NODE_OPTIONS, qu'il faut fixer avant le démarrage du process). **Ce comportement s'est déjà
// inversé une fois entre le 2026-08-14 et le 2026-08-15 sur cette même machine (fiabilité
// IPv4 vs IPv6 du transfert de port Docker Desktop) : si "socket hang up" ou "Empty reply from
// server" réapparaît, retester les deux familles avant de supposer que ce réglage est encore le
// bon** (cf. [[project_docker_e2e_testing_setup]] pour la méthode de diagnostic complète : curl
// + `node -e "fetch(...)"` sur les deux adresses, comparés au comportement de Cypress).
dns.setDefaultResultOrder("ipv6first");

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
    // "localhost" (pas une IP littérale) : cf. dns.setDefaultResultOrder ci-dessus, qui décide
    // désormais de la famille IPv4/IPv6 réellement utilisée — un futur changement de ce
    // comportement Docker Desktop se corrige à un seul endroit (l'appel dns), pas ici.
    baseUrl: "http://localhost:30001", // Port mappé par docker-compose.yml
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
