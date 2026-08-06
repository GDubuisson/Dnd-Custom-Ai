# Dnd-Custom-Ai

## Objectif global
Créer un système de jeu de rôle personnalisé pour Foundry Virtual TableTop (Foundry VTT), basé sur les règles de Donjons et Dragons 5e Édition, avec une seule race jouable (Humain) dont les traits culturels et mécaniques varient selon un système d'**Origines** géographiques inspirées de nations réelles.

## Scope (Périmètre)

### ✅ Inclus
- Système complet compatible Foundry VTT v14
- Feuille de personnage joueur (character sheet) avec onglets multiples
- Système d'Origines remplaçant le système de races classique de D&D 5e
- Gestion des statistiques, compétences, équipement, inventaire, capacités
- Système de monnaies (PC/PA/PO/PP) avec conversion
- Calcul du poids transporté et de la capacité de charge
- Boutons d'actions (repos court, repos long)
- Respect strict de la documentation API Foundry VTT

### ❌ Exclus (pour cette phase)
- Module de combat automatisé avancé (initiative, grille tactique) — à définir en V2
- Compendiums de sorts/monstres complets — à importer/adapter plus tard
- Système de campagne ou scénarios prédéfinis
- Traduction multilingue (prévoir l'anglais et le français comme base, pas plus pour l'instant)
- Marketplace / publication officielle sur Foundry (phase ultérieure)
- Historique des jets de dés dans la fiche
- Icônes ou tokens personnalisés liés aux origines
- Affichage de la progression d'XP au joueur (l'XP existe en interne mais reste masqué)

## Contexte du jeu

### Système de base
Donjons et Dragons 5e Édition (règles standards : jets d'attaque, sauvegardes, avantage/désavantage, points de vie, classes, niveaux, etc.)

### Système d'Origines (remplace les races classiques)
Tous les personnages sont des **Humains**. Leurs traits culturels et bonus mécaniques dépendent de leur **Origine** (pays d'origine).

| Origine    | Inspiration historique | Traits culturels                                | Bonus de caractéristiques      | Avantage sur compétences  | Trait spécial                                                                                                                                                                           |
|------------|------------------------|-------------------------------------------------|----------------------------------|---------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Fleuraine  | France                 | Noblesse, chevalerie, droiture, honneur         | Charisme +2, Force +1            | Persuasion, Intimidation  | Honneur Inébranlable : Une fois par combat, si un jet de sauvegarde contre un effet de peur ou de charme échoue, le personnage peut relancer le dé et doit utiliser le nouveau résultat. |
| Altenmark  | Germanie               | Force, courage, détermination, discipline       | Force +2, Constitution +1        | Athlétisme, Survie        | Discipline de Fer : Le personnage ne peut jamais être surpris par une embuscade lorsqu'il est en alerte (veille).                                                                       |
| Lucentia   | Italie                 | Charme, éloquence, persuasion, commerce         | Charisme +2, Dextérité +1        | Tromperie, Représentation | Art de la Parole : Le personnage peut ajouter son modificateur de Charisme aux tests d'Intimidation ou de Tromperie                                                                     |
| Ravenmoor  | Angleterre             | Loyauté, pragmatisme, stoïcisme, sens du devoir | Sagesse +2, Constitution +1      | Investigation, Perception | Stoïcisme : Le personnage peut ignorer les effets de peur, d'effroi ou d'illusions mineures                                                                                             |
| Valdera    | Espagne                | Piété, ferveur, passion, ardeur                 | Sagesse +2, Charisme +1          | Religion, Athlétisme      | Ferveur Incarnée : Une fois par jour, le personnage peut créer une petite flamme (équivalente à une bougie ou une torche) sans matériel.                                                |
| Ashar      | Arabie                 | Sagesse, connaissance, réflexion, patience      | Intelligence +2, Sagesse +1      | Histoire, Arcanes         | Sagesse Ancienne : Ajoute son bonus d'intelligence à un jet d'investigation sur quelque chose de magique.                                                                               |

## Stack technique
- **Langages** : JavaScript (ES modules), Handlebars (templates), HTML, CSS
- **Plateforme cible** : Foundry VTT **v14** (dernière version stable)
- **Documentation API de référence** : https://foundryvtt.com/api/ — **à respecter absolument**, aucune API dépréciée ou non documentée
- **Base de développement** : https://foundryvtt.com/article/system-development/ (structure de système officielle Foundry)
- **Architecture attendue** : structure standard d'un système Foundry v14 (`system.json`, `documentTypes` + DataModels JS pour le schéma de données — `template.json` est l'ancienne approche, dépréciée depuis la V12/V13 au profit des DataModels —, `/templates`, `/scripts`, `/styles`, `/lang`)

## Conventions de code
- Nommage JS : `camelCase` pour variables/fonctions, `PascalCase` pour classes
- Fichiers Handlebars : un template par onglet de la feuille de personnage (`character-sheet.hbs`, `tab-stats.hbs`, `tab-equipment.hbs`, `tab-inventory.hbs`, `tab-abilities.hbs`, `tab-journal.hbs`)
- Respecter le pattern `Actor`/`ActorSheetV2` et `Item`/`ItemSheetV2` de l'API Foundry (framework ApplicationV2, `foundry.applications.sheets.ActorSheetV2` + `HandlebarsApplicationMixin` — l'ancien `ActorSheet` V1 est déprécié depuis la V13)
- Données de jeu (races/origines, classes, compétences) externalisées en JSON/config, pas en dur dans le JS
- CSS scoppé au système pour éviter les conflits avec d'autres modules/systèmes installés

## Bornes et limites
- Ne pas modifier le cœur de Foundry VTT (core) — uniquement développement au niveau système
- Toute fonctionnalité doit passer par les hooks et API officiels Foundry (`Hooks.on`, `game.actors`, etc.)
- Pas de dépendances externes lourdes (frameworks front comme React/Vue) — rester sur Handlebars natif, conforme aux standards Foundry
- **Pas de système de build** (pas de npm/webpack/bundler) : JavaScript vanilla chargé directement via `system.json`, dans l'esprit "system development" le plus simple de Foundry
- Fichiers de template < 300 lignes ; découper par onglet
- Toute règle D&D 5e implémentée doit être vérifiable/sourcée (SRD 5e ou manuel officiel)

## Bonnes pratiques de code
- Commenter le code de manière claire.
- Pas de nom de variables ou de fonctions trop longs.
- Fait des commits de moins de 100 lignes modifiées.

## Feuille de personnage — Spécifications fonctionnelles

### Zone commune (visible sur tous les onglets)
- Nom du personnage
- Niveau
- Classe du personnage
- Points de Vie (actuels / max)
- Classe d'Armure (CA) totale
- Vitesse de déplacement
- Bouton "Repos court"
- Bouton "Repos long"

### Onglet "Statistiques"
- Caractéristiques principales : Force, Dextérité, Constitution, Intelligence, Sagesse, Charisme (avec modificateurs)
- Compétences, classées par ordre alphabétique (Acrobaties, Arcanes, Athlétisme, Discrétion, Dressage, Escamotage, Histoire, Intimidation, Investigation, Médecine, Nature, Perception, Perspicacité, Persuasion, Religion, Représentation, Survie, Tromperie) — 18 compétences (D&D 5e standard, Perspicacité incluse)
- Jets de sauvegarde

### Onglet "Équipement"
- Main principale (arme/objet)
- Main secondaire (arme/bouclier/objet)
- Armure portée
- Emplacements accessoires (anneaux, amulettes, etc.)

### Onglet "Inventaire"
- Liste complète des objets transportés (y compris équipement équipé et non équipé)
- Monnaies : Pièces de Cuivre (PC), d'Argent (PA), d'Or (PO), de Platine (PP)
  - Conversion : 1 PP = 50 PO ; 1 PO = 10 PA = 100 PC
- Poids de chaque objet (donnée détaillée, unitaire) + poids total transporté (somme calculée automatiquement)
- Calcul de la capacité de charge (selon la Force du personnage, règles D&D 5e standard : Force × 15 lb / × 7,5 kg, à adapter selon système d'unités choisi) — **système de poids en version détaillée confirmé** (pas de variant simplifié)

### Onglet "Capacités" / "Sorts"
- L'intitulé et le contenu de cet onglet dépendent de la classe du personnage :
  - **Classe lanceuse de sorts** (Magicien, Clerc, Barde, etc.) → onglet affiché sous le nom "Sorts" : emplacements de sorts par niveau, sorts préparés/connus, école, composantes
  - **Classe non lanceuse** (Guerrier, Roublard non spécialisé, etc.) → onglet affiché sous le nom "Capacités" : aptitudes de classe, dons, actions spéciales
  - Prévoir la logique conditionnelle côté template/JS pour basculer l'affichage selon `actor.class`

### États et conditions
- Affichage des états/conditions actifs sur le personnage (ex : empoisonné, effrayé, à terre, etc.) — visible dans la zone commune ou en overlay sur la fiche, à intégrer aux mécaniques de jets (désavantage/avantage automatique selon la condition)

### Système de progression
- Progression basée sur des **points d'expérience (XP)**, gérés en interne (stockés dans les données de l'Actor)
- **Non affiché au joueur** : pas de barre de progression ni de compteur d'XP visible sur la fiche — seul le Maître du Jeu (ou un outil GM dédié) doit pouvoir consulter/modifier cette valeur

### Onglet "Journal"
- Bloc de texte "Biographie"
- Bloc de texte "Notes"

## Fiche d'ennemi/PNJ (Actor type `npc`)

Fiche générique distincte de `character`, pour les adversaires et PNJ. Stats simplifiées :
pas de score de caractéristique ni de maîtrise séparée — un **bonus direct** par caractéristique,
et la sauvegarde correspondante est toujours égale à ce bonus.

- Nom, type de créature (liste fermée SRD 5e, 14 types : Aberration, Bête, Céleste, Construction,
  Dragon, Élémentaire, Fée, Fiélon, Géant, Humanoïde, Monstruosité, Vase, Plante, Mort-vivant)
- Indice de dangerosité (FI) : liste fermée SRD 5e (0, 1/8, 1/4, 1/2, puis paliers entiers 1 à 30)
- Taille : liste fermée SRD 5e (TP, P, M, G, TG, Gig)
- Classe d'Armure, Points de Vie (actuels/max), Vitesse
- Bonus de caractéristiques (Force à Charisme), sauvegarde = bonus de caractéristique
- Onglet "Capacités spéciales" : deux blocs de texte libre, "Capacités spéciales" et "Particularité"
- Points d'expérience rapportés : valeur saisie manuellement par le MJ (**table de correspondance
  FI → XP prévue plus tard**, pas encore implémentée)
- Onglet "Butin" : objets rapportés (réutilise les Items `weapon`/`armor`/`gear` existants, embarqués
  sur l'Actor comme pour `character`)

## Fichiers de référence
- `system.json` — manifeste du système (métadonnées, compatibilité v14, `documentTypes`, `manifest`/`download`)
- `scripts/data/*.js` — DataModels (`CharacterData`, `NpcData`, `WeaponData`, `ArmorData`, `GearData`, `FeatureData`), schéma de données des Actors/Items
- `scripts/data/origins.json` — données des 6 Origines, externalisées en JSON
- `scripts/sheets/actor-sheet.js` — `DndCustomActorSheet` (ActorSheetV2 + HandlebarsApplicationMixin), fiche `character`
- `scripts/sheets/npc-sheet.js` — `DndCustomNpcSheet` (ActorSheetV2 + HandlebarsApplicationMixin), fiche `npc`
- `scripts/helpers/config.js`, `scripts/helpers/rules.js` — constantes `CONFIG.DND_CUSTOM` (dont types de créature, tailles, FI sourcés SRD) et règles SRD sourcées (modificateur, bonus de maîtrise, capacité de charge)
- `/templates/actor/*.hbs` — templates Handlebars des feuilles (un par onglet, préfixe `npc-` pour la fiche d'ennemi/PNJ)
- `/lang/fr.json`, `/lang/en.json` — traductions
- `.github/workflows/release.yml` — publication d'une release GitHub (tag + zip + manifest) déclenchée manuellement (workflow_dispatch, entrée `version`)

## Versionnage
- Le champ `version` de `system.json` est la source de vérité : c'est lui que lit le workflow de release, pas une saisie manuelle.
- **Après une session de travail sur le projet, incrémenter `version` dans `system.json`** (SemVer : patch pour un correctif, minor pour une fonctionnalité, major réservé à une rupture — rare avant le `1.0.0`), en cohérence avec la section "Non publié" du `CHANGELOG.md`.

## Publication (release)
Pour publier une nouvelle version consultable par Foundry via le manifest :
1. Vérifier que `version` dans `system.json` a bien été incrémenté (cf. "Versionnage" ci-dessus) et correspond à la section du `CHANGELOG.md` à publier.
2. Aller dans l'onglet GitHub Actions du dépôt, lancer le workflow **Release Foundry System** manuellement (aucune saisie requise).
3. Le workflow lit `version` dans `system.json`, met à jour `download` en conséquence, commit, crée le tag `vX.Y.Z`, construit `system.zip` (contenu du système à la racine de l'archive) et publie une Release GitHub avec `system.json` et `system.zip` en assets.
4. Le champ `manifest` de `system.json` (`.../releases/latest/download/system.json`) reste stable : Foundry l'utilise pour détecter les mises à jour.

## Points de vigilance particuliers
- **Compatibilité v14** : vérifier régulièrement les breaking changes de l'API Foundry entre versions