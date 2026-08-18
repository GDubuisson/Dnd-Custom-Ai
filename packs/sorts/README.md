# Compendium "Sorts"

Dossier vide dans le dépôt : Foundry le compile en LevelDB directement ici, la première fois
qu'un document y est ajouté depuis l'interface (glisser un Item de type `spell` depuis le
monde vers ce compendium, ou "Créer un objet" directement dedans).

Chaque sort est un Item de type `spell`, édité via sa fiche dédiée
(`templates/item/spell-sheet.hbs`) — cf. `ClaudeFiles/CONCEPTION_FONCTIONNELLE.md` pour le détail des champs.

Les 15 sorts SRD 5e pré-écrits dans `world-items/spells.json` (5 tours de magie, niveaux 1 à
3 — sélection non exhaustive, cf. `world-items/README.md`) y sont importés **automatiquement
au chargement du monde** (hook `ready`, cf. `scripts/dnd-custom-ai.js` et
`scripts/helpers/content-import.js`), sans doublon (comparaison par nom) et sans action du MJ.
La Macro monde "Importer le contenu du système" reste disponible en secours pour rejouer
l'import à la demande (ex. après une mise à jour du système ayant ajouté de nouveaux sorts).

Glissez-déposez ensuite un sort depuis ce compendium vers la fiche d'un personnage (onglet
"Sorts") pour le lui attribuer — glisser-déposer standard de Foundry.
