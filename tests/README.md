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

- Rien ici ne remplace un test en conditions réelles dans Foundry (permissions, synchronisation
  multi-client, ActiveEffects, Combat Tracker...) : cette suite couvre les calculs, la
  cohérence des données, le câblage template/contexte et le layout CSS isolé — pas l'intégration
  complète avec le client Foundry.
- Le test visuel "Attaque/Dégâts" simule une approximation minimale (et non extraite du code
  source de Foundry, absent de ce repo) du reset de `<button>` du cœur Foundry, reconstruite à
  partir du bug observé — pas une copie fidèle garantie à 100 %.
