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
  en session Joueur sauf T-WIZ-013 qui teste explicitement le comportement MJ ;
  `cypress/e2e/character-sheet.cy.js` : section 2, en-tête et navigation de la fiche personnage
  — T-SHEET-001 à T-SHEET-008, sur un personnage complet partagé entre les tests plutôt que
  recréé à chaque fois ; `cypress/e2e/tab-stats.cy.js` : section 3, onglet Statistiques —
  T-STATS-001 à T-STATS-022 (jets de dés, repos, Initiative, états/Exhaustion, Agonie/jets de
  sauvegarde de la mort), T-STATS-012 volontairement rouge — cf. bug connu ci-dessous ;
  `cypress/e2e/tab-equipment.cy.js` : section 4, onglet Équipement — T-EQUIP-001 à T-EQUIP-005
  (emplacements main principale/secondaire/armure/accessoires, arme à deux mains, bascule
  Polyvalente), avec une fixture Item minimale pour l'emplacement "accessory" qu'aucun Item
  livré avec le système n'utilise ; `cypress/e2e/tab-inventory.cy.js` : section 5, onglet
  Inventaire — T-INV-001 à T-INV-010 (deux tableaux distincts, poids porté/capacité de charge,
  jets d'attaque/dégâts d'arme — dont les boutons vivent en réalité sur l'onglet Équipement, pas
  l'Inventaire, cf. commentaire d'en-tête du fichier —, objets soin/lumière/outil) ;
  `cypress/e2e/tab-abilities.cy.js` : section 6, onglet Capacités/Sorts — T-ABIL-001 à
  T-ABIL-020 (en-tête par classe, jets/charges/réserves de Capacité, Sentinelle, emplacements
  de sorts, Incantation rituelle, concentration, sort d'attaque/dégâts/lumière, économie de
  réaction), toutes les Capacités/tous les Sorts octroyés directement depuis leur compendium
  (cf. bug connu ci-dessous — grantClassContent ne peut pas servir ici) ; `cypress/e2e/
  tab-journal.cy.js` : section 7, onglet Journal — T-JOURNAL-001 (langues connues, Commune +
  langue d'Origine, triées alphabétiquement) et T-JOURNAL-002 (ajout manuel d'une langue
  "special", ex. "Argot des rues" — jamais auto-octroyée quelle que soit l'Origine, cf.
  world-items/languages.json — glissée depuis le compendium Langues en simulant un vrai
  DragEvent/DataTransfer dispatché sur la racine de la fiche, pas de dragover à simuler pour un
  drop synthétique) ; `cypress/e2e/level-up.cy.js` : section 8, montée de niveau — T-LVL-001 à
  T-LVL-003/005 à T-LVL-012 (un seul niveau par clic, PV recalculés/remplis, accessible au
  Joueur, pas de message parasite si rien d'octroyé, choix de sous-classe au bon niveau + pas de
  re-proposition + sélecteur d'en-tête en secours, choix Amélioration de caractéristiques/Don
  proposé aux bons niveaux et appliqué), boîtes `DialogV2` pilotées via leurs vrais sélecteurs
  (`dialog.application.dialog`, boutons `data-action="asi"/"feat"/"ok"/"close"`) — **T-LVL-004
  volontairement rouge**, même bug que T-STATS-012 ci-dessous (`grantClassContent` appelé par
  `#onLevelUp`) ; `cypress/e2e/reference-sheets.cy.js` : section 9, fiches de référence Classe/
  Sous-classe/Origine — T-REF-002 à T-REF-004 (ouverture de la fiche de Sous-classe, ouverture de
  la fiche d'Origine, avertissement non bloquant `OriginSheetMissing` si l'Item de référence est
  introuvable — supprimé/restauré en session MJ dans le compendium `origines`, seule permission
  requise pour ce scénario, cf. `ownership` du pack dans `system.json`) — **T-REF-001
  volontairement rouge**, 3e manifestation du même bug de locale (`#onOpenClassSheet`, cf.
  "Bug connu" plus bas). `cypress/
  support/e2e.js` fournit `cy.loginAsPlayer()`/`cy.loginAsGM()`,
  `cy.createReadyCharacter()` (crée un Actor et termine l'assistant pour lui — réutilisable
  par toute future spec de section n'ayant pas besoin de tester l'assistant lui-même),
  `cy.openActorSheet()` et `cy.forceD20(face)` (force le résultat du PROCHAIN d20, via
  `CONFIG.Dice.randomUniform` — Foundry n'utilise PAS `Math.random()` pour ses jets).
- `tests/E2E_TEST_PLAN.md` — plan de tests d'interface (assistant de création, fiche personnage,
  montée de niveau, NPC, véhicule, Items, glisser-déposer...) écrit avant leur implémentation.
  Sections codées : 1 (assistant de création, `cypress/e2e/wizard.cy.js` +
  `tests/quench/quench-tests.js` batch `dndCustomAi.wizard`), 2 (en-tête/navigation de la
  fiche, `cypress/e2e/character-sheet.cy.js`, pas de volet Quench — tous ses scénarios sont
  marqués "E2E" seul dans le plan), 3 (onglet Statistiques, `cypress/e2e/tab-stats.cy.js`),
  4 (onglet Équipement, `cypress/e2e/tab-equipment.cy.js`, pas de volet Quench non plus),
  5 (onglet Inventaire, `cypress/e2e/tab-inventory.cy.js`, pas de volet Quench non plus malgré
  T-INV-002/003/006/009 marqués "E2E+Quench" dans le plan — les vérifier une fois en E2E contre
  le vrai pipeline suffit, pas besoin d'un doublon Quench isolé pour ces calculs-là) et
  6 (onglet Capacités/Sorts, `cypress/e2e/tab-abilities.cy.js` + `tests/quench/quench-tests.js`
  batch `dndCustomAi.combatReaction` pour T-ABIL-021, seul scénario marqué "Quench" seul) et
  7 (onglet Journal, `cypress/e2e/tab-journal.cy.js`, pas de volet Quench) et 8 (montée de
  niveau, `cypress/e2e/level-up.cy.js`, pas de volet Quench malgré plusieurs scénarios marqués
  "E2E+Quench"/"Quench" dans le plan — `#onLevelUp` est une méthode privée d'`actor-sheet.js`,
  inatteignable directement depuis Quench, même limite déjà documentée pour
  `#grantStartingEquipment`, cf. `tests/quench/quench-tests.js` > `submitWizardForm`) et 9
  (fiches de référence Classe/Sous-classe/Origine, `cypress/e2e/reference-sheets.cy.js`, pas de
  volet Quench).
  Sections 10 à 16 restent **à coder**.
- **Bug connu (non corrigé)** : toute comparaison entre un libellé de classe/sous-classe
  LOCALISÉ (`game.i18n.localize(DND_CUSTOM.classes[...]/.subclasses[...])`) et un nom d'Item
  codé en dur en FRANÇAIS dans `world-items/*.json` échoue systématiquement sous un monde dont
  la langue n'est pas le français — deux manifestations connues à ce jour, même cause :
  - `grantClassContent` (`scripts/helpers/class-content.js`) ne donne jamais de Capacité/Sort
    propre à la classe (seules les Capacités "universelles", ex. Attaque d'opportunité, passent).
    Touche l'assistant de création ET la montée de niveau. Découvert le 2026-08-15 en écrivant
    T-STATS-012 (`tab-stats.cy.js`), laissé volontairement rouge (même consigne que T-WIZ-010) —
    cf. mémoire projet pour la piste de correction. T-LVL-004 (`level-up.cy.js`, section 8)
    l'illustre aussi côté montée de niveau.
  - `#onOpenClassSheet` (`scripts/sheets/actor-sheet.js`) ne trouve jamais la fiche de
    description d'une Classe (avertissement `ClassSheetMissing` non bloquant à la place) —
    découvert le 2026-08-16 en écrivant T-REF-001 (`reference-sheets.cy.js`, section 9), laissé
    volontairement rouge pour la même raison. `#onOpenSubclassSheet`/`#onOpenOriginSheet` n'y
    sont PAS soumis : les sous-classes ont des noms français qui coïncident avec l'anglais pour
    les cas testés (ex. "Champion"), et l'Origine ne passe jamais par `game.i18n.localize` (son
    libellé vient directement de `scripts/data/origins.json`, déjà dans la bonne langue).
- `tests/quench/` — module Foundry autonome (jamais livré avec le système, cf. son
  `module.json` non référencé par `system.json`) enregistrant des tests d'intégration Quench
  (`quench-tests.js`, batches `dndCustomAi.actorCreation`, `dndCustomAi.wizard` et
  `dndCustomAi.combatReaction`) qui tournent
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
