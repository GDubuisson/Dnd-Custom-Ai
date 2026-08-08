# Compendium "Équipements"

Dossier vide dans le dépôt : Foundry le compile en LevelDB directement ici, la première fois
qu'un document y est ajouté. Pour les armures, c'est fait automatiquement au démarrage du
monde (cf. "Peuplement automatique" ci-dessous) ; pour tout le reste, glisser un Item depuis
le monde vers ce compendium ou "Créer un objet" directement dedans.

## Peuplement automatique (armures)

Au premier chargement du monde (hook `ready`, MJ uniquement), `scripts/dnd-custom-ai.js`
appelle `seedCompendiumFromJson("equipements", "scripts/data/armors.json")`
(`scripts/helpers/compendium-seed.js`) : les 13 armures SRD 5e de ce fichier sont ajoutées
au compendium si elles n'y sont pas déjà (comparaison par nom). C'est un test de peuplement
depuis un JSON versionné avec le système, pas encore généralisé aux autres compendiums.

`scripts/data/armors.json` n'a pas vocation à être modifié à la main (données versionnées
avec le code) ; les entrées déjà présentes dans le compendium ne sont jamais réécrites, donc
une modification faite dans Foundry (via la fiche d'Item) n'est pas écrasée au redémarrage.

Réservé aux armes et armures (Item de type `weapon` ou `armor`, cf.
`scripts/data/item-data.js`) : les deux types peuvent cohabiter dans ce même compendium.
Chacun a sa fiche d'édition dédiée (`templates/item/weapon-sheet.hbs` /
`armor-sheet.hbs`), détaillée dans `ClaudeFiles/ITEMS.md`.

- `weapon` : `weaponType`, `price`, `damage` (dé + type), `damageVersatile` (si Polyvalente),
  `properties` (prise en main, polyvalente, finesse, légère, lancer, lourde, allonge,
  rechargement, portée, spéciale), `slot` (`mainHand`/`offHand`)
- `armor` : `armorType` (`light`/`medium`/`heavy`), `price`, `baseAC`, `strengthRequired`,
  `stealthDisadvantage`, `slot` (`armor`/`offHand`/`accessory`)
