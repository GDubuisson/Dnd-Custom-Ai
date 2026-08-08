# Compendium "Outils"

Dossier vide dans le dépôt : Foundry le compile en LevelDB directement ici, la première fois
qu'un document y est ajouté depuis l'interface (glisser un Item de type `tool` depuis le
monde vers ce compendium, ou "Créer un objet" directement dedans).

Chaque outil doit être un Item de type `tool` (cf. `scripts/data/item-data.js`), édité via sa
fiche dédiée (`templates/item/tool-sheet.hbs`) :
- `system.price` (`pc`/`pa`/`po`/`pp`) et `system.weight` (kg)
- `system.useEffect.skill` : compétence bonifiée par l'outil (ex. `sleightOfHand` pour des
  outils de voleur), laissable vide
- `system.useEffect.bonus` : valeur du bonus accordé
- `system.descriptionRP` : description "roleplay" / narrative de l'outil

L'application automatique de ce bonus sur la fiche de personnage n'est pas encore câblée
(donnée informative pour l'instant, à faire manuellement) — travail de suivi une fois ce
compendium peuplé.
