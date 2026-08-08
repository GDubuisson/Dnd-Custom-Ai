# Changelog

Toutes les modifications notables de ce projet sont documentées dans ce fichier.

Le format est basé sur [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/),
et ce projet suit le [Semantic Versioning](https://semver.org/lang/fr/).

## [Non publié]

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
