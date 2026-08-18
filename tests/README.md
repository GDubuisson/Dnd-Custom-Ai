# Tests

Suite de tests pour le système `dnd-custom-ai`. Usage développement uniquement : `package.json`,
`node_modules/` et `tests/` ne sont jamais inclus dans l'archive livrée (cf.
`.github/workflows/release.yml`, qui ne zippe que `system.json scripts styles templates lang
assets packs`) — le système reste 100% vanilla JS chargé directement par Foundry, sans étape de
build (cf. `ClaudeFiles/CONCEPTION_TECHNIQUE.md`).

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
(intégration via Quench), plutôt que des fixtures isolées.

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
  T-ABIL-021 (en-tête par classe, jets/charges/réserves de Capacité, Sentinelle, emplacements
  de sorts, Incantation rituelle, concentration, sort d'attaque/dégâts/lumière, économie de
  réaction), toutes les Capacités/tous les Sorts octroyés directement depuis leur compendium
  (cf. bug connu ci-dessous — grantClassContent ne peut pas servir ici), plus T-ABIL-022/023
  (langues connues, déplacées depuis l'onglet Journal le 2026-08-16 — retour de test, cf.
  describe dédié en fin de fichier : Commune + langue d'Origine triées alphabétiquement, ajout
  manuel d'une langue "special" par glisser-déposer depuis le compendium Langues, ex. "Argot des
  rues" — jamais auto-octroyée quelle que soit l'Origine, cf. world-items/languages.json,
  DragEvent/DataTransfer synthétique dispatché sur la racine de la fiche) ; `cypress/e2e/
  tab-journal.cy.js` : section 7, onglet Journal — T-JOURNAL-001/002 (champs Biographie/Notes,
  ProseMirror, édition + persistance après perte de focus ; contenu redéfini le 2026-08-16 après
  le déplacement des langues vers l'onglet Capacités ci-dessus) ; `cypress/e2e/level-up.cy.js` : section 8, montée de niveau — T-LVL-001 à
  T-LVL-003/005 à T-LVL-012 (un seul niveau par clic, PV recalculés/remplis, accessible au
  Joueur, pas de message parasite si rien d'octroyé, choix de sous-classe au bon niveau + pas de
  re-proposition + sélecteur d'en-tête en secours, choix Amélioration de caractéristiques/Don
  proposé aux bons niveaux et appliqué), boîtes `DialogV2` pilotées via leurs vrais sélecteurs
  (`dialog.application.dialog`, boutons `data-action="asi"/"feat"/"ok"/"close"`) — T-LVL-004
  a longtemps été volontairement rouge (bug de locale sur `grantClassContent`, appelé par
  `#onLevelUp` — cf. "Bug connu — CORRIGÉ" plus bas), corrigé et vert depuis le 2026-08-16 ;
  `cypress/e2e/reference-sheets.cy.js` : section 9, fiches de référence Classe/Sous-classe/
  Origine — T-REF-001 à T-REF-004 (ouverture des fiches de Classe/Sous-classe/Origine par clé
  stable, avertissement non bloquant `OriginSheetMissing` si l'Item de référence est introuvable
  — supprimé/restauré en session MJ dans le compendium `origines`, seule permission requise pour
  ce scénario, cf. `ownership` du pack dans `system.json`) ; `cypress/e2e/npc-sheet.cy.js` :
  section 10, fiche PNJ — T-NPC-001 à
  T-NPC-005 (3 onglets, jet de caractéristique, bascule d'état, Initiative, octroi d'XP via
  `DialogV2`), toute la section en session MJ (un PNJ n'a normalement pas de propriétaire
  Joueur) ; `cypress/e2e/vehicle-sheet.cy.js` : section 11, fiche Véhicule — T-VEH-001 à
  T-VEH-003 (champs de base, barre de PV bornée, inventaire), session MJ également ;
  `cypress/e2e/item-sheets.cy.js` : section 12, fiches d'Item — T-ITEM-001 à T-ITEM-003
  (ouverture des 9 types sans erreur, édition d'un champ simple qui persiste, champ
  `damageVersatile.dice` qui apparaît seulement une fois "Polyvalente" cochée), session MJ (les
  types non physiques vivent en compendium, en écriture réservée au MJ) ; `cypress/e2e/
  drag-drop.cy.js` : section 13, glisser-déposer entre fiches — T-DND-001 à T-DND-003 (transfert
  entre deux Actors sans duplication, drop hors de toute fiche sans erreur, import compendium
  dupliqué localement), même technique DragEvent/DataTransfer synthétique que
  `tab-abilities.cy.js` > T-ABIL-023 ; `cypress/e2e/combat-tracker.cy.js` : section 14,
  intégration Combat Tracker — T-COMBAT-001 à T-COMBAT-003 (Combattant visible dans le DOM du
  tracker après un jet d'Initiative, réaction régénérée en avançant le tour via le VRAI bouton
  "Tour suivant" — complément E2E de T-ABIL-021/Quench, pas un doublon —, suppression du combat
  en cours sans casser la fiche) ; `cypress/e2e/permissions.cy.js` : section 15, permissions et
  champs verrouillés — T-PERM-001 à T-PERM-004 (implémentés en E2E, PAS en Quench comme suggéré
  par le plan : les batches Quench de cette suite tournent tous en session MJ, or le hook ne
  restreint QUE les non-MJ — un test Quench GM ne pourrait jamais exercer la restriction
  elle-même), y compris l'exception `dndCustomLevelUp` qui ne laisse passer QUE `level` même si
  `class` est posé dans le même update ; `cypress/e2e/i18n.cy.js` : section 16,
  internationalisation — T-I18N-001/002 adaptés (cf. commentaire d'en-tête du fichier) : plutôt
  que de basculer réellement la langue du monde (risque de rechargement client jugé
  disproportionné après les incidents Docker de cette session), balaie le texte affiché de la
  fiche personnage/l'assistant sous la locale déjà active (anglais) à la recherche de fuites de
  clé brute `DND_CUSTOM.*` ; `cypress/e2e/combat-criticals.cy.js` : section 17 (ajoutée le
  2026-08-16, hors 16 sections initiales, retour de test explicite) — T-CRIT-001 à 006, coups/
  échecs critiques sur 1/20 naturel (`rollCheck` > `criticalRules`, `scripts/helpers/rolls.js`)
  UNIQUEMENT pendant un combat actif, sur les jets d'attaque (arme/sort) et de sauvegarde ; dés
  de dégâts doublés sur un coup critique (`Roll#alter(2, 0)`, jamais le modificateur). Preuve
  "même avec des bonus" par CA délibérément extrême (999/1) combinée à `cy.forceD20` — pas
  utilisés ensemble jusque-là dans la suite. `cypress/
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
  `#grantStartingEquipment`, cf. `tests/quench/quench-tests.js` > `submitWizardForm`), 9
  (fiches de référence Classe/Sous-classe/Origine, `cypress/e2e/reference-sheets.cy.js`), 10
  (fiche PNJ, `cypress/e2e/npc-sheet.cy.js`), 11 (fiche Véhicule, `cypress/e2e/
  vehicle-sheet.cy.js`), 12 (fiches d'Item, `cypress/e2e/item-sheets.cy.js`), 13
  (glisser-déposer, `cypress/e2e/drag-drop.cy.js`), 14 (Combat Tracker, `cypress/e2e/
  combat-tracker.cy.js`), 15 (permissions, `cypress/e2e/permissions.cy.js`, en E2E malgré le
  plan qui suggère Quench — cf. détail plus haut) et 16 (internationalisation, `cypress/e2e/
  i18n.cy.js`, scénarios adaptés — cf. détail plus haut) et 17 (Combat — coups/échecs critiques,
  `cypress/e2e/combat-criticals.cy.js`, ajoutée le 2026-08-16 hors plan initial — cf. détail
  plus haut). **Les 16 sections du plan initial + la section 17 (retour de test) sont
  codées** (2026-08-16).
- **Bug connu — CORRIGÉ le 2026-08-16** : toute comparaison entre un libellé de classe/sous-classe
  LOCALISÉ (`game.i18n.localize(DND_CUSTOM.classes[...]/.subclasses[...])`) et un nom d'Item
  codé en dur en FRANÇAIS dans `world-items/*.json` échouait systématiquement sous un monde dont
  la langue n'est pas le français — deux manifestations connues, même cause :
  - `grantClassContent` (`scripts/helpers/class-content.js`) ne donnait jamais de Capacité/Sort
    propre à la classe (seules les Capacités "universelles", ex. Attaque d'opportunité,
    passaient). Touchait l'assistant de création ET la montée de niveau. Découvert le 2026-08-15
    en écrivant T-STATS-012 (`tab-stats.cy.js`), laissé volontairement rouge le temps de la
    session de tests (même consigne que T-WIZ-010) ; T-LVL-004 (`level-up.cy.js`, section 8)
    l'illustrait aussi côté montée de niveau.
  - `#onOpenClassSheet` (`scripts/sheets/actor-sheet.js`) ne trouvait jamais la fiche de
    description d'une Classe (avertissement `ClassSheetMissing` non bloquant à la place) —
    découvert le 2026-08-16 en écrivant T-REF-001 (`reference-sheets.cy.js`, section 9), laissé
    volontairement rouge pour la même raison. `#onOpenSubclassSheet`/`#onOpenOriginSheet` n'y
    étaient PAS soumis : les sous-classes ont des noms français qui coïncident avec l'anglais
    pour les cas testés (ex. "Champion"), et l'Origine ne passe jamais par `game.i18n.localize`
    (son libellé vient directement de `scripts/data/origins.json`, déjà dans la bonne langue).

  **Correction** (sur demande explicite de l'utilisateur, 2026-08-16) : le contenu de référence
  stocke désormais une CLÉ de classe/sous-classe stable (ex. `"fighter"`/`"champion"`,
  indépendante de toute langue) plutôt qu'un libellé localisé/traduit — comparer des clés est
  correct quelle que soit la langue active du monde, contrairement à comparer des chaînes
  traduites.
  - `FeatureData#class`/`#subclass` (`scripts/data/item-data.js`) : `StringField` avec
    `choices` contraintes aux clés de `DND_CUSTOM.classes`/l'union de `DND_CUSTOM.subclasses`.
  - `SpellData#classes` : `StringField` texte libre séparé par virgules → `SetField` de clés
    (ex. `{"sorcerer", "wizard"}`) — UI passée d'un champ texte à des cases à cocher
    (`item/spell-sheet.hbs`).
  - `ClassData` (`scripts/data/class-data.js`) : nouveaux champs `classKey`/`subclassKey`,
    partagés entre les types "class" et "subclass" — permettent à `#onOpenClassSheet`/
    `#onOpenSubclassSheet` de retrouver l'Item de référence par clé plutôt que par nom déduit
    d'un libellé traduit. UI : selects dédiés dans `item/class-sheet.hbs`.
  - `world-items/features.json`/`spells.json`/`classes.json`/`subclasses.json` migrés (script
    ponctuel, non conservé) : tous les libellés français en dur remplacés par leurs clés
    (`classKey`/`subclassKey` ajoutés pour classes/sous-classes). **Après toute recréation du
    monde de test/nettoyage des compendiums (`packs/*`), le premier login MJ doit lui-même
    d'abord VIDER les compendiums `classes`/`sous-classes`/`capacites`/`sorts`** (dédoublonnage
    par nom à l'import : un Item déjà présent avec l'ancien format n'est jamais mis à jour) avant
    de rappeler `game.dndCustomAi.importSystemContent()`, sans quoi le monde reste bloqué sur des
    données pré-migration.
  - `grantClassContent`/`#onOpenClassSheet`/`#onOpenSubclassSheet`/`isSpellAllowedForActor`
    (`inventory-drag-drop.js`) comparent désormais les clés directement, sans jamais appeler
    `game.i18n.localize()` pour la comparaison (uniquement pour l'affichage).
  - T-STATS-012/T-LVL-004/T-REF-001 sont la preuve directe de la correction (verts depuis).
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
