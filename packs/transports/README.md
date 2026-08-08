# Compendium "Moyens de transport"

Dossier vide dans le dépôt : Foundry le compile en LevelDB directement ici, la première fois
qu'un document y est ajouté depuis l'interface (glisser un Item de type `vehicle` depuis le
monde vers ce compendium, ou "Créer un objet" directement dedans).

Chaque monture/véhicule doit être un Item de type `vehicle` (cf. `scripts/data/item-data.js`,
concept "Moyen de Transport" dans `ClaudeFiles/ITEMS.md`), édité via sa fiche dédiée
(`templates/item/vehicle-sheet.hbs`) :
- `system.transportType` : `mount` (monture), `equipment` (équipement), `tack` (sellerie),
  `landVehicle` (véhicule à tractation) ou `boat` (bateau)
- `system.price` (`pc`/`pa`/`po`/`pp`)
- `system.speed` / `system.carryCapacity` (kg) : affichés seulement pour Monture, Véhicule à
  tractation et Bateau (pas pertinents pour Équipement/Sellerie)
- `system.weight` (kg) : poids de l'objet lui-même (pertinent surtout pour
  Équipement/Sellerie transportables)
- `system.description` : texte libre

Pas de quantité (un véhicule n'est pas transporté dans l'inventaire du personnage comme un
objet stackable).
