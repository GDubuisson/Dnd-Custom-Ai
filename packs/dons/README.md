# Compendium "Dons"

Dossier vide dans le dépôt : Foundry le compile en LevelDB directement ici, la première fois
qu'un document y est ajouté depuis l'interface.

Un Don est un Item de type `feature` (même type/schéma/fiche que les Capacités de classe, cf.
`packs/capacites/README.md`), avec `system.class` et `system.subclass` **laissés vides** : ce
choix n'est pas anodin — `grantClassContent` (`scripts/helpers/class-content.js`) n'octroie
jamais automatiquement une Capacité dont le champ `class` ne correspond à aucune classe, donc
un Don ne peut jamais être accordé par erreur à la montée de niveau. Il reste toujours un choix
manuel du joueur : glisser l'Item depuis ce compendium vers l'onglet "Capacités" de sa fiche.

Les Dons sont une **règle optionnelle** du SRD/manuel officiel D&D 5e : à une des Améliorations
de caractéristiques de son personnage (niveaux définis par `DND_CUSTOM.abilityScoreImprovementLevels`,
`scripts/helpers/config.js`), un joueur peut choisir de prendre un Don à la place — ce système
ne force pas ce choix ni ne l'automatise (comme pour la Métamagie/les Invocations occultes,
laissées à convenir avec le MJ), il fournit seulement la liste de Dons à glisser sur la fiche.

Les 10 dons pré-écrits dans `world-items/feats.json` y sont importés **automatiquement au
chargement du monde** (hook `ready`, cf. `scripts/dnd-custom-ai.js` et
`scripts/helpers/content-import.js`), sans doublon (comparaison par nom) et sans action du MJ.
