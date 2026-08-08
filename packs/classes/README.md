# Compendium "Classes"

Dossier vide dans le dépôt : Foundry le compile en LevelDB directement ici, la première fois
qu'un document y est ajouté depuis l'interface (glisser un Item de type `class` depuis le
monde vers ce compendium, ou "Créer un objet" directement dedans).

Chaque classe doit être un Item de type `class` (cf. `scripts/data/class-data.js`) avec :
- `name` : nom de la classe (ex. "Guerrier")
- `system.hitDie` : dé de vie (4, 6, 8, 10 ou 12)
- `system.spellcaster` : coché si la classe lance des sorts (bascule l'onglet "Sorts" sur la
  fiche de personnage)
- `system.description` : texte libre (aptitudes de classe, progression, etc.)

Le système de classes n'est pas encore finalisé (progression de vitesse du Barbare/Moine
notamment) : ce compendium n'est pas encore relié à la fiche de personnage, qui continue de
lire `CONFIG.DND_CUSTOM.classHitDice` / `.spellcastingClasses`
(`scripts/helpers/config.js`).
