# Compendium "Langues"

Dossier vide dans le dépôt : Foundry le compile en LevelDB directement ici, la première fois
qu'un document y est ajouté depuis l'interface (glisser un Item de type `language` depuis le
monde vers ce compendium, ou "Créer un objet" directement dedans).

Chaque langue est un Item de type `language`, édité via sa fiche dédiée
(`templates/item/language-sheet.hbs`) : juste une catégorie (`system.category` — `common`,
`origin`, `special` ou `people`) et une description. Les langues de catégorie `people` sont celles
des peuples revenus avec la magie (Gobelin, Kobold, Orc, Saurien, Elfique ancien) : elles ne sont
PAS dans ce compendium, visible des joueurs, mais dans les Items du monde, dossier « Langues des
peuples (MJ) » (`world-items/people-languages.json`), réservé au MJ ; un personnage ne peut pas
les apprendre (glisser-déposer refusé avec un avertissement).

Les langues pré-écrites dans `world-items/languages.json` (le Commun, une par Origine, et
quelques langues spéciales dont Druidique) y sont importées **automatiquement au chargement du
monde** (hook `ready`, cf. `scripts/dnd-custom-ai.js` et `scripts/helpers/content-import.js`),
sans doublon (comparaison par nom) et sans action du MJ.

Le Commun et la langue de l'Origine choisie sont octroyés **automatiquement** à la création
du personnage (cf. `scripts/helpers/class-content.js` > `grantLanguages`). Les langues
spéciales (catégorie `special`) restent toujours un ajout manuel (une langue spéciale peut exiger d'en parler déjà une autre, champ `requiredLanguage` : le Sümpfer n'est accepté que sur un personnage qui parle l'Altenmarkois) : glissez-déposez-les depuis
ce compendium vers la fiche d'un personnage (onglet "Capacités") pour les lui attribuer.
