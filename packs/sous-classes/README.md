# Compendium "Sous-classes"

Dossier vide dans le dépôt : Foundry le compile en LevelDB directement ici, la première fois
qu'un document y est ajouté depuis l'interface (glisser un Item de type `subclass` depuis le
monde vers ce compendium, ou "Créer un objet" directement dedans).

Chaque sous-classe est un Item de type `subclass`, édité via la même fiche que Classe
(`templates/item/class-sheet.hbs`, nom + description libre) — cf. `ClaudeFiles/ITEMS.md`.
Comme pour Classe, la donnée mécanique réelle (niveau d'obtention, Capacités octroyées) ne vit
pas sur cet Item mais dans `DND_CUSTOM.subclasses`/`DND_CUSTOM.subclassLevel`
(`scripts/helpers/config.js`).

Les 12 sous-classes SRD 5e pré-écrites dans `world-items/subclasses.json` (une par classe) y
sont importées **automatiquement au chargement du monde** (hook `ready`, cf.
`scripts/dnd-custom-ai.js` et `scripts/helpers/content-import.js`), sans doublon (comparaison
par nom) et sans action du MJ. La Macro monde "Importer le contenu du système" reste
disponible en secours pour rejouer l'import à la demande.

C'est ce que la fiche de personnage utilise pour ouvrir la description d'une sous-classe au
clic (recherche par nom exact), une fois choisie dans le sélecteur qui apparaît sur la fiche
au niveau d'obtention SRD de la classe (`DND_CUSTOM.subclassLevel`).
