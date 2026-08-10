# Compendium "Origines"

Ce dossier est le pack déclaré dans `system.json` (`packs[0].path`). Il est vide dans le
dépôt : Foundry le compile en LevelDB directement ici la première fois qu'un document y est
ajouté depuis l'interface (glisser un Item de type `origin` depuis le monde vers ce
compendium, ou "Créer un objet" directement dedans).

Chaque Origine doit être un Item de type `origin` (cf. `scripts/data/origin-data.js`), édité
via sa fiche dédiée (`templates/item/origin-sheet.hbs`) :
- `name` : nom de l'Origine (ex. "Fleuraine")
- `img` : illustration (champ natif de l'Item, pas de champ dédié)
- `system.demonym` : gentilé (ex. "Fleurainois")
- `system.language` : langue parlée
- `system.inspiration` : inspiration culturelle réelle (ex. "France")
- `system.traits` : traits culturels résumés en quelques mots
- `system.description` : description historique et culturelle détaillée
- `system.abilityBonuses` : bonus par caractéristique (`str`, `dex`, `con`, `int`, `wis`, `cha`)
- `system.skillAdvantages` : liste des compétences bénéficiant de l'avantage d'Origine
- `system.specialTrait.name` / `system.specialTrait.description` : trait spécial

Les 6 Origines actuelles (Fleuraine, Altenmark, Lucentia, Ravenmoor, Valdera, Ashar) et leurs
valeurs sont pour l'instant définies dans `scripts/data/origins.json`, utilisé par la fiche de
personnage pour les calculs (bonus de caractéristiques, avantages de compétences).

Les mêmes 6 Origines, avec description longue, sont pré-écrites dans `world-items/origins.json` :
exécutez la macro d'import de `world-items/README.md`, puis glissez chaque Item obtenu dans
l'onglet "Objets" du monde vers ce compendium. La fiche de personnage utilise ce compendium
pour ouvrir la description d'une Origine au clic sur le champ "Origine" (recherche par nom
exact) ; les calculs eux continuent de lire `scripts/data/origins.json`.
