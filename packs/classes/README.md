# Compendium "Classes"

Dossier vide dans le dépôt : Foundry le compile en LevelDB directement ici, la première fois
qu'un document y est ajouté depuis l'interface (glisser un Item de type `class` depuis le
monde vers ce compendium, ou "Créer un objet" directement dedans).

Chaque classe doit être un Item de type `class` (cf. `scripts/data/class-data.js`), édité via
sa fiche dédiée (`templates/item/class-sheet.hbs`) :
- `name` : nom de la classe (ex. "Guerrier")
- `system.description` : texte libre (aptitudes de classe, progression, etc.)

Nom + description pour cette phase (validé dans `ClaudeFiles/ITEMS.md`) : le système de
classes n'est pas encore finalisé (dé de vie, lanceur de sorts ou non, progression de vitesse
du Barbare/Moine notamment). Ce compendium n'est pas encore relié à la fiche de personnage,
qui continue de lire `CONFIG.DND_CUSTOM.classHitDice` / `.spellcastingClasses`
(`scripts/helpers/config.js`).

Les 12 classes SRD 5e sont pré-écrites dans `world-items/classes.json` (nom + description
incluant dé de vie, sauvegardes maîtrisées, compétences et lanceur de sorts) : exécutez la
macro d'import de `world-items/README.md`, puis glissez chaque Item obtenu dans l'onglet
"Objets" du monde vers ce compendium. C'est ce que la fiche de personnage utilise pour ouvrir
la description d'une classe au clic (recherche par nom exact).
