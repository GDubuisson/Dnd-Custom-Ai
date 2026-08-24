# Changelog

Toutes les modifications notables de ce projet sont documentées dans ce fichier.

Le format est basé sur [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/),
et ce projet suit le [Semantic Versioning](https://semver.org/lang/fr/).

## [Non publié]

Chantier "types de dégâts" — Phase 1 (physique, cadrée avec l'utilisateur avant implémentation) :
résistance/immunité/vulnérabilité aux dégâts GÉNÉRIQUES, réglables librement par le MJ sur toute
fiche PNJ ou Personnage (3 nouveaux groupes de cases à cocher), pour les 3 types physiques
(contondant/perforant/tranchant) — jusqu'ici, seules quelques Capacités isolées (Rage, Résilience
draconique...) donnaient une résistance câblée en dur, sans réglage possible ailleurs. Nouvelle
case "Magique" sur les armes et sur le profil d'attaque des PNJ : une source magique contourne
cette résistance/immunité générique (nuance SRD "contre les attaques non magiques"), les
résistances déjà câblées en dur restant toujours actives quel que soit ce réglage (fidèle au SRD,
qui ne prévoit pas cette nuance pour Rage par exemple). Résistance et vulnérabilité sur le même
type s'annulent (dégâts normaux), conformément à la règle SRD explicite. Les dégâts magiques
(feu, nécrotique, etc.) et les armes/armures à dégâts combinés physique+magique sont prévus pour
une phase ultérieure — le champ accepte déjà les 13 types SRD pour ne jamais nécessiter de
migration de schéma entre-temps.

Chantier "mécaniques encore en texte brut" (audit du 2026-08-24, cf.
`ClaudeFiles/MECANIQUES_A_AUTOMATISER.md`) : automatise plusieurs mécaniques SRD 5e qui restaient
du texte purement descriptif. Niveau A (6 mécaniques isolées, chacune réutilisant un mécanisme
déjà en place) : Indomptable, Critique brutal, Instinct sauvage, Affinité de la tempête, Affinité
élémentaire, Forme sauvage de combat. Niveau B (3 généralisations, chacune débloquant plusieurs
sorts/capacités d'un coup) :
- `SpellData#save.appliesCondition` : un sort à sauvegarde peut désormais poser automatiquement une
  condition sur échec (même mécanisme que les Capacités à sauvegarde). Câblé sur Immobilisation de
  personne/de monstre (paralysé), Charme-personne/Domination de personne (charmé), Enchevêtrement
  (entravé).
- `SpellData#grantsCondition` : un sort qui pose un état sans jet associé (ex. Invisibilité,
  Invisibilité suprême) bascule désormais cet état sur la cible au moment du lancer.
- Immunité à une condition généralisée au-delà de Rage sans esprit/Aura de dévotion : deux
  nouvelles conditions homebrew (états à poser manuellement sur l'onglet États, comme "Béni"/
  "Guidé") — Liberté de mouvement (immunité à Entravé) et Protection contre le mal et le bien
  (immunité à Charmé/Effrayé).

Niveau C (5 des 6 mécaniques restantes, la dernière bloquée structurellement — détail dans
`ClaudeFiles/MECANIQUES_A_AUTOMATISER.md`) :
- Rage (Barbare) : avantage aux tests/sauvegardes de Force, +2 dégâts aux attaques de corps à
  corps à la Force, résistance aux dégâts contondants/perforants/tranchants — les 3 tant que
  l'état "En Rage" (onglet États) est actif.
- Destruction des morts-vivants (Clerc 5) : "Repousser les morts-vivants" détruit désormais un
  mort-vivant (au lieu de simplement le repousser) quand son indice de dangerosité est sous le
  seuil de la table SRD pour le niveau du Clerc.
- Voile des anciens (Paladin, Serment des Anciens) : résistance aux dégâts de sorts en zone de
  3 m, tant que la nouvelle bascule "Voile des anciens" (onglet États) est active.
- Ennemi juré (Rôdeur 1) : choix ponctuel d'un type de créature favori (bouton "Choisir"),
  avantage automatique aux tests de Survie et d'Intelligence contre une cible ciblée de ce type.
- Application des dégâts d'un sort à sauvegarde : tient désormais compte du résultat du jet de
  CHAQUE cible (réussite = moitié des dégâts si le sort le prévoit sinon aucun ; échec = dégâts
  pleins), ce qui n'était jamais le cas auparavant (dégâts pleins systématiques). Débloque au
  passage Évasion (Roublard 7 : réussite = aucun dégât, échec = moitié) et Tour de magie renforcé
  (Magicien Évocation 6 : réussite à un tour de magie = moitié au lieu d'aucun).

Chantier "emplacements de sorts par niveau" : remplace le pool unique "Sorts par repos" par de
vrais emplacements 1-9 (SRD 5e), avec surclassement (dépenser un palier supérieur si celui du
sort est épuisé) et cas particulier Magie de Pacte (Occultiste, un seul palier actif, rechargé
aussi au repos court) — voir le détail dans les sections Ajouté/Modifié ci-dessous. **Point
d'attention testeurs** : au premier chargement après mise à jour, les charges de sorts des
personnages existants repartent à 0 (nouveau schéma de données) — un repos long les restaure à
leur bon maximum.

CI GitHub Actions (`.github/workflows/test.yml`) simplifiée : ne fait plus tourner que la suite
rapide `npm test` (unitaire/data/dom). Le job Docker + Cypress contre un vrai client Foundry a
été retiré — `./data` repart vide à chaque run CI (pas de volume persistant), donc Foundry
devait être retéléchargé et réinstallé en entier à chaque exécution (timeout systématique), et
même en réglant ça, aucun monde/utilisateur de test n'est provisionné dans un environnement CI
éphémère. La couche E2E "au réel" reste une couche manuelle/locale uniquement (cf.
`tests/README.md`), plutôt que de maintenir un job systématiquement rouge.

Chantier "contenu de classe" complet : sorts/capacités étoffés à tous les niveaux déjà
modélisés, système de sous-classes (une par classe, SRD) et système de dons (optionnel).

Chantier "plusieurs sous-classes par classe" (inspiration Baldur's Gate 3, demandé par le
testeur) : les 12 classes passent d'une à trois sous-classes chacune (36 au total, 12 SRD 5e
d'origine + 24 nouvelles), chacune apportant une mécanique active distincte plutôt que du
flavor pur (RollTable de Surtenance sauvage, compagnon animal invocable, choix d'esprit totem,
incantation mineure toujours prête, critique automatique conditionnel, réserve de Ki
réutilisée, état à activer/poser manuellement...).

Traitement d'un nouveau lot de retours testeurs (montée de niveau, affichage) : voir les
sections Corrigé et Ajouté ci-dessous.

Traitement complet de `ClaudeFiles/FIRST_FEEDBACK.md` (première vague de retours testeurs,
~28 points) : PV/pool de sorts plafonnés au max, montée de niveau et choix de sous-classe
accessibles aux joueurs (pas seulement au MJ), token toujours lié au personnage joueur,
inventaire (surcharge bloquée, armes/armures non empilables, équipement restreint aux sacs,
outils consommés à l'usage), sorts filtrés par classe et connectés au système de lumière des
tokens, combat (dégâts à usage unique et réservés à l'auteur du jet, PvP bloqué, comparaison
auto à la CA de la cible, XP plein pour chaque participant), barre d'XP et états actifs
visibles en en-tête, descriptions HTML enfin rendues (éditeur riche `<prose-mirror>` à la
place de simples `<textarea>`), dés de vie et références D&D5e retirés du contenu joueur.

### Modifié
- Refactor de simplification (aucun changement de comportement) : suppression d'une règle CSS
  jamais utilisée, et fusion des 12 partials d'ambiance de classe de l'onglet Capacités/Sorts
  (`templates/actor/abilities/*.hbs`) en un seul, l'icône/le titre/l'accroche de chaque classe
  étant désormais résolus depuis `scripts/helpers/config.js`/`actor-sheet.js` plutôt que codés
  en dur dans 12 fichiers quasi identiques.
- En-tête d'ambiance de classe (`class-flavor.hbs`) redessiné dans l'esprit "cire à cacheter" du
  thème "Auberge et Grand Chemin" : icône dans un médaillon de cire, teinté par classe (rouille
  pour le Barbare, mousse pour le Druide, arcane pour le Magicien, etc.), sur un bandeau
  parcheminé — toujours le même partial unique, seule la couleur du sceau varie désormais par
  classe (`data-class`, cf. `context.classFlavorKey`).
- En-tête principal de la fiche personnage : réorganisé en 3 groupes de statistiques (Niveau/XP
  + Points de vie, Classe/Sous-classe + CA/Vitesse, Origine + Réaction), chacun sur 2 lignes
  empilées, qui reflouent proprement sur plusieurs lignes selon la largeur de la fenêtre plutôt
  que de se chevaucher ; XP (MJ) déplacé au-dessus de la barre de progression plutôt qu'à côté.
  Largeur minimale ajoutée à la fiche (640px de plancher, aucune largeur n'était imposée
  auparavant ; toujours aucun maximum) pour garantir que cette mise en page reste lisible en
  toute circonstance.
- Onglet Capacités/Sorts : réorganisé (DD de sauvegarde/bonus d'attaque et langues connues sur
  la même ligne, trait d'Origine puis identité de classe avant la liste elle-même, "Sorts par
  repos" en séparateur centré) ; phrase d'indication de glisser-déposer sous les langues
  retirée (redondante avec le glisser-déposer lui-même) ; langues classées par ordre d'ajout,
  Commune toujours en tête, plutôt que par ordre alphabétique.
- Onglet Statistiques : Bonus de maîtrise, Initiative et Perception passive rejoignent la ligne
  Liste d'état/Épuisement (au lieu d'être sous la liste de Compétences) ; les 6 cases de
  caractéristiques passent d'une pile verticale à une grille 2 colonnes x 3 lignes, pour tenir
  sans défiler dans une fenêtre de fiche plus basse (visées à 830px de haut).
- Onglet Capacités/Sorts : lire la description d'une Capacité ou d'un Sort ne demande plus
  d'ouvrir sa fiche complète (fenêtre séparée) — un simple survol du nom suffit désormais
  (infobulle), même convention déjà utilisée pour les langues connues.
- Journal "Guide du MJ" (page "Simplifications assumées") : l'affirmation périmée "pas de choix
  de sous-classe modélisé" remplacée par une description exacte distinguant les 12 sous-classes
  SRD d'origine (majoritairement génériques) des 24 nouvelles (mécanique active propre), plus une
  puce récapitulative dans "Ce que la fiche automatise déjà".

### Corrigé
- **Sécurité** : un Joueur pouvait contourner le blocage PvP en se ciblant lui-même avant de
  cliquer "Appliquer les dégâts" (même bouton, même bloc `applyDamageToTargets`). Seul le MJ
  peut désormais s'appliquer des dégâts à soi-même (poison, chute, piège... à sa discrétion).
- Zones "Description"/"Description du trait" des fiches d'Item : agrandies (6rem → 10rem de
  hauteur par défaut) pour lire confortablement un texte un peu long sans redimensionner
  manuellement à chaque fois.
- Dernières mentions résiduelles de l'ancienne orthographe "Ashar" (glossaire en jeu,
  documentation) corrigées en "Azhar" — les données de jeu elles-mêmes l'étaient déjà.
- Cases de caractéristiques (grille 2 colonnes) : la case à cocher de maîtrise de sauvegarde
  (session MJ) chevauchait le reste de la case, faute de place ; cases élargies et zone
  MOD./SAUV. agrandie. Effet de bord corrigé au passage : la liste de Compétences, rétrécie
  d'autant, ne laissait plus certaines lignes à badge (avantage d'Origine, désavantage
  d'armure) tenir sans déborder sur la colonne voisine — ces lignes passent désormais à la
  ligne plutôt que de recouvrir la case suivante.
- Jauge d'XP : libellé "XP" désormais visible en permanence côté Joueur (auparavant seulement
  une infobulle au survol, aucun texte affiché).
- Liste déroulante des états (onglet Statistiques) : cocher un état ne l'applique plus
  immédiatement à l'Actor (donc ne referme plus la liste à chaque clic) — la sélection n'est
  appliquée qu'à la fermeture de la liste, en un seul geste pour tous les états changés pendant
  qu'elle était ouverte, ce qui permet d'en cocher plusieurs d'affilée.
- Assistant de création de personnage : ne montre plus "Dé de vie : dX" sous le sélecteur de
  Classe — ce système n'expose jamais ce concept au joueur (PV max calculés automatiquement,
  repos/soins fixes ou via dés génériques).
- `world-items/features.json` : "Esquive totale" (Roublard, niveau 5) portait déjà exactement
  l'effet de l'Esquive instinctive SRD (réaction, réduit de moitié les dégâts d'une attaque
  touchée), sous le mauvais nom et jamais taguée `activation: "reaction"` — renommée et
  retaguée plutôt que dupliquée (une fausse "Esquive instinctive" ajoutée par erreur entre-temps
  a été supprimée : les deux auraient été octroyées simultanément à tout Roublard niveau 5).
- `world-items/spells.json` : le Rôdeur ne figure plus dans les classes de "Soin des
  blessures"/"Parler aux animaux" — il n'est pas dans `DND_CUSTOM.spellcastingClasses`
  (`config.js`) et ne les recevait donc jamais malgré sa présence dans `system.classes`.
- PV/pool de sorts par repos : ne peuvent plus dépasser leur max (création, saisie manuelle,
  variation du max lui-même).
- Montée de niveau et choix de sous-classe : accessibles à tout propriétaire de la fiche, pas
  réservés au MJ ; la montée de niveau rend aussi tous les PV.
- PNJ/monture : vitesse par défaut et données pré-remplies converties en mètres (affichait 30,
  valeur en pieds, au lieu de 9).
- Token lié à l'Actor par défaut pour un personnage joueur (`actorLink`) : désynchronisation
  PV token/fiche corrigée pour les nouveaux personnages, migration ponctuelle pour les
  existants.
- Chat "Appliquer les dégâts" : restreint à l'auteur du jet (ou au MJ), application unique.
- PvP bloqué entre personnages joueurs ; XP de combat attribué en entier à chaque participant
  (plus divisé).
- Inventaire : ajout/augmentation de quantité bloqués en cas de surcharge ; armes/armures ne
  se stackent plus (une ligne par objet) ; seuls les sacs restent équipables ; outils
  décrémentés à l'utilisation ; sorts filtrés par classe au glisser-déposer.
- Toutes les fiches d'Item + Journal/Capacités spéciales (PNJ) : descriptions HTML affichées
  en texte brut, balises comprises, remplacées par l'éditeur riche `<prose-mirror>`.
- Retire les mentions de dés de vie (système à PV calculés automatiquement) et les références
  explicites à D&D/SRD 5e du contenu visible des joueurs (Guide du Joueur, capacités de
  classe concernées).
- Deux bugs CSS : ellipsis manquant sur la colonne "Traits culturels" du Journal "Comparatif
  des Origines", police forcée sur la dernière pastille de langue de l'onglet Journal.
- Paladin : n'avait jamais sa propre Capacité "Canalisation divine" (réservée au Clerc dans
  les données), rendant "Arme sacrée" (Serment de Dévotion) inutilisable faute de réserve à
  consommer — Clerc/Paladin ont maintenant chacun la leur ("Canalisation divine (Clerc)"/
  "(Paladin)", même principe déjà en place pour "Incantation rituelle").
- Effet de bord d'un correctif de sécurité précédent (verrouillage du champ d'emplacement des
  armes/armures réservé au MJ sur la fiche d'Item) : un Joueur ne pouvait plus choisir la main
  (principale/secondaire) d'une arme à une main Légère au moment de l'équiper. Nouvelle fenêtre
  de choix proposée au moment de cocher "Équipé" (uniquement quand plusieurs emplacements sont
  possibles), sans reverrouiller le champ MJ.
- Fermer la fenêtre de choix Amélioration de caractéristiques/Don sans rien choisir perdait ce
  choix pour toujours (aucune re-proposition, aucun rattrapage possible), contrairement au choix
  de sous-classe. Le choix reste désormais dû (`system.attributes.pendingAsiChoices`), reproposé
  à chaque montée de niveau suivante, avec un badge de rattrapage manuel dans l'en-tête de la
  fiche pour le résoudre sans attendre.
- Aucun moyen de revenir en arrière dans la fenêtre de choix Amélioration de caractéristiques/
  Don une fois entré dans le formulaire Amélioration ou la liste des Dons — bouton "Retour"
  ajouté aux deux.
- Modificateur de compétence (onglet Statistiques) affiché en anglais (clé technique brute
  "str"/"dex"...) au lieu du nom localisé de la caractéristique.
- Taille de police des valeurs de monnaie (onglet Inventaire) trop petite (jamais fixée
  explicitement, retombait sur la taille par défaut du navigateur).
- Bouton de jet d'une Capacité affichant la formule Foundry brute ("1d10 + @attributes.level")
  au lieu d'un texte lisible (Second souffle, Attaque sournoise, Récupération arcanique, Corps
  parfait, Bienfait du Fiélon).
- `scripts/data/origins.json` : champ `inspiration` (pays réels : France, Germanie, Italie,
  Angleterre, Espagne, Arabie) orphelin depuis le retrait de la colonne correspondante du
  Journal "Comparatif des Origines", plus référencé nulle part — supprimé.

### Ajouté
- Vrais emplacements de sorts par niveau (1 à 9, SRD 5e) à la place du pool unique "Sorts par
  repos" (`system.spells.slots`, `scripts/data/character-data.js`) : un jeton par palier
  réellement accessible sur l'onglet Sorts, décompté au lancer selon le niveau du sort. Si
  l'emplacement du niveau exact d'un sort est épuisé mais qu'un palier supérieur a des charges,
  une fenêtre de choix (`scripts/helpers/spell-slot-choice.js`) propose de surclasser plutôt que
  de bloquer le lancer. L'Occultiste (Magie de Pacte) reste un cas particulier SRD (un seul
  palier actif, qui monte avec le niveau, rechargé au repos court ET long), signalé par un badge
  dédié sur l'onglet.
- 24 sous-classes supplémentaires (`world-items/subclasses.json`, 2 par classe, inspirées de
  Baldur's Gate 3) : Voie du Cœur sauvage/Voie de la Magie sauvage (Barbare), Collège des
  Lames/Collège de la Vaillance (Barde), Domaine de la Lumière/Domaine de la Ruse (Clerc),
  Cercle de la Lune/Cercle des Spores (Druide), Maître de guerre/Chevalier occulte (Guerrier),
  Voie de l'Ombre/Voie des Quatre Éléments (Moine), Serment des Anciens/Serment de Vengeance
  (Paladin), Maître des bêtes/Traqueur des ténèbres (Rôdeur), Bretteur/Assassin (Roublard),
  Magie sauvage/Sorcellerie des tempêtes (Ensorceleur), Le Grand Ancien/L'Archifée
  (Occultiste), École de nécromancie/École d'illusion (Magicien) — chacune avec 1 ou 2
  Capacités signature apportant un mécanisme actif propre : réserve de Ki réutilisée, état à
  activer/poser manuellement (nouveaux états homebrew "En Forme sauvage"/"Traqué"), choix
  ponctuel verrouillé (esprit totem), compagnon animal invocable, incantation mineure toujours
  prête sans emplacement dédié, critique automatique contre une cible "Surprise", table de
  surtenance sauvage (RollTable Foundry native, tirage auto posté en chat au déclenchement).
- 26 sorts SRD 5e supplémentaires (`world-items/spells.json`, niveaux 0-2 puis 4-5),
  rééquilibrant la variété entre classes (Paladin/Druide/Clerc/Barde/Occultiste étaient
  nettement moins dotés que Magicien/Ensorceleur) et prolongeant la progression au-delà du
  niveau 3 pour les 7 classes lanceuses : Moqueries cruelles, Avis divin, Thaumaturgie,
  Druidisme, Prestidigitation, Illusion mineure, Ordre, Sanctuaire, Protection contre le mal
  et le bien, Enchevêtrement, Malédiction du sorcier, Charme-personne, Restauration
  inférieure, Peau d'écorce, Arme spirituelle, Suggestion, Tempête de grêle, Mur de feu,
  Liberté de mouvement, Invisibilité suprême, Bannissement, Divination, Porte dimensionnelle,
  Soins de groupe, Immobilisation de monstre, Domination de personne.
- 21 capacités de classe de base SRD 5e supplémentaires (`world-items/features.json`),
  niveaux 3 à 9, sur 8 des 12 classes : Attaque supplémentaire, Vitesse accrue, Instinct
  sauvage, Critique brutal (Barbare) ; Chant de repos, Source d'inspiration, Contre-chant
  (Barde) ; Destruction des morts-vivants (Clerc) ; Attaque supplémentaire, Indomptable
  (Guerrier) ; Déviation de projectiles, Chute amortie, Attaque supplémentaire, Frappe
  étourdissante, Coups empreints de Ki (Moine) ; Attaque supplémentaire, Aura de protection
  (Paladin) ; Attaque supplémentaire, Déplacement facilité (Rôdeur) ; Esquive totale, Évasion
  (Roublard).
- Système de sous-classes : sélecteur sur la fiche de personnage (une fois le niveau
  d'obtention SRD atteint — 1 pour Clerc/Ensorceleur/Occultiste, 2 pour Druide/Magicien, 3
  pour les 8 autres classes), octroi automatique des Capacités liées (nouveau champ
  `system.subclass`), nouveau type d'Item `subclass` et son compendium. Une sous-classe SRD
  par classe (12 au total, 24 Capacités) : Voie du Berserker, Collège du Savoir, Domaine de
  la Vie, Cercle de la Terre, Champion, Voie de la Main Ouverte, Serment de Dévotion,
  Chasseur, Voleur, Lignage draconique, Le Fiélon, École d'évocation.
- Système de dons (10 dons du manuel officiel, règle optionnelle en alternative à une
  Amélioration de caractéristiques) : nouveau compendium "Dons", réutilisant le type d'Item
  `feature` existant (jamais auto-octroyé, `class`/`subclass` vides) — Athlète, Doué,
  Sentinelle, Alerte, Tenace, Chanceux, Magie d'initié, Résilient, Guérisseur, Combat monté.
- Barre de progression XP visible au joueur (pourcentage relatif au niveau suivant
  uniquement, jamais de chiffre — le total et les seuils exacts restent réservés au MJ) ;
  résumé des états actifs visible dans l'en-tête, partagé par tous les onglets.
- Boutons Attaque/Dégâts de l'onglet Équipement mis en évidence (vrais boutons avec icônes) ;
  icône de dé sur les autres boutons de jet de la fiche, à la place du seul soulignement en
  pointillés.
- Sorts émettant de la lumière (nouveau champ `SpellData#light`, ex. le sort Lumière) :
  allument désormais le(s) token(s) du lanceur, comme un objet `gear` "light" équivalent.
- Techniques consommant la réserve d'une autre Capacité (nouveau champ générique
  `FeatureData#costsResource`, ex. les techniques de Moine consommant du Ki) : bouton dédié
  "Réserve : Technique" sur la fiche, grisé/non cliquable dès la réserve épuisée, décompte au
  clic. Trois nouvelles Capacités de Moine niveau 2 (Rafale de coups, Défense patiente, Pas du
  vent, jusqu'ici seulement citées en texte dans la description de "Ki") plus reliage de
  Frappe étourdissante (Moine), Canalisation divine : Préserver la vie (Clerc) et Arme sacrée
  (Paladin), Affinité élémentaire (Ensorceleur, option active seulement — le bonus passif de
  dégâts reste automatique et gratuit) sur leurs réserves respectives.
- Onglet Capacités/Sorts : en-tête spécialisé par classe (titre thématique, icône, accroche —
  ex. "Rage" pour le Barbare, "Voie du Ki" pour le Moine), une partial Handlebars dédiée par
  classe (`templates/actor/abilities/*.hbs`).
- Système de réaction en combat (économie d'action SRD 5e) : nouveau champ `activation`
  (Action/Action bonus/Réaction/Libre) et `reactionTrigger` sur les Capacités/Sorts ; une seule
  réaction utilisable par round, régénérée automatiquement au début de son propre tour (hooks
  `updateCombat`/`deleteCombat`, Combat Tracker natif) ; badge "Réaction" et bouton grisé sur
  l'onglet Capacités/Sorts, indicateur cliquable (rattrapage manuel) dans l'en-tête commune.
  Retagués en conséquence : Bouclier, Contresort, Déviation de projectiles, Mots cinglants,
  déjà écrits comme des réactions en description mais restés `activation="action"` par défaut.
- Capacités universelles (nouveau champ `FeatureData#universal`, octroyées à toute classe
  indépendamment de `system.class`) : Attaque d'opportunité (règle SRD commune à tous, niveau 1)
  et Esquive instinctive (Roublard, niveau 5) — première réaction ajoutée au contenu qui ne
  soit pas propre à une seule classe.
- Le don Sentinelle modifie automatiquement le déclencheur affiché d'Attaque d'opportunité
  (fonctionne même contre le désengagement, se déclenche aussi pour une cible tierce à 1,50 m)
  dès qu'un personnage possède les deux Capacités (`opportunityAttackTrigger`, rules.js) —
  recalculé à l'affichage, jamais persisté sur l'Item, reste à jour si Sentinelle est
  ajoutée/retirée.
- Montée de niveau, aux niveaux 4/8/12/16/19 (SRD 5e) : petite fenêtre de choix Amélioration de
  caractéristiques / Don (`offerAbilityScoreOrFeatDialog`, `scripts/helpers/level-up-choice.js`)
  avant l'ouverture du dialogue correspondant — jusqu'ici le Don n'était accessible qu'en le
  glissant manuellement depuis le compendium "Dons", jamais proposé au moment de la montée de
  niveau. Le choix "Don" liste ceux du compendium non déjà possédés, description complète
  affichée pour décider.
- Montée de niveau, au niveau propre à chaque classe (SRD 5e) : petite fenêtre de choix de
  sous-classe (`offerSubclassChoiceDialog`, `scripts/helpers/subclass-choice.js`), description
  complète de chaque sous-classe affichée — jusqu'ici seul le sélecteur permanent de l'en-tête de
  la fiche permettait ce choix, jamais proposé au moment précis de la montée de niveau (même
  lacune que pour le Don). Le sélecteur d'en-tête reste disponible en secours si la fenêtre est
  fermée sans choisir.
- Compendium Classe : champs structurés (jets de sauvegarde maîtrisés, compétences à choisir à
  la création, catégories d'armes maîtrisées), sortis de la description en prose libre —
  informatif uniquement, `config.js` reste la source utilisée par les calculs de la fiche.
- Macro monde MJ "Resynchroniser un token" (`scripts/helpers/token-sync.js`) : relie à sa fiche
  un token de personnage joueur resté non lié (`actorLink: false`) — cas résiduel d'un token
  posé sur une scène avant le correctif de liaison automatique et déjà désynchronisé à ce
  moment-là, que la migration automatique laisse volontairement de côté par sécurité. Demande au
  MJ lequel des deux PV garder (token ou fiche) si les deux divergent avant de relier.

## [0.15.0] - 2026-08-10

Troisième passe de retour de test : assistant de création, fiche de personnage, équipement et
onglet Sorts/Capacités.

### Corrigé
- Onglet Équipement : les dégâts et les boutons de jet d'attaque/dégâts d'une arme équipée ne
  s'affichaient jamais (`{{#with (lookup ../weaponStats ...)}}` référençait un contexte
  Handlebars inexistant hors d'un `#each`/`#with` englobant — corrigé pour Main
  principale/secondaire et Armure portée).
- Inventaire : les 4 champs de monnaie (pc/pa/po/pp) se chevauchaient sur une fiche étroite,
  faute de `min-width: 0` sur les `<input>` (largeur minimale intrinsèque non neutralisée,
  contrairement au `<label>` parent).
- Fiche de personnage : Classe et Origine illisibles dans l'en-tête (couleur héritée du corps
  de fiche via `.roll-btn { color: inherit }`, au lieu de la couleur claire prévue pour le fond
  bois sombre de l'en-tête) — au repos et au survol.
- L'assistant de création de personnage s'affichait en même temps que la fiche en dessous
  (ouverture automatique à la création d'un Actor, et bouton "Créer un personnage") : la fiche
  se ferme désormais à l'ouverture de l'assistant, et se rouvre à la fin.

### Ajouté
- Assistant de création : listes Origines/Classes triées par ordre alphabétique ; les cases de
  compétences se désactivent automatiquement une fois le quota de la classe atteint (au lieu
  d'un simple refus à la soumission) ; les titres "Caractéristiques"/"Maîtrises de
  compétences" sont sortis du cadre du formulaire.
- Fin de l'assistant : le joueur (hors MJ) devient propriétaire de la fiche créée et son
  personnage assigné (`User#character`).
- Le bouton "Créer un personnage" disparaît définitivement une fois Classe et Origine
  renseignées (fiche déjà construite).
- Onglet Sorts/Capacités : le trait/sort d'Origine ressort maintenant au-dessus, dans son
  propre encadré ; Capacités et Sorts s'affichent dans deux colonnes côte à côte pour les
  classes lanceuses de sorts (une seule colonne Capacités sinon).

## [0.14.0] - 2026-08-10

### Ajouté
- Compendiums "Sorts" (`packs/sorts`) et "Capacités de classe" (`packs/capacites`), déclarés
  dans `system.json` au même titre que "Classes"/"Origines".

### Modifié
- Classes, Origines, Sorts et Capacités de classe sont désormais importés **automatiquement
  au chargement du monde** (hook `ready`) plutôt que par déclenchement manuel d'une Macro :
  le MJ n'a plus besoin de penser à lancer "Importer le contenu du système" pour peupler ces
  compendiums. La Macro reste créée en secours pour rejouer l'import à la demande.
- `spells.json`/`features.json` vont désormais dans leur propre compendium au lieu des Items
  du monde — glisser-déposer depuis le compendium vers la fiche de personnage, comme pour les
  autres objets de référence.

## [0.13.0] - 2026-08-10

Deuxième passe de retour de test sur la même session : le bug bloquant du wizard persistait
malgré la première correction, et plusieurs points de la passe précédente (compendiums
toujours vides, entrée "Créer un acteur") n'étaient pas encore pleinement fonctionnels.

### Corrigé
- Assistant de création : le bug "Chaque valeur du tableau standard... doit être utilisée
  exactement une fois" persistait malgré l'échange automatique de valeurs (correction
  précédente). Cause réelle : la lecture des données du formulaire via `formData.object`
  (FormDataExtended) pour des champs à points ("abilities.str") non liés à un Document. Lit
  maintenant directement les éléments du DOM (`form.elements`), comme le fait déjà
  `ability-score-improvement.js` dans ce même projet.
- Ouverture automatique de l'assistant à la création d'un Actor "Personnage" : le dialogue
  natif "Créer un acteur" ouvre aussi la fiche de personnage juste après la création, ce qui
  masquait immédiatement l'assistant en dessous. Un court délai garantit maintenant qu'il
  s'affiche après, donc au premier plan.
- Liseré gris persistant sous les icônes d'action de l'inventaire : la bordure statique avait
  été retirée à la passe précédente, mais le contour de focus par défaut du navigateur
  restait visible après un clic. Remplacé par un anneau de focus discret, clavier uniquement.

### Ajouté
- Macro monde "Importer le contenu du système" créée automatiquement (visible dans l'onglet
  Macros, MJ) : importe en un clic armes/armures/objets/outils/sorts/capacités dans les Items
  du monde, et Classes/Origines directement dans leurs compendiums (qui restaient vides faute
  d'avoir exécuté l'ancienne macro à copier-coller manuellement).
- Onglet Équipement : attaque et dégâts de l'arme équipée affichés comme deux boutons de jet
  distincts et cliquables (au lieu d'une seule ligne de texte) ; type d'armure affiché en plus
  de la CA pour l'armure du corps et le bouclier en main secondaire.
- Onglet Inventaire : colonne "Attaque" retirée (le jet d'attaque reste sur l'onglet
  Équipement) ; la colonne "Dégâts" affiche la valeur dynamique (une/deux mains selon
  l'équipement réel) en texte simple, non cliquable.
- Monnaie (onglet Inventaire) : chaque pièce est maintenant une colonne libellé-au-dessus-de-
  la-valeur centrée, sur une seule ligne, au lieu de champs bout à bout qui finissaient par
  stacker à gauche avec les noms complets.
- Lignes de l'inventaire forcées sur une seule ligne (`white-space: nowrap`).

## [0.12.0] - 2026-08-10

Traitement du retour de test en jeu (2026-08-09/10) sur la fiche personnage et l'assistant de
création : 1 bug bloquant corrigé + 15 points UX/features répartis sur les onglets
Statistiques/Équipements/Inventaire et les compendiums Classes/Origines.

### Corrigé
- Assistant de création : les 6 select de caractéristiques pouvaient afficher la même valeur
  du tableau standard sans qu'aucun indice ne le signale, déclenchant systématiquement
  l'erreur de validation même quand la répartition semblait correcte. Sélectionner une valeur
  déjà utilisée ailleurs échange désormais automatiquement les deux valeurs.
- Liseré gris disgracieux sous les icônes "Utiliser"/"Supprimer" de l'inventaire (bordure
  visible au repos, retirée sauf au survol).
- "Exhaustion" traduit en "Épuisement" (les autres états étaient déjà en français).

### Ajouté
- Ouverture automatique de l'assistant de création à la création d'un nouvel Actor
  "Personnage" vierge (ex. dialogue natif "Créer un acteur"), en plus du bouton existant sur
  la fiche.
- Nombre de compétences à choisir affiché dans l'assistant, mis à jour dès le choix de la classe.
- Boutons de jet (caractéristiques, compétences, sauvegardes, attaque/dégâts) désormais
  visuellement identifiables comme cliquables au repos (soulignement pointillé), pas
  seulement au survol.
- Classe et Origine sur la fiche personnage : champs fixes cliquables (au lieu de listes
  déroulantes) qui ouvrent la fiche de description correspondante (Item du monde ou des
  compendiums Classes/Origines) quand elle existe.
- Panneau des états déplacé en haut de l'onglet Statistiques (n'est plus tout en bas).
- Onglet Équipement : image, description courte et bouton de test d'attaque pour chaque objet
  équipé (main principale/secondaire, armure, accessoires).
- Armes Polyvalentes : les dégâts affichés/lancés par défaut suivent désormais l'équipement
  réel (deux mains si la main secondaire est libre, une main sinon) au lieu de toujours
  afficher les deux valeurs sans distinction.
- Monnaie remontée en haut de l'onglet Inventaire, avec les noms complets (Pièces de
  cuivre/argent/or/platine) au lieu des abréviations PC/PA/PO/PP.
- `world-items/classes.json` et `world-items/origins.json` : les 12 classes et 6 Origines
  prêtes à importer puis glisser dans les compendiums Classes/Origines (cf. leurs README).

## [0.11.0] - 2026-08-09

Suite de la session autonome (`ClaudeFiles/AUTONOMIE.md`) : les 4 pistes d'amélioration
proposées après la phase précédente (concentration, charges de capacités, XP automatique,
maîtrise d'outils).

### Ajouté
- Suivi de la concentration sur les sorts (SRD 5e) : lancer un sort concentration rompt
  automatiquement une concentration en cours ; subir des dégâts déclenche un jet de
  sauvegarde de Constitution automatique (DD 10 ou moitié des dégâts) qui rompt la
  concentration en cas d'échec. Bannière dédiée avec bouton pour l'interrompre volontairement.
- Utilisations limitées pour les capacités de classe (`system.uses`, 11 des 24 capacités du
  monde) : compteur affiché sur la fiche, décrémenté à l'usage, restauré au maximum lors d'un
  repos court ou long selon le type de récupération de la capacité.
- Distribution d'XP automatique à la mort d'un PNJ : la boîte de dialogue d'attribution d'XP
  (montant pré-rempli) s'ouvre directement côté MJ quand un PNJ tombe à 0 PV.
- Test de compétence automatique à l'utilisation d'un outil (`useEffect.skill`) : bouton
  "Utiliser" sur l'inventaire, bonus de maîtrise toujours appliqué (l'outil confère sa propre
  maîtrise, indépendante de celle de la compétence).

## [0.10.0] - 2026-08-09

Suite de la session autonome (`ClaudeFiles/AUTONOMIE.md`) : les 5 pistes d'amélioration
proposées après la phase précédente (mort/agonie, maîtrise d'armes, capacités de classe,
choix de montée de niveau, équipement de départ).

### Ajouté
- Mort et agonie (SRD 5e) : tomber à 0 PV rend automatiquement Inconscient et déclenche le
  suivi des jets de sauvegarde de la mort (3 réussites = stabilisé, 3 échecs = mort, statut
  "Mort" sur le token). Bouton de jet dédié, panneau "Agonie" dans la zone commune.
- Maîtrise d'armes par classe : le bonus de maîtrise ne s'applique plus au jet d'attaque que
  si la classe du personnage couvre la catégorie de l'arme équipée (avant : toujours
  appliqué). Étiquette "Non maîtrisé" sur les armes concernées.
- Bibliothèque de 24 capacités de classe SRD 5e prêtes à importer
  (`world-items/features.json`, 2 par classe) : rend l'onglet Capacités aussi peuplé que
  l'onglet Sorts. Bouton de jet relié pour les capacités à formule (ex. Second souffle).
- Amélioration de caractéristiques proposée automatiquement à la montée de niveau (niveaux
  4/8/12/16/19, SRD 5e) : +2 sur une caractéristique ou +1 sur deux, au choix.
- Équipement de départ (une arme + une armure typiques par classe) ajouté automatiquement à
  la fin de l'assistant de création de personnage.

## [0.9.0] - 2026-08-09

Suite de la session autonome (`ClaudeFiles/AUTONOMIE.md`) : compendium d'adversaires,
progression des personnages (XP, montée de niveau) et assistant de création. Univers sans
créature magique (cf. système d'Origines) : aucun monstre fantastique n'a été ajouté, que des
adversaires humains et des bêtes réelles.

### Ajouté
- 16 adversaires réalistes prêts à importer (`world-actors/adversaries.json`, nouveau dossier
  parallèle à `world-items/`) : 8 humains (Bandit, Garde, Vétéran, Noble, Malfrat, Éclaireur,
  Chef de bandits, Acolyte) et 8 bêtes (Loup, Ours brun, Sanglier, Mâtin, Cheval de selle,
  Grand serpent venimeux, Panthère, Chacal), FI 0 à 3, XP déjà rempli.
- Distribution d'XP : bouton "Attribuer de l'XP" sur la fiche PNJ (répartit son XP rapporté
  entre les personnages choisis) et macro monde auto-créée pour un montant libre. Confirmation
  toujours en chuchotement MJ, jamais de chiffre d'XP visible au joueur.
- Montée de niveau : table de seuils XP officielle SRD 5e (niveaux 1-20), badge "Niveau
  supérieur disponible" sur la fiche (sans révéler le total d'XP), bouton MJ qui incrémente le
  niveau d'un cran (PV max/emplacements de sorts/vitesse déjà recalculés automatiquement).
- Assistant de création de personnage : nouvelle Application accessible à tout propriétaire de
  la fiche (pas seulement au MJ) — Origine, Classe, répartition du tableau standard SRD 5e sur
  les 6 caractéristiques, maîtrises de compétences (nombre selon la classe), sauvegardes
  maîtrisées déduites automatiquement. Exception ciblée au verrouillage MJ des champs de
  "build" (option `dndCustomWizard` sur l'update), le formulaire normal de la fiche reste
  verrouillé pour un non-MJ.

## [0.8.0] - 2026-08-09

Première session en mode autonome (`ClaudeFiles/AUTONOMIE.md`) : le périmètre initial de
`PROJECT.md` (combat automatisé, compendiums de sorts/monstres explicitement exclus "pour
cette phase") n'est plus une limite — priorisé selon la valeur pour une table qui joue
réellement en Foundry.

### Ajouté
- Jet d'Initiative, intégré au Combat Tracker natif de Foundry : `"initiative": "1d20 +
  @attributes.initiativeMod"` dans `system.json`, bouton dans la zone commune (personnage)
  et l'en-tête (PNJ/monture). Délègue entièrement à `Actor#rollInitiative` (natif), qui crée
  le Combattant sur la scène active si besoin — aucune logique de combat maison.
- Bouton "Appliquer les dégâts" sur toute carte de chat de jet de dégâts : applique le total
  aux tokens actuellement ciblés (PV temporaires absorbés en premier, SRD 5e). Première
  brique d'automatisation de combat, sans ciblage/portée/grille tactique automatiques.
- Bibliothèque de 15 sorts SRD 5e prêts à importer (`world-items/spells.json`, 5 tours de
  magie + niveaux 1 à 3), même macro d'import que les autres `world-items/*.json` : rend le
  système de sorts (ajouté en 0.7.0) utilisable sans que le MJ crée tout à la main. Sélection
  non exhaustive, assumée comme telle.

## [0.7.0] - 2026-08-09

### Ajouté
- Système de jets de dés : les caractéristiques, sauvegardes, compétences (fiche personnage
  et PNJ/monture) et l'attaque/les dégâts d'arme sont désormais cliquables et postent un vrai
  jet Foundry dans le chat, avec avantage/désavantage (Maj-clic/Ctrl-clic). Jusqu'ici aucun
  jet n'existait dans le système — tous les bonus étaient du texte statique
  (`scripts/helpers/rolls.js`).
- États SRD 5e (14 conditions + Exhaustion à paliers 0-6) : affichés sur l'onglet
  Statistiques (personnage et PNJ/monture), bascule via `Actor#toggleStatusEffect`.
  Avantage/désavantage automatique aux jets concernés selon les états actifs (Empoisonné,
  Effrayé, Entravé, À terre, Aveuglé, Invisible, Exhaustion). Exhaustion réduit aussi la
  vitesse (niveau 2+) et les PV max (niveau 4+). Explicitement prévu dans `PROJECT.md`
  ("États et conditions"), non implémenté jusqu'ici.
- Système de sorts complet : nouveau type d'Item `spell` (niveau, école, composantes,
  portée, durée, concentration, rituel, préparé), emplacements de sorts par niveau dérivés
  automatiquement de la classe et du niveau (table complète SRD 5e — pleine pour les
  lanceurs classiques, demi-lanceur pour le Paladin, Magie de Pacte pour l'Occultiste,
  `scripts/data/spell-slots.json`), onglet Sorts avec jetons d'emplacements, liste par
  niveau et bouton "Lancer". Explicitement prévu dans `PROJECT.md`, jusqu'ici 0% implémenté.
- Table FI → XP officielle SRD 5e : pré-remplit le XP rapporté d'un PNJ quand son indice de
  dangerosité change (`DND_CUSTOM.challengeRatingXp`). Explicitement noté "prévu plus tard"
  dans `PROJECT.md`.
- Bonus de vitesse de classe : Célérité du Barbare (niveau 5+, +10 sauf armure lourde),
  Déplacement sans armure du Moine (niveau 2+, paliers progressifs, sans armure ni bouclier).

## [0.6.1] - 2026-08-09

### Ajouté
- Emplacement d'une arme à deux mains (`equipmentSlots`, `scripts/helpers/rules.js`) :
  occupe désormais automatiquement Main principale ET Main secondaire (champ Emplacement
  masqué sur sa fiche, note explicative à la place).
- Main secondaire réservée aux armes Légères (`isOffHandEligible`, SRD 5e règle du combat à
  deux armes) : une arme à une main non-Légère (Rapière, Épée longue...) ne peut plus être
  choisie ni équipée en Main secondaire.
- Hook global `preUpdateItem` (`scripts/dnd-custom-ai.js`) : équiper une arme/armure dont
  l'emplacement (main principale/secondaire/armure) est déjà occupé par un autre objet
  équipé est désormais refusé (pas de déséquipement automatique, contrairement aux sacs),
  avec un avertissement nommant l'objet en conflit.
- Bonus d'attaque et dégâts de chaque arme possédée (Force/Dextérité selon Finesse/portée,
  alternative Polyvalente à deux mains, `weaponAttackDamage`), et bonus de CA de chaque
  armure/bouclier/accessoire possédé (`armorContribution`) : affichés dans le tableau Armes
  et Armures de l'Inventaire et sous l'emplacement équipé correspondant sur l'onglet
  Équipement. Suppose la maîtrise systématique de toute arme équipée (pas de liste de
  maîtrises par classe dans ce système simplifié).

## [0.6.0] - 2026-08-09

### Corrigé
- Vraie cause du doublonnage au glisser-déposer (cf. tentative incomplète en 0.5.0) :
  `ActorSheetV2` (classe de base Foundry) lie déjà nativement son propre gestionnaire
  `dragover`/`drop` sur l'élément racine de la fiche à chaque render, en plus des listeners
  HTML5 maison ajoutés par `InventoryDragDropMixin` sur ce même élément — chaque drop créait
  donc l'objet deux fois. Remplacé par une surcharge du point d'extension officiel
  `_onDropItem(event, item)`, qui regroupe aussi en quantité si un objet de même nom/type
  existe déjà sur l'Actor au lieu de dupliquer la ligne.

### Ajouté
- Inventaire (personnage, PNJ/monture, véhicule) : quantité éditable et case "Équipé"
  directement dans le tableau (sans passer par la fiche de l'Item), nom cliquable pour
  ouvrir la fiche. `ToolData` reçoit `quantity`/`equipped`, qui lui manquaient, nécessaires
  à cette édition uniforme sur les 4 types d'Item transférables.
- Onglet Inventaire du personnage scindé en deux tableaux : Armes et Armures, puis Objets
  et Outils (`scripts/sheets/actor-sheet.js` > `weaponsAndArmor`/`gearAndTools`).

## [0.5.0] - 2026-08-09

### Corrigé
- Glisser-déposer d'objet dans l'inventaire (`InventoryDragDropMixin`,
  `scripts/sheets/inventory-drag-drop.js`) créait plusieurs exemplaires du même objet (2, puis
  6, puis 18...) : les listeners `dragover`/`drop` étaient re-liés sur l'élément racine à
  chaque re-render de la fiche (`_onRender`), sans jamais retirer les précédents — et créer un
  Item déclenche lui-même un re-render, donc les listeners s'accumulaient. Un flag posé sur
  l'élément racine limite désormais ce branchement à une seule fois.

### Ajouté
- Objets (`gear`) équipables avec bonus de capacité de charge (`system.equipped`,
  `system.capacityBonus`, `scripts/data/item-data.js`) : un sac équipé (Sac à dos, Grand sac,
  `world-items/gear.json`) augmente la capacité de charge de l'Actor
  (`carryingCapacityBonus`, `scripts/helpers/rules.js`) ; un seul contenant équipable à la
  fois (hook global `updateItem`, `scripts/dnd-custom-ai.js`).
- Objets "utilisables" génériques (`system.use.type`, `light`/`heal`, pilotés par les données
  de l'Item plutôt que par son nom) : bouton "Utiliser" dans l'onglet Inventaire
  (`templates/actor/tab-inventory.hbs`, action `useItem`, `scripts/sheets/actor-sheet.js`).
  - `light` : allume/éteint la lumière du/des token(s) de l'Actor sur la scène active, rayon
    selon l'objet (Bougie, Torche, Lanterne à capuchon, `world-items/gear.json`) ; une seule
    source active à la fois par Actor.
  - `heal` : rend `healBase + bonus de compétence` PV (ex. Trousse de soins = 1 + Bonus de
    Médecine, helper `skillModifier` dans `scripts/helpers/rules.js`).

## [0.4.0] - 2026-08-09

### Modifié
- Retiré les compendiums système "Objets", "Équipements" et "Outils" (`system.json`,
  `packs/objets`, `packs/equipements`, `packs/outils`) : ce contenu est plus à sa place dans
  l'onglet "Objets" du monde (partagé entre tables) que dans un compendium lié au système.
  Retiré au passage `seedCompendiumFromJson` (`scripts/helpers/compendium-seed.js`), le
  peuplement automatique testé la session précédente sur "Équipements", devenu inutile.
  "Origines" et "Classes" restent des compendiums système (contenu propre au système, pas au
  monde).

### Ajouté
- `world-items/` : données de référence SRD 5e à importer une fois dans les Items du monde
  (`armors.json` : 13 armures, `weapons.json` : 37 armes, `gear.json` : 15 objets
  d'aventurier, `tools.json` : 24 outils), avec une macro d'import fournie dans
  `world-items/README.md`. Remplace l'ancien contenu des 3 compendiums retirés ci-dessus.
- Nouveau type d'Actor `vehicle` (charrette, bateau...) : fiche minimale (nom, vitesse, PV,
  capacité de charge) avec un inventaire qu'on peut peupler/vider par glisser-déposer entre
  fiches ouvertes (`scripts/data/vehicle-actor-data.js`,
  `scripts/sheets/vehicle-actor-sheet.js`, `templates/actor/vehicle-sheet.hbs`).
- `InventoryDragDropMixin` (`scripts/sheets/inventory-drag-drop.js`), appliqué à la fiche de
  personnage et à la nouvelle fiche de véhicule : glisser-déposer HTML5 natif (armes,
  armures, objets, outils) entre deux fiches ouvertes — l'objet est déplacé (retiré de la
  fiche source), pas dupliqué, pour simuler "prendre un objet du véhicule et le ranger dans
  son sac". Bouton "Retirer" par ligne d'inventaire pour la suppression directe.
- Nouveau type d'Actor `mount` (montures vivantes) : réutilise entièrement la fiche PNJ
  (bloc de stats de créature, type/taille/FI, onglet "Butin") sous un type et un libellé
  dédiés ("Fiche de monture"). L'onglet "Butin" (PNJ comme monture) bénéficie désormais lui
  aussi du glisser-déposer et du bouton "Retirer", pour attacher/détacher de la sellerie ou
  de l'équipement.

### Retiré
- Type d'Item `vehicle` et compendium "Transports" (`packs/transports`) : redondants avec
  les nouveaux types d'Actor `mount` (montures vivantes) et `vehicle` (véhicules non-vivants,
  ajouté à la session précédente) qui couvrent maintenant ces deux cas avec un vrai
  inventaire manipulable, plutôt qu'un simple Item de référence.

## [0.3.1] - 2026-08-08

### Corrigé
- Peuplement de compendium (`seedCompendiumFromJson`, `scripts/helpers/compendium-seed.js`)
  bloqué par le verrouillage par défaut des compendiums système (erreur "You may not create
  documents in the locked compendium") : la fonction déverrouille désormais temporairement le
  compendium le temps de l'écriture, puis restaure son état de verrouillage initial.
  (Mécanisme retiré au profit de `world-items/` en 0.4.0, cf. plus haut.)

## [0.3.0]

### Ajouté
- Peuplement automatique de compendium depuis un JSON versionné avec le système
  (`scripts/helpers/compendium-seed.js`, `seedCompendiumFromJson`) : au démarrage du monde,
  ajoute les entrées manquantes (comparaison par nom) sans jamais écraser une entrée déjà
  présente. Testé sur le compendium "Équipements", peuplé avec les 13 armures SRD 5e
  (`scripts/data/armors.json`).

### Modifié
- Retiré la colonne "Inspiration" du Journal "Comparatif des Origines"
  (`scripts/helpers/origins-journal.js`). Le champ `inspiration` de l'Origine reste
  disponible sur sa fiche d'Item, seul l'affichage dans le tableau change ; un Journal déjà
  créé dans un monde existant n'est pas régénéré automatiquement (il faudrait le supprimer à
  la main pour qu'il soit recréé sans cette colonne).

### Corrigé
- Les 8 fiches d'Item (`templates/item/*.hbs`) ne s'ouvraient pas (erreur console
  `Template part "form" must render a single HTML element.`) : chaque template avait deux
  éléments racines (`<header>` puis `<div class="item-sheet-body">`), alors qu'ApplicationV2
  exige un unique élément racine par PART Handlebars. Les deux sont maintenant enveloppés
  dans un conteneur unique (`.item-sheet-root`, `display: contents` pour ne pas perturber la
  mise en page flex existante).

## [0.2.8]

### Ajouté
- Fiche d'édition (`ItemSheet`) dédiée pour chacun des 8 types d'Item (arme, armure, objet,
  capacité, origine, classe, outil, moyen de transport), avec un template Handlebars propre
  à chaque type (`templates/item/*.hbs`, `scripts/sheets/item-sheets.js`), remplaçant la
  fiche générique par défaut de Foundry. Structure des champs alignée sur
  `ClaudeFiles/ITEMS.md` :
  - Arme : type d'arme, prix, dégâts (dé + type), dégâts à deux mains (si Polyvalente),
    propriétés complètes (prise en main, polyvalente, finesse, légère, lancer, lourde,
    allonge, rechargement, portée, spéciale).
  - Armure : type d'armure (renommé depuis `category`), CA de base (renommée depuis `ac`),
    Force requise, désavantage aux tests de Discrétion.
  - Outil : prix, poids, effet à l'utilisation (compétence + bonus).
  - Moyen de transport : sous-type (monture/équipement/sellerie/véhicule à tractation/
    bateau), vitesse et capacité de charge affichées seulement pour les sous-types concernés.
  - Origine : gentilé, langue, description historique, en plus des champs mécaniques
    existants.
  - Capacité : référence vers une classe (liste dynamique des Items `class` du monde),
    niveau d'acquisition, jet de dé conditionnel.
- Étiquettes `TYPES.Item.*` en français/anglais pour les 8 types d'Item (affichées par
  Foundry dans la boîte de dialogue de création d'Item).
- Malus de vitesse (-10 pieds) si la Force du personnage est inférieure à la Force requise
  par l'armure équipée (SRD 5e), et étiquette "Désavantage" sur la compétence Discrétion si
  l'armure équipée l'impose — même principe visuel que l'étiquette "Avantage" d'Origine.
- Sous-schéma monnaie partagé (`scripts/data/shared-schema.js`) entre la monnaie de l'Actor
  et le prix de tout Item vendable.
- Convention de poids unique en kilogrammes dans toutes les données système, avec affichage
  automatique en grammes en dessous de 100 g (helper Handlebars `formatWeight`). La capacité
  de charge et le poids transporté de l'onglet Inventaire (qui inclut désormais aussi les
  Outils) suivent cette même convention.

### Modifié
- Renommage `armor.system.ac` → `baseAC` et `armor.system.category` → `armorType`
  (`scripts/data/item-data.js`, `scripts/helpers/rules.js`, `templates/actor/tab-equipment.hbs`)
  pour correspondre à `ClaudeFiles/ITEMS.md` ; comportement de calcul de CA inchangé.
- Simplifié : l'Item `class` reste nom + description pour cette phase (retrait des champs
  dé de vie/lanceur de sorts ajoutés puis retirés dans la même session — validé dans
  `ClaudeFiles/ITEMS.md`, la fiche de personnage continue de lire
  `CONFIG.DND_CUSTOM.classHitDice`/`.spellcastingClasses`).
- Corrigé au passage : la capacité de charge de l'onglet Inventaire utilisait la Force de
  base du personnage au lieu de la Force totale (bonus d'Origine inclus).

## [0.2.7]

### Ajouté
- Type d'Item `origin` (`scripts/data/origin-data.js`) : inspiration culturelle, traits,
  bonus de caractéristiques, avantages de compétences, trait spécial. Destiné au nouveau
  compendium "Origines" (`packs/origines`, déclaré dans `system.json`), à peupler à la main
  depuis l'interface Foundry (les 6 Origines restent pour l'instant lues depuis
  `scripts/data/origins.json` par la fiche de personnage — reliage au compendium prévu en
  suivi une fois celui-ci peuplé).
- Journal "Comparatif des Origines" auto-créé au premier chargement du monde (MJ
  uniquement) : tableau récapitulant, pour chacune des 6 Origines, l'inspiration culturelle,
  les traits, les bonus de caractéristiques, les compétences avantagées et le trait spécial.
- Types d'Item `class`, `tool` et `vehicle`, et 5 nouveaux compendiums vides déclarés dans
  `system.json` (`packs/classes`, `packs/objets`, `packs/equipements`, `packs/outils`,
  `packs/transports`) à peupler à la main depuis l'interface Foundry :
  - `class` (`scripts/data/class-data.js`) : dé de vie, lanceur de sorts ou non,
    description — pas encore relié à la fiche (système de classes non finalisé).
  - `tool` (`scripts/data/item-data.js`) : objet physique accordant un bonus à une
    compétence (ex. outils de voleur) ; bonus non encore appliqué automatiquement sur la
    fiche.
  - `vehicle` (`scripts/data/item-data.js`) : monture ou véhicule (charrette, bateau...)
    avec vitesse, capacité, CA et PV simplifiés.
  - Le compendium "Objets" est destiné aux Items `gear` existants, "Équipements" aux
    `weapon`/`armor` existants (aucun nouveau type nécessaire pour ces deux-là).

## [0.2.6]

### Ajouté
- Points de vie temporaires (`system.attributes.hp.temp`) sur la fiche de
  personnage : champ affiché entre parenthèses à côté de valeur/max
  (ex. `12 / 20 (+5)`).
- Calcul automatique de la Classe d'Armure : prise en compte des accessoires
  équipés (`slot: "accessory"`, ex. anneau/amulette de protection), en plus de
  l'armure et du bouclier déjà gérés.
- Initiative (mod. de Dextérité) et Perception passive (10 + mod. de Sagesse +
  bonus de maîtrise si la compétence est maîtrisée), affichées dans l'onglet
  "Statistiques".
- DD de sauvegarde des sorts et bonus d'attaque des sorts, affichés dans
  l'onglet "Sorts" pour les classes lanceuses.
- Application automatique des bonus de caractéristiques d'Origine (ex.
  Charisme +2/Force +1 pour Fleuraine) : nouveau champ dérivé
  `system.abilities.*.total` (base + bonus), utilisé pour tous les
  modificateurs (compétences, sauvegardes, PV, CA, Initiative, Perception
  passive, sorts). Le score de base saisi par le MJ reste inchangé et
  affiché séparément.
- Indicateur "Avantage" sur les compétences bénéficiant de l'avantage
  d'Origine (`skillAdvantages`) : purement informatif, la fiche ne gérant
  pas encore de jets de dés automatisés.
- Affichage du trait spécial de l'Origine choisie (nom + description) dans
  l'onglet "Statistiques".
- Boutons "+"/"-" (réservés au MJ) sur chaque caractéristique de la fiche de
  personnage, pour ajuster le score de base directement depuis la fiche
  (le bonus d'Origine reste appliqué séparément par-dessus).

### Modifié
- Repos court simplifié (sans réserve de dés de vie) : récupère la moitié
  des PV max (arrondi à l'inférieur), sans dépasser le max.
- Onglet "Statistiques" de la fiche de personnage : caractéristiques
  affichées en cartes verticales (valeur finale = base + bonus d'Origine,
  modificateur et bonus de sauvegarde) et compétences déplacées à droite
  sur deux colonnes triées par ordre alphabétique. Bonus de maîtrise,
  Initiative et Perception passive repositionnés sous le tableau de
  compétences.
- Trait spécial de l'Origine choisie déplacé de l'onglet "Statistiques" vers
  l'onglet "Capacités"/"Sorts", où il apparaît en tête de liste comme une
  capacité à part entière (étiquette "(Origine)").
- Légère mise en valeur graphique des fiches : survol des cartes de
  caractéristiques, emplacements d'équipement, capacités, lignes de
  compétences et lignes d'inventaire (changement de teinte de fond/bordure).
- En-tête de la fiche de personnage : les deux lignes de champs (Niveau/
  Classe/Origine puis PV/CA/Vitesse) s'étalent désormais sur toute la largeur
  de la fenêtre au lieu de rester groupées à gauche.
- Champ "Classe" de la fiche de personnage : liste déroulante fermée sur les
  12 classes officielles D&D 5e (SRD) au lieu d'un champ texte libre. Liste des
  classes lanceuses de sorts (qui bascule l'onglet en "Sorts") déplacée dans
  `CONFIG.DND_CUSTOM.spellcastingClasses`.
- Habillage visuel complet des fiches `character`/`npc` (thème "Manuscrit
  Arcanique" : parchemin, encre et or bruni), inspiré des maquettes de
  référence dans `images/feuilles-personnage/` : en-tête façon reliure de
  cuir avec barre de PV, titres d'onglet avec icônes, cartes de
  caractéristiques/équipement/capacités, tableaux d'inventaire et de butin,
  barre de capacité de charge, encart "Bourse" pour les monnaies.
- Remplacement complet du thème "Manuscrit Arcanique" (jugé pas assez
  "médiéval") par le thème "Auberge et Grand Chemin" : palette bois vieilli/
  parchemin taché/cire à cacheter, fond de fiche texturé (taches façon
  parchemin usé + vignette assombrie sur les bords), en-tête façon poutre de
  bois (grain), cartes moins arrondies avec léger relief (caractéristiques,
  équipement, capacités, tableaux), boutons d'action au tracé plus appuyé.
  Palette et polices restent pilotées par les mêmes variables CSS
  (`--dca-*`), donc structure/marquage inchangés.
- Ajout de vraies textures photo (CC0, voir `styles/textures/CREDITS.md`) pour
  casser les aplats de couleur du thème "Auberge et Grand Chemin" : fibre de
  parchemin sur le fond de fiche et les cartes (caractéristiques, équipement,
  capacités, barre d'onglets), veinage de bois sur l'en-tête et l'encart
  monnaie. Chaque usage superpose un voile de couleur semi-transparent sur la
  photo pour la raccorder à la palette du thème. Nouveaux fichiers
  `styles/textures/parchment.jpg` et `styles/textures/wood.jpg` (512×512,
  redimensionnés/recompressés depuis les sources CC0), référencés via les
  variables `--dca-texture-parchment` / `--dca-texture-wood`.

### Corrigé
- Contraste de texte insuffisant sur les fiches `character`/`npc` : plusieurs
  textes secondaires (sous-titres de section, tag de caractéristique associée,
  légende de capacité de charge, source de capacité, emplacements vides)
  utilisaient `--dca-outline`, une couleur de bordure trop claire pour du
  texte (~4.5:1). Nouvelle variable `--dca-muted-text` dédiée au texte
  discret, avec un contraste ~6:1 sur le parchemin.
- Contenu des onglets coupé lorsque la fenêtre de la fiche est plus petite que
  le contenu : en-tête et barre d'onglets restent désormais fixes, seul
  l'onglet actif défile verticalement (`overflow-y: auto`).
- Libellés et icônes de la barre d'onglets peu lisibles sur leur fond gris-
  beige plat : fond remplacé par un bandeau or/parchemin texturé et couleur
  de texte forcée en encre sombre (`!important`, pour prioriser sur les
  styles d'onglets par défaut de Foundry).

## [0.1.1]

Première ébauche du système : squelette complet, encore non testé dans un client
Foundry réel.

### Ajouté
- Manifeste `system.json` (Foundry VTT v13-14, `documentTypes`, `manifest`/`download`
  pointant vers les releases GitHub pour l'auto-update).
- Modèle de données (DataModel) de l'Actor "character" : 6 caractéristiques,
  18 compétences SRD 5e, jets de sauvegarde, PV/CA/vitesse/niveau, origine/classe,
  XP interne, monnaies, biographie/notes.
- Modèles de données des Items : `weapon`, `armor`, `gear`, `feature`.
- Données des 6 Origines (Fleuraine, Altenmark, Lucentia, Ravenmoor, Valdera, Ashar)
  externalisées en JSON : bonus de caractéristiques, avantages de compétences,
  trait spécial.
- Feuille de personnage (`ActorSheetV2` / ApplicationV2) avec un template par
  onglet : Statistiques, Équipement, Inventaire, Capacités/Sorts (selon la classe),
  Journal, plus une zone commune (nom, niveau, classe, PV, CA, vitesse, repos
  court/long).
- Règles D&D 5e sourcées : modificateur de caractéristique, bonus de maîtrise,
  capacité de charge (Force × 15 lb), conversion des monnaies en équivalent PC.
- Localisation française et anglaise.
- Feuille de style scopée au système.
- Workflow GitHub Actions (`workflow_dispatch`, sans saisie manuelle) qui lit la
  version depuis `system.json`, tague, construit le zip du système et publie une
  Release GitHub avec `system.json` en asset, pour l'installation/mise à jour de
  Foundry via le champ `manifest`.
- Type d'Actor `npc` (ennemi/PNJ) : modèle de données (`NpcData`) et fiche
  (`DndCustomNpcSheet`) distincts de `character` — type de créature et taille
  (listes SRD 5e), indice de dangerosité (FI, sourcé SRD), CA/PV/vitesse, bonus
  de caractéristiques (sauvegarde = bonus), capacités spéciales/particularité
  (texte libre), XP rapporté (saisie manuelle, table FI→XP prévue plus tard) et
  butin (réutilise les Items `weapon`/`armor`/`gear`).

### Corrigé
- Liste des compétences complétée : Perspicacité (Insight) ajoutée, absente de la
  spécification initiale (17 au lieu des 18 compétences standard du D&D 5e).
