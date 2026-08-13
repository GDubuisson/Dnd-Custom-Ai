# Compendium "Classes"

Dossier vide dans le dépôt : Foundry le compile en LevelDB directement ici, la première fois
qu'un document y est ajouté depuis l'interface (glisser un Item de type `class` depuis le
monde vers ce compendium, ou "Créer un objet" directement dedans).

Chaque classe doit être un Item de type `class` (cf. `scripts/data/class-data.js`), édité via
sa fiche dédiée (`templates/item/class-sheet.hbs`) :
- `name` : nom de la classe (ex. "Guerrier")
- `system.description` : texte libre narratif (plus de dé de vie/sauvegardes/compétences en
  prose ici, cf. champs structurés ci-dessous)
- `system.savingThrows` : jets de sauvegarde maîtrisés (2 caractéristiques, SRD 5e)
- `system.skillChoiceCount` : nombre de compétences à choisir à la création
- `system.weaponProficiencies` : catégories d'armes maîtrisées

**Informatif uniquement** (comme l'Item Origine aujourd'hui) : ce compendium reste une fiche de
référence lisible pour le MJ/les joueurs, mais n'est pas branché aux calculs de la fiche de
personnage, qui continue de lire `CONFIG.DND_CUSTOM.classSavingThrows` / `.classSkillChoices` /
`.classWeaponProficiencies` / `.classHitDice` / `.spellcastingClasses`
(`scripts/helpers/config.js`) — décision de cadrage assumée (lot 2, `ClaudeFiles/SUITE_TRAVAUX.md`) :
pas de dé de vie sur l'Item (le système n'expose ce détail nulle part au joueur), pas de bonus de
caractéristique de classe (reste un privilège des Origines).

Les 12 classes SRD 5e sont pré-écrites dans `world-items/classes.json` (description + mêmes
valeurs de sauvegardes/compétences/maîtrises que `config.js`, dupliquées intentionnellement —
vérifié par `tests/data/consistency.test.js`) : importées **automatiquement ici au chargement du
monde** (hook `ready`, cf. `scripts/dnd-custom-ai.js` et `scripts/helpers/content-import.js`),
sans doublon et sans action du MJ — pas d'étape manuelle de glisser-déposer ni de macro à
lancer. La Macro monde "Importer le contenu du système" reste disponible en secours pour rejouer
l'import à la demande. C'est ce que la fiche de personnage utilise pour ouvrir la description
d'une classe au clic (recherche par nom exact).
