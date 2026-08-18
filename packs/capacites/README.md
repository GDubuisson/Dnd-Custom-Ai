# Compendium "Capacités de classe"

Dossier vide dans le dépôt : Foundry le compile en LevelDB directement ici, la première fois
qu'un document y est ajouté depuis l'interface (glisser un Item de type `feature` depuis le
monde vers ce compendium, ou "Créer un objet" directement dedans).

Chaque capacité de classe est un Item de type `feature`, édité via sa fiche dédiée
(`templates/item/feature-sheet.hbs`) — cf. `ClaudeFiles/CONCEPTION_FONCTIONNELLE.md` pour le détail des champs
(`system.class`, `system.requiresRoll`, `system.rollFormula`, `system.uses.*`).

Les 24 capacités SRD 5e pré-écrites dans `world-items/features.json` (2 par classe, niveaux 1
à 3 — sélection non exhaustive, cf. `world-items/README.md`) y sont importées **automatiquement
au chargement du monde** (hook `ready`, cf. `scripts/dnd-custom-ai.js` et
`scripts/helpers/content-import.js`), sans doublon (comparaison par nom) et sans action du MJ.
La Macro monde "Importer le contenu du système" reste disponible en secours pour rejouer
l'import à la demande (ex. après une mise à jour du système ayant ajouté de nouvelles
capacités).

Glissez-déposez ensuite une capacité depuis ce compendium vers la fiche d'un personnage
(onglet "Capacités") pour la lui attribuer — glisser-déposer standard de Foundry.
