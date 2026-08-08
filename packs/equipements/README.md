# Compendium "Équipements"

Dossier vide dans le dépôt : Foundry le compile en LevelDB directement ici, la première fois
qu'un document y est ajouté depuis l'interface (glisser un Item depuis le monde vers ce
compendium, ou "Créer un objet" directement dedans).

Réservé aux armes et armures (Item de type `weapon` ou `armor`, cf.
`scripts/data/item-data.js`) : les deux types peuvent cohabiter dans ce même compendium.

- `weapon` : `system.damage`, `system.properties`, `system.slot` (`mainHand`/`offHand`)
- `armor` : `system.ac`, `system.category` (`light`/`medium`/`heavy`),
  `system.slot` (`armor`/`offHand`/`accessory`)
