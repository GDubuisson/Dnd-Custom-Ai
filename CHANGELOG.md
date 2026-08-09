# Changelog

Toutes les modifications notables de ce projet sont documentées dans ce fichier.

Le format est basé sur [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/),
et ce projet suit le [Semantic Versioning](https://semver.org/lang/fr/).

## [Non publié]

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
