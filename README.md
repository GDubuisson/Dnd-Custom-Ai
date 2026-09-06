# dnd-custom-ai — D&D Custom : Origines

Système de jeu **Foundry VTT** basé sur les règles **D&D 5e (SRD 5.1)**, avec une seule race
jouable (Humain) dont les traits culturels et mécaniques varient selon un système d'**Origines**
géographiques inspirées de nations réelles — à la place des races classiques.

> Dépôt de développement. Pour la présentation orientée joueur/MJ, voir les Journaux
> **« Guide du Joueur »** et **« Guide du MJ »** générés automatiquement dans chaque monde qui
> active le système.

---

## Statut

| | |
|---|---|
| Version | `0.64.x` — pré-1.0, voir [`CHANGELOG.md`](CHANGELOG.md) |
| Compatibilité | Foundry VTT **v14** (minimum et vérifié) |
| Périmètre fonctionnel | complet — aucune anomalie ouverte (cf. [`ClaudeFiles/ANOMALIES_ACTIVES.md`](ClaudeFiles/ANOMALIES_ACTIVES.md)) |
| Tests | `npm test` (≈ 890 tests unitaire / données / DOM) au vert · couche E2E « au réel » (Docker + Cypress + Quench), une spec par mécanique de jeu |
| Langues | Français, Anglais (parité de clés i18n vérifiée en test) |

Ce qui reste avant un tag `1.0.0` est listé en fin de ce fichier ([Route vers la 1.0.0](#route-vers-la-100)).

---

## Documentation

| Document | Contenu |
|---|---|
| [`ClaudeFiles/CONCEPTION_FONCTIONNELLE.md`](ClaudeFiles/CONCEPTION_FONCTIONNELLE.md) | Le **quoi** : périmètre, mapping des Origines, spécification de la fiche de personnage, règles fonctionnelles, contenu de classes/sous-classes |
| [`ClaudeFiles/CONCEPTION_TECHNIQUE.md`](ClaudeFiles/CONCEPTION_TECHNIQUE.md) | Le **comment** : stack et bornes strictes, arborescence commentée, conventions de code, pièges connus, architecture des hooks / du relais MJ / de la résolution des dégâts |
| [`ClaudeFiles/ANOMALIES_ACTIVES.md`](ClaudeFiles/ANOMALIES_ACTIVES.md) | Chantiers **restants** uniquement (bugs / dette technique) — l'historique complet est dans `git log` et le `CHANGELOG` |
| [`tests/README.md`](tests/README.md) | Détail de toutes les couches de test et **prérequis complets** de la couche E2E |
| [`tests/E2E_TEST_PLAN.md`](tests/E2E_TEST_PLAN.md) | Plan de scénarios d'interface (les 16 sections initiales + section 17) |
| [`CHANGELOG.md`](CHANGELOG.md) | Historique des changements notables (format *Keep a Changelog*, SemVer) |
| [`assets/icons/MISSING.md`](assets/icons/MISSING.md) | État des icônes câblées + note de licence sur les icônes tierces |

**Lire `CONCEPTION_TECHNIQUE.md` et `CONCEPTION_FONCTIONNELLE.md` avant toute intervention.** Les
invariants (pas de build, vanilla ES modules, `ActorSheetV2`/`ItemSheetV2`, DataModels JS sans
`template.json`, données de jeu 100 % externalisées en JSON, API Foundry officielle uniquement) et
l'arborescence commentée y sont détaillés — non repris ici pour éviter la divergence.

---

## Développement — tests

Toutes les commandes sont dans `package.json`. Node **20** recommandé (version de la CI).

### Suite rapide (isolée de Foundry)

```bash
npm install
npm test                    # logique métier + cohérence des données + i18n + structure des templates (~0,1 s)
npm run test:visual         # rendu réel dans Chromium headless (layout/chevauchement) — nécessite : npx playwright install chromium
npm run test:all            # les deux
```

Détail des couches (`tests/unit`, `tests/data`, `tests/dom`, `tests/visual`) dans
[`tests/README.md`](tests/README.md).

### Tests E2E « au réel » (Docker + Cypress + Quench)

Lance une vraie instance Foundry VTT dans Docker et teste le vrai client (Cypress) et le vrai
pipeline Document/DataModel (Quench). **Couche manuelle / locale uniquement** — jamais en CI
(voir plus bas). Chaque nouveau chantier de mécanique de jeu est validé par une spec Cypress
dédiée dans cette couche.

**Prérequis** (détail complet et dépannage : [`tests/README.md`](tests/README.md) § « Tests au réel ») :

1. **Docker Desktop** installé et lancé.
2. Une **licence Foundry VTT** valide (payante — pas de mode démo pour l'image Docker).
3. `cp .env.example .env` puis renseigner `FOUNDRY_ADMIN_KEY` (libre) et
   `FOUNDRY_USERNAME` / `FOUNDRY_PASSWORD` / `FOUNDRY_LICENSE_KEY` (compte Foundry).
4. **Une seule fois**, dans l'instance (`http://localhost:30001` après `docker:up`) : créer un
   monde nommé **« Test World »** avec le système `dnd-custom-ai` actif, un utilisateur **MJ** et
   un utilisateur **Joueur** (« Player1 ») avec la permission *« Créer des acteurs »*. Ce monde
   persiste ensuite dans `./data/` (gitignored).

**Lancement :**

```bash
npm run e2e:fetch-quench    # (une fois, puis pour mettre à jour) récupère le module Quench dans .quench-module/
npm run docker:up           # démarre l'instance de test
npm run test:e2e:open       # Cypress interactif
npm run test:e2e:run        # Cypress en terminal (--browser chrome)
npx cypress run --browser chrome --spec "cypress/e2e/<fichier>.cy.js"   # une spec ciblée
```

**Cycle de fin de session :** préférer `docker compose stop` à `npm run docker:down`. Recréer le
conteneur (`down` puis `up`) **invalide la signature de licence Foundry** et impose de réaccepter
le CLUF manuellement. Si le monde de test se désactive entre deux sessions, le relancer via
l'API (`POST /auth` puis `POST /setup {"action":"launchWorld","world":"test-world"}`) plutôt que
de recréer le conteneur. `docker-compose.yml` ne monte que les chemins réellement livrés par la
release.

---

## Intégration continue et release

- **`.github/workflows/test.yml`** — sur chaque `push` / `pull_request` : `npm ci` + `npm test`
  (Node 20). La couche E2E n'y tourne pas : `./data` repart vide à chaque run (pas de volume
  persistant), donc Foundry devrait être réinstallé en entier, et aucun monde/utilisateur de
  test n'existe dans un environnement éphémère. Décision explicite plutôt qu'un job
  systématiquement rouge.
- **`.github/workflows/release.yml`** — `workflow_dispatch` manuel : lit `version` dans
  `system.json`, tague `vX.Y.Z`, construit et publie `system.zip`. Procédure et règle de bump
  détaillées dans [`CONCEPTION_TECHNIQUE.md`](ClaudeFiles/CONCEPTION_TECHNIQUE.md) §
  « Versionnage et publication ».

---

## Licence

- **Code, données de règles et contenu narratif original** : Creative Commons
  **CC BY-NC-SA 4.0** (usage non commercial, attribution, partage à l'identique) — voir
  [`LICENSE`](LICENSE).
- **Contenu adapté du SRD 5.1** de Dungeons & Dragons : sous licence **CC-BY-4.0** de Wizards of
  the Coast (attribution dans `LICENSE`).
- **Icônes tierces** : une partie des icônes de `assets/icons/` provient de sources dont la
  licence n'est pas confirmée libre de droit — d'où le passage du dépôt en privé après la release
  publique finale (cf. [`assets/icons/MISSING.md`](assets/icons/MISSING.md)).

---

## Route vers la 1.0.0

- [ ] **Licence des icônes tierces** — le dépôt passe **privé** après la release publique finale
      (décision prise) ; c'est cet événement qui règle la question, pas un remplacement des icônes.
- [ ] `[Non publié]` → `[1.0.0]` dans le `CHANGELOG` au moment du tag.
- [x] `README.md` à la racine · champs `readme` / `media` dans `system.json` · `compatibility.minimum` = `"14"` · `.idea/` et `maquettes/` sortis du suivi git.
- [x] Découpe de `scripts/sheets/actor-sheet.js` (2801 → ~1240 l.) en 5 mixins et de
      `scripts/dnd-custom-ai.js` (813 → ~300 l.) en 5 modules de hooks.
