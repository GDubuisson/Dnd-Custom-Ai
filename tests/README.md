# Tests

Suite de tests pour le système `dnd-custom-ai`. Usage développement uniquement : `package.json`,
`node_modules/` et `tests/` ne sont jamais inclus dans l'archive livrée (cf.
`.github/workflows/release.yml`, qui ne zippe que `system.json scripts styles templates lang
assets packs`) — le système reste 100% vanilla JS chargé directement par Foundry, sans étape de
build (cf. `ClaudeFiles/PROJECT.md`).

## Installation (une fois)

```
npm install
npx playwright install chromium   # nécessaire uniquement pour les tests visuels
```

## Lancer les tests

```
npm test          # logique métier + cohérence des données + i18n + structure des templates (rapide, ~0.1s)
npm run test:visual   # rendu réel dans Chromium headless (layout/chevauchement) — plus lent (~1-2s)
npm run test:all      # les deux
```

## Organisation

- `tests/unit/` — fonctions pures de `scripts/helpers/rules.js` (CA, PV max, capacité de
  charge, pool de sorts...), `CharacterData#prepareDerivedData` (appelée directement sur des
  fixtures, sans passer par le pipeline Document/DataModel complet de Foundry — inutile pour
  ce qu'on teste ici) et `grantClassContent` (attribution auto de Capacités/Sorts).
- `tests/data/` — cohérence des données de jeu (`config.js`, `origins.json`, `spell-slots.json`,
  `world-items/*.json`) entre elles, et couverture i18n : chaque clé `DND_CUSTOM.*` référencée
  dans le JS/les templates doit exister dans **les deux** `lang/*.json`. C'est ce dernier test
  qui aurait attrapé le bug réel `DND_CUSTOM.Chat.ClassContentGranted` (clé posée par erreur
  sous `Wizard`, jamais détecté avant l'exécution en jeu).
- `tests/dom/` — compile les vrais `.hbs` avec le vrai Handlebars + nos vrais helpers (cf.
  `tests/support/handlebars-env.js`), vérifie la structure du HTML produit via jsdom (présence
  d'éléments/attributs). Ne vérifie **pas** le rendu visuel.
- `tests/visual/` — seule couche capable d'attraper les bugs de layout CSS (élément qui retombe
  à la ligne, cases qui se chevauchent, défilement qui ne s'active pas) : charge le vrai CSS
  système dans un vrai Chromium (Playwright) et mesure les positions réellement calculées. Un
  test volontairement désactivé puis réactivé a confirmé que chacun des 3 tests visuels actuels
  échoue bien si le correctif CSS correspondant est retiré (pas des tests qui passent "par
  hasard" quoi qu'il arrive).
- `tests/support/` — fixtures et infrastructure partagées (stub minimal de l'API Foundry,
  chargement des vrais fichiers `lang/*.json`/`origins.json`/`spell-slots.json`, environnement
  Handlebars, page HTML autonome pour les tests visuels).

## Limites connues

- Rien dans `tests/unit`, `tests/data`, `tests/dom` et `tests/visual` ne remplace un test en
  conditions réelles dans Foundry (permissions, synchronisation multi-client, ActiveEffects,
  Combat Tracker...) : cette suite couvre les calculs, la cohérence des données, le câblage
  template/contexte et le layout CSS isolé — pas l'intégration complète avec le client Foundry.
  Voir "Tests au réel" ci-dessous pour cette couche.
- Le test visuel "Attaque/Dégâts" simule une approximation minimale (et non extraite du code
  source de Foundry, absent de ce repo) du reset de `<button>` du cœur Foundry, reconstruite à
  partir du bug observé — pas une copie fidèle garantie à 100 %.

## Tests "au réel" (Docker + Cypress + Quench)

Couche complémentaire qui comble la limite ci-dessus : lance une vraie instance Foundry VTT
dans Docker et teste le vrai client (E2E via Cypress) et le vrai pipeline Document/DataModel
(intégration via Quench), plutôt que des fixtures isolées. Détail de la démarche d'origine :
`ClaudeFiles/testing/SETUP_TESTING.md` (gitignored, non versionné).

### Prérequis (manuels, non automatisables depuis une session Claude Code)

1. **Docker Desktop** installé et lancé.
2. **Une licence Foundry VTT** valide (l'image `felddy/foundryvtt` doit soit télécharger le
   logiciel avec vos identifiants, soit trouver une install manuelle dans `./data`).
3. Copier `.env.example` en `.env` et renseigner `FOUNDRY_ADMIN_KEY` (libre) et
   `FOUNDRY_USERNAME`/`FOUNDRY_PASSWORD`/`FOUNDRY_LICENSE_KEY` (votre compte Foundry).
4. Un monde nommé **"Test World"** avec le système `dnd-custom-ai` actif, créé une fois à la
   main dans l'instance (`http://localhost:30001` après `npm run docker:up`) — persiste ensuite
   dans `./data` (gitignored). Foundry ne propose pas de création de monde via une simple
   requête HTTP (formulaire multi-étapes), donc ce n'est pas scriptable simplement.
5. Un utilisateur **Joueur** (nommé "Player1" par défaut, cf. `Cypress.env("testPlayerName")`
   dans `cypress.config.js`) créé une fois dans ce monde (Configurer les joueurs), avec la
   permission **"Créer des acteurs"** accordée (Configuration du monde > Permissions) — requis
   par `cypress/e2e/wizard.cy.js`, qui teste l'assistant de création en tant que Joueur
   propriétaire (convention par défaut de `tests/E2E_TEST_PLAN.md`), pas seulement en tant que
   MJ comme le reste de cette couche jusqu'ici.

### Installation et lancement

```
npm install                # installe aussi cypress, @testing-library/cypress, husky, wait-on
npm run e2e:fetch-quench   # télécharge le vrai module Quench (le paquet npm @ethaks/fvtt-quench
                            # ne fournit que des types TS, pas le module exécutable) dans
                            # .quench-module/ (gitignored) — à relancer pour mettre à jour Quench
npm run docker:up          # lance l'instance Foundry de test (docker-compose.yml)
npm run test:e2e:open      # Cypress en mode interactif, une fois le monde de test créé (étape 4)
npm run test:e2e:run       # Cypress en mode terminal
npm run docker:down        # arrête l'instance
```

`npm run test:e2e:full` enchaîne `docker:up` + attente du port 30001 + `test:e2e:run` +
`docker:down` — utile une fois le monde de test déjà créé (n'automatise pas sa création).

### Organisation

- `docker-compose.yml` — instance Foundry isolée ; ne monte que les chemins réellement livrés
  par `.github/workflows/release.yml` (`system.json`, `scripts`, `styles`, `templates`, `lang`,
  `assets`, `packs`, `world-items`), plus le module Quench et `tests/quench/`.
- `cypress.config.js`, `cypress/` — tests E2E contre le vrai client (`cypress/e2e/
  system-load.cy.js` : connexion admin + chargement du monde de test ; `cypress/e2e/quench.cy.js` :
  déclenche les tests d'intégration Quench ; `cypress/e2e/wizard.cy.js` : section 1 de
  `tests/E2E_TEST_PLAN.md`, assistant de création de personnage — T-WIZ-001 à T-WIZ-018,
  en session Joueur sauf T-WIZ-013 qui teste explicitement le comportement MJ).
- `tests/E2E_TEST_PLAN.md` — plan de tests d'interface (assistant de création, fiche personnage,
  montée de niveau, NPC, véhicule, Items, glisser-déposer...) écrit avant leur implémentation.
  Sa section 1 (assistant de création) est codée (`cypress/e2e/wizard.cy.js` +
  `tests/quench/quench-tests.js`, batch `dndCustomAi.wizard`) ; les sections 2 à 16 restent
  **à coder**.
- `tests/quench/` — module Foundry autonome (jamais livré avec le système, cf. son
  `module.json` non référencé par `system.json`) enregistrant des tests d'intégration Quench
  (`quench-tests.js`, batches `dndCustomAi.actorCreation` et `dndCustomAi.wizard`) qui tournent
  dans le vrai pipeline Document/DataModel.
- `.github/workflows/test.yml` — CI équivalente ; nécessite 3 secrets de dépôt
  (`FOUNDRY_USERNAME`, `FOUNDRY_PASSWORD`, `FOUNDRY_LICENSE_KEY`) non configurés par ce
  fichier — le job échoue tant qu'ils ne sont pas ajoutés dans Settings > Secrets and
  variables > Actions. Limite connue : `./data` repart vide à chaque run CI (pas de volume
  persistant entre jobs), donc le test "charge le monde de test" de `system-load.cy.js`
  échouera en CI tant qu'une étape de création/import automatique du monde n'est pas ajoutée
  — non couvert par cette mise en place initiale.

### Limites connues de cette couche

- Mise en place le 2026-08-14 sans accès à Docker dans l'environnement d'exécution : la
  configuration (fichiers, scripts, module Quench réellement téléchargé et vérifié) est
  fonctionnelle sur le papier, mais **aucun test E2E/Quench n'a pu être réellement exécuté**
  contre une instance Foundry vivante. Les sélecteurs DOM de `system-load.cy.js` sont donc à
  vérifier/ajuster au premier lancement réel.
- Même limite pour `cypress/e2e/wizard.cy.js` et le batch Quench `dndCustomAi.wizard` (écrits le
  2026-08-15, toujours sans accès à Docker) : en particulier la zone de notifications
  (sélecteur `.notification`), le bouton de fermeture de fenêtre AppV2 (`[data-action="close"]`
  dans `.window-header`) et le nom du hook `closeCharacterCreationWizard` (utilisé par
  `submitWizardForm` dans `quench-tests.js` pour savoir quand une soumission valide est
  terminée) sont écrits d'après les conventions Foundry v13/14 usuelles, jamais vérifiés en
  conditions réelles.
- Nécessite une licence Foundry VTT payante — pas de mode démo/gratuit pour l'image Docker.
