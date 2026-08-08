# Compendium "Outils"

Dossier vide dans le dépôt : Foundry le compile en LevelDB directement ici, la première fois
qu'un document y est ajouté depuis l'interface (glisser un Item de type `tool` depuis le
monde vers ce compendium, ou "Créer un objet" directement dedans).

Chaque outil doit être un Item de type `tool` (cf. `scripts/data/item-data.js`) avec :
- `system.weight` / `system.quantity` / `system.equipped` : comme tout objet physique
- `system.bonusSkill` : compétence bonifiée par l'outil (ex. `sleightOfHand` pour des outils
  de voleur), laissable vide
- `system.bonusValue` : valeur du bonus accordé
- `system.description` : effet détaillé, conditions d'utilisation

L'application automatique de ce bonus sur la fiche de personnage n'est pas encore câblée
(donnée informative pour l'instant, à faire manuellement) — travail de suivi une fois ce
compendium peuplé.
