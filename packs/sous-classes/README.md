# Compendium "Sous-classes"

Dossier vide dans le dépôt : Foundry le compile en LevelDB directement ici, la première fois
qu'un document y est ajouté depuis l'interface (glisser un Item de type `subclass` depuis le
monde vers ce compendium, ou "Créer un objet" directement dedans).

Chaque sous-classe est un Item de type `subclass`, édité via la même fiche que Classe
(`templates/item/class-sheet.hbs`, nom + description libre) — cf. `ClaudeFiles/CONCEPTION_FONCTIONNELLE.md`.
Comme pour Classe, la donnée mécanique réelle (niveau d'obtention, Capacités octroyées) ne vit
pas sur cet Item mais dans `DND_CUSTOM.subclasses`/`DND_CUSTOM.subclassLevel`
(`scripts/helpers/config.js`).

Les 36 sous-classes pré-écrites dans `world-items/subclasses.json` (3 par classe — 1 SRD 5e
d'origine + 2 supplémentaires inspirées de Baldur's Gate 3) y sont importées **automatiquement
au chargement du monde** (hook `ready`, cf.
`scripts/dnd-custom-ai.js` et `scripts/helpers/content-import.js`), sans doublon (comparaison
par nom) et sans action du MJ. La Macro monde "Importer le contenu du système" reste
disponible en secours pour rejouer l'import à la demande.

C'est ce que la fiche de personnage utilise pour ouvrir la description d'une sous-classe au
clic (recherche par nom exact), une fois choisie dans le sélecteur qui apparaît sur la fiche
au niveau d'obtention SRD de la classe (`DND_CUSTOM.subclassLevel`).
