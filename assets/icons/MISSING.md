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

## Sorts (`world-items/spells.json`) — 16 / 42, 26 en attente ⚠️

**Corrigé le 2026-08-19** : section périmée (annonçait 16/16 alors que `spells.json` est passé à
42 sorts depuis, sans mise à jour des icônes ni de ce fichier).

**Déjà câblés (16)**, dans `assets/icons/spells/` (source majoritairement wiki Baldur's Gate 3,
plus "Parler aux animaux" via wiki D&D — assets sous droit d'auteur Larian/WotC, **pas** libres
de droit, cf. avertissement donné à l'utilisateur lors du câblage).

**En attente (26)** — dépose une image dans `assets/icons/spells/` nommée comme indiqué :

Moqueries cruelles (`Moqueries-cruelles.png`), Avis divin (`Avis-divin.png`), Thaumaturgie
(`Thaumaturgie.png`), Druidisme (`Druidisme.png`), Prestidigitation (`Prestidigitation.png`),
Illusion mineure (`Illusion-mineure.png`), Ordre (`Ordre.png`), Sanctuaire (`Sanctuaire.png`),
Protection contre le mal et le bien (`Protection-contre-le-mal-et-le-bien.png`), Enchevêtrement
(`Enchevetrement.png`), Malédiction du sorcier (`Malediction-du-sorcier.png`), Charme-personne
(`Charme-personne.png`), Restauration inférieure (`Restauration-inferieure.png`), Peau
d'écorce (`Peau-decorce.png`), Arme spirituelle (`Arme-spirituelle.png`), Suggestion
(`Suggestion.png`), Tempête de grêle (`Tempete-de-grele.png`), Mur de feu (`Mur-de-feu.png`),
Liberté de mouvement (`Liberte-de-mouvement.png`), Invisibilité suprême
(`Invisibilite-supreme.png`), Bannissement (`Bannissement.png`), Divination
(`Divination.png`), Soins de groupe (`Soins-de-groupe.png`), Immobilisation de monstre
(`Immobilisation-de-monstre.png`), Domination de personne (`Domination-de-personne.png`), Porte
dimensionnelle (`Porte-dimensionnelle.png`)

## Dons (`world-items/feats.json`) — 0 / 10 ⚠️

Aucune icône fournie pour ce fichier, dossier `assets/icons/feats/` inexistant. Dépose une
image nommée comme indiqué :

Athlète (`Athlete.png`), Doué (`Doue.png`), Sentinelle (`Sentinelle.png`), Alerte
(`Alerte.png`), Tenace (`Tenace.png`), Chanceux (`Chanceux.png`), Magie d'initié
(`Magie-dinitie.png`), Résilient (`Resilient.png`), Guérisseur (`Guerisseur.png`), Combat monté
(`Combat-monte.png`)

## Sous-classes (`world-items/subclasses.json`) — 0 / 16 ⚠️

Aucune icône fournie pour ce fichier, dossier `assets/icons/subclasses/` inexistant. Dépose une
image nommée comme indiqué (idéalement un blason dans le même esprit que les 12 badges de
Classe déjà fournis, cf. section Classes ci-dessous) :

Voie du Berserker (`Voie-du-Berserker.webp`), Voie du Cœur sauvage
(`Voie-du-Coeur-sauvage.webp`), Voie de la Magie sauvage (`Voie-de-la-Magie-sauvage.webp`,
Barbare), Collège du Savoir (`College-du-Savoir.webp`), Domaine de la Vie
(`Domaine-de-la-Vie.webp`), Cercle de la Terre (`Cercle-de-la-Terre.webp`), Champion
(`Champion.webp`), Voie de la Main Ouverte (`Voie-de-la-Main-Ouverte.webp`), Serment de
Dévotion (`Serment-de-Devotion.webp`), Chasseur (`Chasseur.webp`), Voleur (`Voleur.webp`),
Lignage draconique (`Lignage-draconique.webp`), Le Fiélon (`Le-Fielon.webp`), École
d'évocation (`Ecole-devocation.webp`), Bretteur (`Bretteur.webp`, Roublard), Assassin
(`Assassin.webp`, Roublard)

Nouvelles sous-classes en cours d'ajout (chantier "plusieurs sous-classes par classe", inspiration
BG3) : 2 de plus par classe au fil des lots — les icônes correspondantes viendront s'ajouter ici
à mesure (Barbare et Roublard faits, reste 10 classes).

## Capacités (`world-items/features.json`) — 25 / 82, 57 en attente ⚠️

**Corrigé le 2026-08-19** : cette section était périmée (annonçait 24/24 alors que
`features.json` a grossi depuis — un lot de Capacités supplémentaires par classe a été ajouté
sans mise à jour de ce fichier ni des icônes correspondantes, cause des images cassées
constatées dans le compendium "Capacités de classe"). Recompté directement depuis
`world-items/features.json` vs les fichiers présents dans `assets/icons/features/`.

**Déjà câblées (25)** dans `assets/icons/features/` : Rage, Inspiration bardique, Défense sans
armure (Barbare), Sens divin, Imposition des mains, Second souffle, Forme sauvage, Aptitudes
multiples, Canalisation divine, Ki, Arts martiaux, Incantation rituelle (Clerc + Druide, icône
partagée), Sursaut d'activité, Sorcellerie innée, Magie de pacte, Grimoire, Récupération
arcanique, Ennemi juré, Explorateur-né, Attaque sournoise, Métamagie, Invocations occultes, et
Action rusée (`Action-rusee.png`, source : wiki Baldur's Gate 3 — asset sous droit d'auteur
Larian/WotC, **pas** libre de droit, même avertissement que pour les icônes de Sorts).

**En attente (57)** — dépose une image dans `assets/icons/features/` nommée comme indiqué, PNG
ou WEBP carré, fond transparent si possible (`game-icons.net` pour une source libre de droit) :

- **Sans classe** : Attaque d'opportunité (`Attaque-dopportunite.png`)
- **Barbare** : Attaque supplémentaire (Barbare) (`Attaque-supplementaire-Barbare.png`),
  Vitesse accrue (`Vitesse-accrue.png`), Instinct sauvage (`Instinct-sauvage.png`), Critique
  brutal (`Critique-brutal.png`), Frénésie (`Frenesie.png`), Rage sans esprit
  (`Rage-sans-esprit.png`), Aspect de la bête (`Aspect-de-la-bete.png`, Voie du Cœur sauvage),
  Instincts du totem (`Instincts-du-totem.png`, Voie du Cœur sauvage), Surtenance sauvage
  (`Surtenance-sauvage.png`, Voie de la Magie sauvage), Volonté indomptable de la sauvagerie
  (`Volonte-indomptable-de-la-sauvagerie.png`, Voie de la Magie sauvage)
- **Barde** : Chant de repos (`Chant-de-repos.png`), Source d'inspiration
  (`Source-dinspiration.png`), Contre-chant (`Contre-chant.png`), Mots cinglants
  (`Mots-cinglants.png`), Sorts supplémentaires (`Sorts-supplementaires.png`)
- **Clerc** : Destruction des morts-vivants (`Destruction-des-morts-vivants.png`), Disciple de
  la vie (`Disciple-de-la-vie.png`), Canalisation divine : Préserver la vie
  (`Preserver-la-vie.png`)
- **Druide** : Sorts de cercle (`Sorts-de-cercle.png`), Récupération naturelle
  (`Recuperation-naturelle.png`)
- **Guerrier** : Attaque supplémentaire (Guerrier) (`Attaque-supplementaire-Guerrier.png`),
  Indomptable (`Indomptable.png`), Critique amélioré (`Critique-ameliore.png`), Athlète accompli
  (`Athlete-accompli.png`)
- **Moine** : Rafale de coups (`Rafale-de-coups.png`, actuellement `icons/svg/sword.svg`),
  Défense patiente (`Defense-patiente.png`, actuellement `icons/svg/shield.svg`), Pas du vent
  (`Pas-du-vent.png`, actuellement `icons/svg/wind.svg`), Déviation de projectiles
  (`Deviation-de-projectiles.png`), Chute amortie (`Chute-amortie.png`), Attaque supplémentaire
  (Moine) (`Attaque-supplementaire-Moine.png`), Frappe étourdissante
  (`Frappe-etourdissante.png`), Coups empreints de Ki (`Coups-empreints-de-ki.png`), Technique
  de la Main Ouverte (`Technique-de-la-Main-Ouverte.png`), Corps parfait (`Corps-parfait.png`)
- **Paladin** : Attaque supplémentaire (Paladin) (`Attaque-supplementaire-Paladin.png`), Aura de
  protection (`Aura-de-protection.png`), Canalisation divine : Arme sacrée
  (`Arme-sacree.png`), Aura de dévotion (`Aura-de-devotion.png`)
- **Rôdeur** : Attaque supplémentaire (Rôdeur) (`Attaque-supplementaire-Rodeur.png`),
  Déplacement facilité (`Deplacement-facilite.png`), Proie du chasseur
  (`Proie-du-chasseur.png`), Tactiques défensives (`Tactiques-defensives.png`)
- **Roublard** : Esquive instinctive (`Esquive-instinctive.png`), Évasion (`Evasion.png`),
  Doigts agiles (`Doigts-agiles.png`), Escalade experte (`Escalade-experte.png`), Panache
  (`Panache.png`, Bretteur), Jeu de jambes (`Jeu-de-jambes.png`, Bretteur), Assassinat
  (`Assassinat.png`, Assassin), Infiltration (`Infiltration.png`, Assassin)
- **Ensorceleur** : Résilience draconique (`Resilience-draconique.png`), Affinité élémentaire
  (`Affinite-elementaire.png`)
- **Occultiste** : Bienfait du Fiélon (`Bienfait-du-Fielon.png`), Chance du Fiélon
  (`Chance-du-Fielon.png`)
- **Magicien** : Sculpteur de sorts (`Sculpteur-de-sorts.png`), Tour de magie renforcé
  (`Tour-de-magie-renforce.png`)

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
Origines) et câblés depuis `assets/icons/origins/`. Retour de test (lot 3) : l'Origine
"Ashar" était en fait une coquille pour "Azhar" — nom, gentilé, langue et fichier d'icône
corrigés (`Azhar.webp`, la clé interne `ashar` dans `scripts/data/origins.json` reste
inchangée, jamais affichée telle quelle).

## Récapitulatif de ce qui est déjà fait (aucune action requise)

- **Armes** : 37 / 37
- **Armures** : 13 / 13
- **Outils** : 24 / 24
- **Objets** : 15 / 15
- **Classes** : 12 / 12
- **Origines** : 6 / 6
- **Langues** : 11 / 11

## Ce qui reste réellement à faire

- **Capacités** : 25 / 82 (57 en attente, cf. section dédiée ci-dessus)
- **Sorts** : 16 / 42 (26 en attente, cf. section dédiée ci-dessus)
- **Dons** : 0 / 10 (aucune icône fournie, cf. section dédiée ci-dessus)
- **Sous-classes** : 0 / 16 (aucune icône fournie, cf. section dédiée ci-dessus)
