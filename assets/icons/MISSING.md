# Icônes manquantes

Ce fichier liste ce qui n'a **pas** pu être couvert par la bibliothèque d'icônes intégrée à
Foundry VTT (dossier `icons/`, cf. dépôt du système officiel `dnd5e` pour les chemins déjà
appliqués). Pour chaque entrée ci-dessous : dépose une image dans ce dossier
(`assets/icons/`) nommée comme indiqué entre parenthèses (PNG ou WEBP, carrée, fond
transparent si possible — cf. `game-icons.net` pour une source gratuite CC BY), et je la
câblerai au champ `img` correspondant.

## Armes (`world-items/weapons.json`) — fait ✅

Sarbacane fournie dans `assets/icons/weapons/sarbacane.webp` et câblée.

## Objets (`world-items/gear.json`) — fait ✅

Corde en chanvre, Torche, Silex et pierre, Lanterne à capuchon, Huile (flacon), Bougie
(`assets/icons/items/Accessoires/`) et Trousse de soins (`assets/icons/items/trousse-de-soin.webp`)
tous câblés.

Le reste du dossier fourni le 11/08 (~170 fichiers dans Accessoires/Armes/ArmesDistances/
Armures/Deplacement/Monnaie/Nourriture/Vetements, hors ceux listés ci-dessus) a été supprimé
de `assets/icons/` car non utilisé par aucune entrée de `world-items/*.json` (sur demande).

## Sorts (`world-items/spells.json`) — fait ✅ (16 / 16)

16 icônes fournies et câblées dans `assets/icons/spells/` (source majoritairement wiki Baldur's
Gate 3, plus "Parler aux animaux" via wiki D&D — assets sous droit d'auteur Larian/WotC, **pas**
libres de droit, cf. avertissement donné à l'utilisateur lors du câblage).

## Capacités (`world-items/features.json`) — fait ✅ (24 / 24)

Toutes câblées dans `assets/icons/features/` : Rage, Inspiration bardique, Défense sans armure
(Barbare), Sens divin, Imposition des mains, Second souffle, Forme sauvage, Aptitudes multiples,
Canalisation divine, Ki, Arts martiaux, Incantation rituelle (Clerc + Druide, icône partagée),
Sursaut d'activité, Sorcellerie innée, Magie de pacte, Grimoire, Récupération arcanique, Ennemi
juré, Explorateur-né, Attaque sournoise, Métamagie, Invocations occultes, et Action rusée
(`Action-rusee.png`, source : wiki Baldur's Gate 3 — asset sous droit d'auteur Larian/WotC,
**pas** libre de droit, même avertissement que pour les icônes de Sorts).

("Druidique" a été retirée de cette liste : ce n'est pas une capacité mais une Langue,
déplacée vers `world-items/languages.json` — cf. section Langues ci-dessous.)

## Langues (`world-items/languages.json`) — fait ✅ (11 / 11)

Les 6 langues d'Origine reprennent le blason de leur Origine (`assets/icons/origins/`, ex.
Fleurain → `Fleuraine.webp`). Commune et les 4 langues spéciales (Argot des rues, Jargon
militaire, Langue sacrée, Druidique) partagent une icône générique
`assets/icons/languages/others.webp`.

## Classes (`world-items/classes.json`) — fait ✅

Les 12 badges fournis par l'utilisateur ont été renommés et rangés dans
`assets/icons/classes/<NomFrançaisSansAccent>.webp` (ex. `Barbare.webp`, `Rodeur.webp` sans
accent pour éviter tout souci d'encodage dans les chemins), et câblés dans
`world-items/classes.json`.

## Origines (`world-items/origins.json`) — fait ✅

Les 6 blasons fournis ont été renommés (casse/orthographe alignées sur les noms exacts des
Origines, ex. `Azhar.webp` → `Ashar.webp`) et câblés depuis `assets/icons/origins/`.

## Récapitulatif de ce qui est déjà fait (aucune action requise)

- **Armes** : 37 / 37
- **Armures** : 13 / 13
- **Outils** : 24 / 24
- **Objets** : 15 / 15
- **Classes** : 12 / 12
- **Origines** : 6 / 6
- **Sorts** : 16 / 16
- **Capacités** : 24 / 24
- **Langues** : 11 / 11

Plus aucune icône en attente dans le système.
