# Compendium "Langues"

Dossier vide dans le dépôt : Foundry le compile en LevelDB directement ici, la première fois
qu'un document y est ajouté depuis l'interface (glisser un Item de type `language` depuis le
monde vers ce compendium, ou "Créer un objet" directement dedans).

Chaque langue est un Item de type `language`, édité via sa fiche dédiée
(`templates/item/language-sheet.hbs`) : juste une catégorie (`system.category` — `common`,
`origin` ou `special`) et une description.

Les langues pré-écrites dans `world-items/languages.json` (la Commune, une par Origine, et
quelques langues spéciales dont Druidique) y sont importées **automatiquement au chargement du
monde** (hook `ready`, cf. `scripts/dnd-custom-ai.js` et `scripts/helpers/content-import.js`),
sans doublon (comparaison par nom) et sans action du MJ.

La Commune et la langue de l'Origine choisie sont octroyées **automatiquement** à la création
du personnage (cf. `scripts/helpers/class-content.js` > `grantLanguages`). Les langues
spéciales (catégorie `special`) restent toujours un ajout manuel : glissez-déposez-les depuis
ce compendium vers la fiche d'un personnage (onglet "Journal") pour les lui attribuer.
