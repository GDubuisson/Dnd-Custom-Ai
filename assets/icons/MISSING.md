# Icônes manquantes

Ce fichier liste ce qui n'est **pas** couvert par la bibliothèque d'icônes intégrée à Foundry
VTT (dossier `icons/`). Pour toute icône manquante : dépose une image dans `assets/icons/`
(carrée, PNG ou WEBP, fond transparent si possible — `game-icons.net` pour une source libre de
droit), et je la câblerai au champ `img` correspondant dans le fichier `world-items/*.json`
concerné.

## État actuel : tout est câblé ✅

| Catégorie | Fichier | Dossier | Compte |
|---|---|---|---|
| Armes | `world-items/weapons.json` | `assets/icons/weapons/` | 37/37 |
| Armures | `world-items/armor.json` | `assets/icons/armor/` | 13/13 |
| Outils | `world-items/tools.json` | `assets/icons/tools/` | 24/24 |
| Objets | `world-items/gear.json` | `assets/icons/items/` | 15/15 |
| Classes | `world-items/classes.json` | `assets/icons/classes/` | 12/12 |
| Sous-classes | `world-items/subclasses.json` | `assets/icons/classes/sub-classes/` | 36/36 |
| Origines | `world-items/origins.json` | `assets/icons/origins/` | 6/6 |
| Langues | `world-items/languages.json` | `assets/icons/languages/` (+ blasons d'Origine) | 11/11 |
| Sorts | `world-items/spells.json` | `assets/icons/spells/` | 42/42 |
| Capacités | `world-items/features.json` | `assets/icons/features/` | 103/103 |
| Dons | `world-items/feats.json` | `assets/icons/feats/` | 10/10 |

## À savoir pour la suite

- Une partie des icônes (Sorts, Capacités, Action rusée, Sous-classes) provient de packs
  tiers (wiki Baldur's Gate 3, pack perso "Saethos Shared Icons", pack de sprites génériques) —
  origine et licence non confirmées libres de droit dans certains cas. À garder en tête si le
  système est un jour redistribué publiquement.
- Quelques correspondances sont approximatives faute de meilleure icône disponible (ex. le sort
  "Ordre" utilise l'icône "Command Halt", le don "Alerte" utilise une icône de cloche d'alarme).
  Une meilleure icône peut toujours remplacer l'actuelle si trouvée.
- S'il faut réévaluer le fichier après un ajout de contenu (nouveaux sorts, capacités, dons...),
  recompter directement depuis les `world-items/*.json` vs les fichiers présents dans
  `assets/icons/`, plutôt que de se fier à un ancien état de ce document.
