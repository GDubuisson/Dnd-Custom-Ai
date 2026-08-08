# Compendium "Équipements"

Dossier vide dans le dépôt : Foundry le compile en LevelDB directement ici, la première fois
qu'un document y est ajouté depuis l'interface (glisser un Item depuis le monde vers ce
compendium, ou "Créer un objet" directement dedans).

Réservé aux armes et armures (Item de type `weapon` ou `armor`, cf.
`scripts/data/item-data.js`) : les deux types peuvent cohabiter dans ce même compendium.
Chacun a sa fiche d'édition dédiée (`templates/item/weapon-sheet.hbs` /
`armor-sheet.hbs`), détaillée dans `ClaudeFiles/ITEMS.md`.

- `weapon` : `weaponType`, `price`, `damage` (dé + type), `damageVersatile` (si Polyvalente),
  `properties` (prise en main, polyvalente, finesse, légère, lancer, lourde, allonge,
  rechargement, portée, spéciale), `slot` (`mainHand`/`offHand`)
- `armor` : `armorType` (`light`/`medium`/`heavy`), `price`, `baseAC`, `strengthRequired`,
  `stealthDisadvantage`, `slot` (`armor`/`offHand`/`accessory`)
