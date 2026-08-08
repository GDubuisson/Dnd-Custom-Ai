# Compendium "Moyens de transport"

Dossier vide dans le dépôt : Foundry le compile en LevelDB directement ici, la première fois
qu'un document y est ajouté depuis l'interface (glisser un Item de type `vehicle` depuis le
monde vers ce compendium, ou "Créer un objet" directement dedans).

Chaque monture/véhicule doit être un Item de type `vehicle` (cf.
`scripts/data/item-data.js`) avec :
- `system.category` : `mount` (monture), `landVehicle` (charrette, calèche...) ou
  `waterVehicle` (bateau...)
- `system.speed` : vitesse de déplacement
- `system.capacity` : capacité libre (ex. "4 passagers", "500 lb de fret")
- `system.ac` / `system.hp` : Classe d'Armure et Points de Vie
- `system.description` : texte libre

Pas de poids/quantité (un véhicule n'est pas transporté dans l'inventaire).
