# Conception fonctionnelle — dnd-custom-ai

Ce que fait le système, vu côté joueur/MJ. Remplace `PROJECT.md`/`ITEMS.md`/`CLASSES_CAPACITES.md`
(disparus, contenu repris et mis à jour ici) et les spécifications éparpillées dans les anciens
fichiers de retours testeurs. Voir `ClaudeFiles/CONCEPTION_TECHNIQUE.md` pour le "comment" et
`ClaudeFiles/ANOMALIES_ACTIVES.md` pour ce qui reste à corriger.

## Objectif global

Système de jeu de rôle personnalisé pour Foundry VTT, basé sur les règles de Donjons et Dragons 5e
Édition, avec une seule race jouable (Humain) dont les traits culturels et mécaniques varient
selon un système d'**Origines** géographiques inspirées de nations réelles.

## Scope

### Inclus
- Système complet compatible Foundry VTT v14.
- Feuille de personnage joueur à onglets multiples.
- Système d'Origines remplaçant les races classiques de D&D 5e.
- Statistiques, compétences, équipement, inventaire, capacités, sorts.
- Monnaies (PC/PA/PO/PP) avec conversion.
- Poids transporté et capacité de charge.
- Repos court/repos long.
- Combat : Combat Tracker natif, initiative, réactions, coups/échecs critiques, PvP bloqué,
  résistance/immunité/vulnérabilité aux dégâts (générique MJ, armes/PNJ magiques, armures).
- Fiches PNJ, Véhicule/Monture.
- Combat automatisé (positionnement, jamais d'interruption synchrone) — cadrage du 2026-08-23,
  cf. section "Combat — règles fonctionnelles" ci-dessous : Attaque d'opportunité, Sentinelle,
  Combat monté, suivi de l'Action/Action bonus du tour, Forme sauvage (Druide), Tactiques
  défensives (Rôdeur).
- 36 sous-classes (12 SRD 5e d'origine + 24 supplémentaires inspirées de Baldur's Gate 3, une de
  chaque famille par classe), chacune avec au moins une mécanique active sur la fiche.
- Français et anglais (les deux seules langues prévues).

### Exclus (scope actuel — peut évoluer sur cadrage explicite)
- Grille tactique complète avec interface de positionnement/pathfinding (le positionnement
  ci-dessus se limite à une mesure de distance ponctuelle, jamais un plateau interactif).
- Interruption synchrone du jet pour proposer une réaction (le déclenchement ci-dessus reste un
  rappel non-bloquant, jamais une pause du jet en attendant une réponse d'un autre client).
- Compendiums de sorts/monstres complets au-delà du contenu déjà fourni.
- Système de campagne ou scénarios prédéfinis.
- Historique des jets de dés dans la fiche.
- Icônes ou tokens personnalisés liés aux origines.
- Dés de vie côté joueur : ce système ne modélise **aucun** Hit Dice — PV/soins fixes ou via dés
  génériques uniquement, jamais de jet de Dé de vie visible ou jouable par le joueur.
- Aucune IA/automatisation de combat pour un compagnon animal (Maître des bêtes...).
- Sorts connus : un lanceur a accès à toute la liste de sorts de sa classe (jusqu'à son niveau
  maximum accessible), pas les tables "sorts connus" propres à chaque classe du SRD (Barde/
  Ensorceleur/Occultiste/Magicien).
- Multiclassage non géré (un seul champ Classe par personnage).
- Langues "spéciales" jamais octroyées automatiquement (ajout manuel par glisser-déposer
  uniquement) — seules Commune et la langue d'Origine le sont.
- Compendium "Classes" purement informatif : les champs sauvegardes/compétences/maîtrises visibles
  n'ont aucun effet sur les calculs de la fiche de personnage.
- Couvert (bonus de CA +2/+5 selon la position, SRD 5e) : aucune détection automatique fiable
  sans grille tactique/positionnement précis (déjà hors scope ci-dessus) — décision explicite de
  l'utilisateur (2026-08-25).
- Munitions (flèches, carreaux...) : décompte volontairement absent (une arme à distance/de trait
  garde uniquement son champ `reload`/rechargement) — charge de gestion jugée superflue, décision
  explicite de l'utilisateur (2026-08-25).
- Actions légendaires / actions de repaire (SRD 5e, capacités hors-tour d'un boss) : chantier
  lourd pour un cas d'usage rare, incompatible avec la fiche PNJ volontairement simplifiée de ce
  système — décision explicite de l'utilisateur (2026-08-25).
- Vision dans le noir/obscurité : sans objet, ce système n'a qu'une seule race jouable (Humain,
  cf. Système d'Origines) — aucune créature n'a de vision dans le noir à modéliser.
- Coups empreints de Ki (Moine 6), Explorateur-né (Rôdeur 1), Suggestion, Bannissement : pas de
  déclencheur fiable/automatisable sans fausser le jeu ou sur-complexifier pour la valeur.
- Bouclier/Sanctuaire/Contresort (sorts) : nécessitent une interruption synchrone d'un jet déjà
  résolu ou le choix de cible d'un tiers — même exclusion "combat automatisé avancé" que ci-dessus.
- 6 des 8 options de Métamagie (Distant, Prolongé, Rapide, Discret, Amplifié, Jumelé) : seules
  Sort Prudent/Sort Élevé sont automatisées (`helpers/metamagic.js`).
- Clauses situationnelles de Doué/Alerte (dons) : imitation de voix, ne peut être surpris — déjà
  partiellement automatisés (bonus fixes de caractéristique/Initiative), le reste resterait à
  l'arbitrage.

## Système d'Origines (remplace les races)

Tous les personnages sont des **Humains**. Leurs traits culturels et bonus mécaniques dépendent de
leur **Origine** (pays d'origine) :

| Origine | Inspiration | Traits culturels | Bonus de caractéristiques | Avantage sur compétences | Trait spécial |
|---|---|---|---|---|---|
| Fleuraine | France | Noblesse, chevalerie, droiture, honneur | Charisme +2, Force +1 | Persuasion, Intimidation | Honneur Inébranlable : 1×/combat, relance obligatoire d'une sauvegarde ratée contre peur/charme |
| Altenmark | Germanie | Force, courage, détermination, discipline | Force +2, Constitution +1 | Athlétisme, Survie | Discipline de Fer : jamais surpris par une embuscade en état d'alerte |
| Lucentia | Italie | Charme, éloquence, persuasion, commerce | Charisme +2, Dextérité +1 | Tromperie, Représentation | Art de la Parole : modificateur de Charisme ajouté aux tests d'Intimidation ou de Tromperie |
| Ravenmoor | Angleterre | Loyauté, pragmatisme, stoïcisme, devoir | Sagesse +2, Constitution +1 | Investigation, Perception | Stoïcisme : ignore les effets de peur, d'effroi ou d'illusions mineures |
| Valdera | Espagne | Piété, ferveur, passion, ardeur | Sagesse +2, Charisme +1 | Religion, Athlétisme | Ferveur Incarnée : 1×/jour, crée une petite flamme sans matériel |
| Azhar | Arabie | Sagesse, connaissance, réflexion, patience | Intelligence +2, Sagesse +1 | Histoire, Arcanes | Sagesse Ancienne : bonus d'Intelligence ajouté à un jet d'Investigation sur quelque chose de magique |

## Feuille de personnage — spécification par zone

### Zone commune (en-tête compact, visible sur tous les onglets)
En-tête tenant dans une fenêtre plafonnée à 708 × 768 px (adoptée le 2026-09-04, maquette
`maquettes/fiche-708x768/` ; la fenêtre reste librement agrandissable au-delà). Trois bandes
fines empilées :
1. **Identité** — portrait, nom, `Classe · Sous-classe · Origine` sur une ligne (cliquables pour
   ouvrir leur description ; le sélecteur de sous-classe MJ reste ici), niveau + bouton « monter
   de niveau » + jauge de progression d'XP.
2. **Constantes** — PV actuels/max (+ PV temporaires, + jauge), CA totale, vitesse de
   déplacement, Initiative, Perception passive, points d'inspiration. Ces valeurs restent
   visibles quel que soit l'onglet ouvert.
3. **Économie d'action** — indicateurs Action / Action bonus / Réaction, boutons Repos court /
   Repos long, badge d'Amélioration de caractéristiques/Don en attente le cas échéant.

Sous ces bandes : résumé compact des états actifs (si au moins un est actif) et panneau Agonie
(si le personnage est à 0 PV).

La fiche PNJ conserve l'en-tête d'origine (disposition en lignes) — le style compact est propre à
la fiche personnage.

### Onglet "Statistiques"
- 6 caractéristiques (Force, Dextérité, Constitution, Intelligence, Sagesse, Charisme) avec
  modificateurs — cases compactes (valeur à gauche, MOD./SAUV. à droite) en grille 2 × 3.
- 18 compétences SRD (dont Perspicacité), triées alphabétiquement, sur 2 colonnes.
- Jets de sauvegarde.
- États/conditions actifs, via liste déroulante à cocher (`<details>`), impactant les mécaniques
  de jets (avantage/désavantage selon la condition).
- Bonus de maîtrise, Initiative, Perception passive et Épuisement résumés en tête d'onglet
  (les deux valeurs dérivées y figurent en plus de la bande de constantes de l'en-tête).
- Gouttières latérales réduites sur cet onglet pour tenir la double colonne à 708 px de large.

### Onglet "Équipement"
Main principale (arme/objet), main secondaire (arme/bouclier/objet), armure portée, emplacements
accessoires (anneaux, amulettes...). Boutons d'attaque/dégâts mis en évidence (icônes dé/goutte),
distincts des autres jets de la fiche.

### Onglet "Inventaire"
Liste complète des objets transportés (équipés et non équipés), armes/armures affichées une ligne
par exemplaire (jamais stackées). Monnaies PC/PA/PO/PP (1 PP = 50 PO ; 1 PO = 10 PA = 100 PC).
Poids détaillé par objet + poids total transporté (somme automatique). Capacité de charge = Force
× 7,5 kg (système de poids détaillé, pas de variant simplifié) ; ajout/augmentation de quantité
bloqués en cas de dépassement. Seuls les objets à bonus de capacité de charge (sacs) restent
équipables depuis l'inventaire — la mécanique d'utilisation (soin, lumière, outil...) reste
disponible pour tout objet utilisable. Les outils voient leur quantité décrémentée à l'utilisation
(écart assumé au SRD, sur confirmation explicite testeur).

### Onglet "Capacités" / "Sorts"
Intitulé et contenu dépendent de la classe (`templates/actor/abilities/<classe>.hbs`, un template
dédié par classe + `default.hbs`) :
- **Classe lanceuse de sorts** → onglet "Sorts" : emplacements par niveau (1-9, SRD 5e), sorts
  préparés/connus, surclassement (upcasting) proposé au lancer si l'emplacement du niveau exact
  du sort est épuisé mais qu'un palier supérieur reste disponible.
- **Classe non lanceuse** → onglet "Capacités" : aptitudes de classe, dons, actions spéciales.

Langues connues affichées en haut de cet onglet (au-dessus du panneau de capacité d'Origine),
triées alphabétiquement (Commune + langue d'Origine) — déplacées depuis l'onglet Journal.

### Onglet "Journal"
Biographie, Notes (zones de texte riche ProseMirror).

### Infobulles de glossaire
Tous les libellés « techniques » de la fiche (PV, CA, Initiative, Perception passive, points
d'inspiration, Action / Action bonus / Réaction, Repos, caractéristique, modificateur,
sauvegarde, bonus de maîtrise, épuisement, états, DD/bonus d'attaque des sorts, emplacements de
sorts, concentration, rituel, monnaie, capacité de charge, emplacements d'équipement...)
affichent au survol une courte définition, tirée du même glossaire que la page « Glossaire » du
Guide du Joueur (`scripts/data/glossary.json`). Le texte libre (descriptions d'objets,
biographie) n'est volontairement pas concerné.

### Journaux générés dans le monde
Trois Journaux créés une fois au premier chargement (jamais réécrits ensuite, le MJ les édite
librement) : **Guide du Joueur** (glossaire, règles de base, sorts, classes, origines, langues,
équipement) et **Comparatif des Origines** sont visibles de tous les joueurs (`ownership` par
défaut = Observateur) ; le **Guide du MJ** reste réservé au MJ. L'en-tête de la fiche de
personnage porte un bouton « Guide du Joueur » (icône ?) qui ouvre le premier directement.

### Progression (XP, niveau)
Progression basée sur des points d'expérience gérés en interne. **Barre de progression visible au
joueur** : uniquement la progression relative vers le niveau suivant (%), jamais le total ni les
seuils chiffrés — ces valeurs exactes restent réservées au bloc MJ (`{{#if isGM}}`). Montée de
niveau : accessible au joueur (pas seulement au MJ), un seul niveau par clic, PV entièrement
restaurés à la montée de niveau, choix de sous-classe au niveau requis (verrouillé une fois fait),
choix Amélioration de caractéristiques/Don proposé aux niveaux prévus par le SRD (4, 8, 12, 16,
19).

### Points d'inspiration (règle maison, 2026-08-25)
Distincts de l'Inspiration bardique du SRD (Capacité de Barde). Compteur libre, sans maximum,
accordé manuellement par le MJ (champ éditable côté MJ uniquement, visible mais verrouillé côté
Joueur — même convention que le Niveau). Un Joueur en dépense un via un bouton qui apparaît
directement sous un jet de caractéristique **ou** de compétence dans le chat (jamais une
sauvegarde ni un jet d'attaque) : le jet d'origine disparaît du chat et un nouveau jet est
effectué sur la même caractéristique/compétence, résultat toujours conservé (même désavantageux).

## Fiche de PNJ (Actor type `npc`)

Fiche générique distincte de `character` pour adversaires et PNJ : pas de score de caractéristique
ni de maîtrise séparée — un **bonus direct** par caractéristique, la sauvegarde correspondante
étant toujours égale à ce bonus.

- Nom, type de créature (14 types SRD : Aberration, Bête, Céleste, Construction, Dragon,
  Élémentaire, Fée, Fiélon, Géant, Humanoïde, Monstruosité, Vase, Plante, Mort-vivant).
- Indice de dangerosité (FI) : 0, 1/8, 1/4, 1/2, puis paliers entiers 1 à 30.
- Taille : TP, P, M, G, TG, Gig.
- CA, PV actuels/max, vitesse.
- Bonus de caractéristiques (Force à Charisme).
- Onglet "Capacités spéciales" : deux blocs de texte libre (Capacités spéciales, Particularité).
- XP rapportés : pré-rempli automatiquement depuis la table FI → XP officielle SRD 5e dès que
  l'indice de dangerosité change, reste ensuite librement modifiable à la main.
- Onglet "Butin" : objets rapportés, réutilise les Items `weapon`/`armor`/`gear`.
- Un ou PLUSIEURS profils d'attaque (bouton "Ajouter une attaque"/"Retirer", ex. "Morsure" +
  "Griffe" sur un même PNJ), chacun basé sur Force ou Dextérité (au choix du MJ) et résolu par
  son propre bouton Attaque/Dégâts — jamais un seul jet combiné, fidèle au SRD. Aucune attaque
  configurée par défaut sur un PNJ neuf.

### Compendium "Adversaires" — bestiaire prêt à l'emploi
15 PNJ déjà configurés (attaques + butin embarqué), importés automatiquement comme le reste du
contenu de référence : 7 humanoïdes du FI 1/8 au FI 3 (Brigand, Maraudeur, Garde, Espion, Chef de
brigands, Mercenaire vétéran, Chevalier) et 8 bêtes sauvages réelles du FI 0 au FI 1 (Rat, Corbeau,
Loup, Sanglier, Serpent venimeux, Panthère, Crocodile, Ours brun) — volontairement aucune
créature légendaire/mythique/fantastique, cohérent avec le système d'Origines (cultures humaines
réelles, pas de races/monstres imaginaires). Seul compendium invisible aux joueurs (visible du MJ
uniquement) — un bestiaire n'a pas vocation à être consulté à l'avance par la table.

## Fiche Véhicule/Monture (Actor type `vehicle`)

Champs de base, barre de PV bornée, inventaire.

## Types d'Item

Convention d'unité de poids : le **kilogramme** est l'unité de référence pour tout objet ≥ 0,1 kg ;
le gramme est utilisé pour l'affichage des objets très légers (< 100 g) mais toujours **stocké en
interne en kg**.

| Type | Champs clés | Notes |
|---|---|---|
| `weapon` | type d'arme (CAC courante/de guerre, distance courante/de guerre), prix, `damage`/`damageVersatile` (dé + type), case "Magique", second type de dégâts bonus optionnel (`secondaryDamage`), poids, propriétés (une/deux mains, polyvalente, finesse, légère, lancer, portée, rechargement, lourde, allonge, spéciale) | `damageVersatile` affiché seulement si "Polyvalente" cochée ; "Magique" contourne la résistance/immunité générique aux 3 types physiques (nuance SRD) ; `secondaryDamage` = 2 messages de dégâts distincts pour 1 clic (ex. épée de feu) |
| `armor` | type (légère/intermédiaire/lourde), prix, `baseAC`, Force requise, désavantage Discrétion, poids, résistance/immunité/vulnérabilité aux dégâts PROPRE (13 types, comme la fiche Personnage/PNJ) | CA légère = baseAC + Dex complet ; intermédiaire = baseAC + Dex plafonné à +2 ; lourde = baseAC seul (jamais de Dex) ; la résistance/immunité/vulnérabilité de l'armure n'agit QUE si elle est équipée, et n'a jamais la nuance "contourné par une source magique" (contrairement au champ générique) |
| `gear` (objet générique) | nom, quantité, poids unitaire, prix unitaire, description | poids total = quantité × poids unitaire (calculé) |
| `feature` (capacité) | nom, classe, sous-classe (si propre à une sous-classe), niveau d'acquisition, description, formule de jet optionnelle | capacités "universelles" (ex. Attaque d'opportunité) octroyées à toute classe indépendamment de `system.class` |
| `origin` | nom, gentilé, langue, description, image, bonus de caractéristiques, compétences avantagées, trait spécial | champs mécaniques indispensables — appliqués à l'Actor à l'attribution |
| `class`/`subclass` | nom, description (flavor uniquement), sauvegardes maîtrisées, quota de compétences, maîtrises d'armes | la donnée mécanique réelle (capacités par niveau) vit dans `CONFIG.DND_CUSTOM` + `world-items/features.json`, pas sur cet Item |
| `tool` (outil) | nom, prix, poids, compétence/bonus lié, description RP | bouton "Utiliser" lance le test de compétence lié (bonus de maîtrise + bonus éventuel) |
| `spell` (sort) | classes autorisées (cases à cocher), niveau, école, composantes, formule de dégâts/soin | filtré par classe au glisser-déposer sur la fiche |
| `language` (langue) | nom, description | Commune + langue d'Origine toujours connues ; langues "spéciales" ajoutables par glisser-déposer depuis le compendium |

## Classes, sous-classes et capacités (référence de contenu)

12 classes SRD 5e, chacune avec **3 sous-classes** (36 au total, inspiration Baldur's Gate 3,
demandé par le testeur) : la sous-classe SRD 5e d'origine + 2 sous-classes supplémentaires. Contenu
source : `world-items/classes.json`, `subclasses.json`, `features.json`, `feats.json`,
`scripts/helpers/config.js` — cette section n'est qu'un résumé de lecture, pas lue par le code.
⚡ = capacité de type Réaction. Le tableau ci-dessous liste, par classe, la sous-classe SRD
d'origine (colonne "Sous-classe (niveau)") — toutes les sous-classes ont désormais au moins une
mécanique active sur la fiche (les 24 supplémentaires via un bouton dédié : tirage automatique,
compagnon invocable, choix verrouillé, critique automatique, résistance aux dégâts, immunité de
condition...), détail complet dans `world-items/README.md` et le compendium "Sous-classes".

| Classe | Dé de vie interne | Sauvegardes | Sorts | Sous-classe (niveau) | Capacités phares |
|---|---|---|---|---|---|
| Barbare | d12 | Force, Con | Non | Voie du Berserker (3) | Rage, Défense sans armure, Attaque suppl. (5), Critique brutal (9) |
| Barde | d8 | Dex, Cha | Oui (Cha) | Collège du Savoir (3) | Inspiration bardique, Aptitudes multiples, Contre-chant |
| Clerc | d8 | Sag, Cha | Oui (Sag) | Domaine de la Vie (1) | Incantation rituelle, Canalisation divine, Disciple de la vie |
| Druide | d8 | Int, Sag | Oui (Sag) | Cercle de la Terre (2) | Incantation rituelle, Forme sauvage, Sorts de cercle |
| Guerrier | d10 | Force, Con | Non | Champion (3) | Second souffle, Sursaut d'activité, Attaque suppl. (5), Indomptable (9), Critique amélioré (19-20) |
| Moine | d8 | Force, Dex | Non | Voie de la Main Ouverte (3) | Ki, Rafale de coups, Défense patiente, Pas du vent, Déviation de projectiles ⚡ |
| Paladin | d10 | Sag, Cha | Oui (Cha) | Serment de Dévotion (3) | Sens divin, Imposition des mains, Canalisation divine, Aura de protection |
| Rôdeur | d10 | Force, Dex | Non | Chasseur (3) | Ennemi juré, Explorateur-né, Attaque suppl. (5) |
| Roublard | d8 | Dex, Int | Non | Voleur (3) | Attaque sournoise, Action rusée, Esquive instinctive ⚡, Évasion |
| Ensorceleur | d6 | Con, Cha | Oui (Cha) | Lignage draconique (1) | Sorcellerie innée, Métamagie |
| Occultiste | d8 | Sag, Cha | Oui (Cha, repos court ou long) | Le Fiélon (1) | Magie de pacte, Invocations occultes |
| Magicien | d6 | Int, Sag | Oui (Int) | École d'évocation (2) | Grimoire, Récupération arcanique |

Capacités universelles : Attaque d'opportunité ⚡ (modifiée si le don Sentinelle est possédé),
Agripper et Bousculer (test opposé, cf. "Combat — règles fonctionnelles" ci-dessous).

**Dons** (`world-items/feats.json`) : règle optionnelle SRD, alternative à une Amélioration de
caractéristiques (niveaux 4, 8, 12, 16, 19), jamais octroyés automatiquement — Athlète, Doué,
Sentinelle, Alerte, Tenace, Chanceux, Magie d'initié, Résilient, Guérisseur, Combat monté.

## Combat — règles fonctionnelles

- Jet d'attaque comparé automatiquement à la CA de la cible sélectionnée (touché/raté affiché) ;
  sans cible, le jet reste manuel (au MJ de juger), jamais d'erreur remontée.
- PvP bloqué : un joueur ne peut pas infliger de dégâts à un **autre** personnage joueur via le
  bouton "Appliquer les dégâts", ni à lui-même (seul le MJ peut appliquer un auto-dégât — poison,
  chute, piège...).
- **Coups et échecs critiques** (1/20 naturel), uniquement pendant un combat actif, sur les jets
  d'attaque et de sauvegarde : 20 naturel = réussite automatique + dés de dégâts doublés (jamais le
  modificateur) ; 1 naturel = échec automatique. Le message de chat n'affiche alors que le résultat
  brut du d20, sans les modificateurs. Effet visuel dédié sur la carte de jet (bordure/halo +
  icône, pas la couleur seule).
- XP de combat : répartie en entier à chaque participant, jamais divisée entre eux.
- Agonie/mort : à la stabilisation d'un personnage inconscient, ses états liés à l'agonie sont
  retirés et 1 PV lui est rendu automatiquement.
- Réaction régénérée en avançant le tour du Combat Tracker natif ; Action/Action bonus suivis de
  la même façon, mais en rappel **non-bloquant** seulement (jamais de jet refusé) et uniquement
  tant qu'un combat suit le personnage.
- **Attaque d'opportunité** (capacité universelle) : rappel de chat automatique quand un PNJ
  hostile quitte la portée de mêlée (1,50 m) d'un Combattant joueur ayant sa réaction disponible.
  Le don **Sentinelle** modifie ce déclenchement (fonctionne aussi contre le désengagement, se
  déclenche pour une cible tierce à 1,50 m) et ajoute un rappel symétrique quand un PNJ hostile
  attaque un allié à portée plutôt que le porteur du don.
- **Agripper / Bousculer** (capacités universelles) : au lieu d'une attaque, un personnage peut
  tenter d'agripper ou de bousculer une seule créature à sa portée — premier test OPPOSÉ du
  système (les deux camps lancent un d20, comparés entre eux ; égalité = statu quo). La défense
  retient le meilleur des jets d'Athlétisme/Acrobaties de la cible. Agripper réussi : état
  "Agrippé" posé automatiquement. Bousculer réussi : l'attaquant choisit d'avance entre "à terre"
  (état "Prone" posé automatiquement) et "repoussé de 1,50 m" (jamais automatisé — ce système ne
  déplace jamais un token, simple mention dans le message).
- **Combat monté** (don) : un personnage "monté" sur une créature de type Monture bénéficie de
  l'avantage automatique à ses jets d'attaque contre une cible strictement plus petite que sa
  monture ; un rappel textuel s'ajoute à ses jets de sauvegarde de Dextérité (résultat pour la
  monture laissé au MJ).
- **Forme sauvage** (Druide) : prendre forme cible une créature dédiée (2e réserve de PV propre,
  jamais cumulée à celle du personnage) ; retour à la forme normale volontaire à tout moment ou
  automatique à 0 PV de forme (dégâts excédentaires jamais reportés sur le personnage).
- **Tactiques défensives** (Hunter, Rôdeur) : selon l'option choisie, avantage automatique à la
  sauvegarde contre Effrayé (Volonté de fer) ou contre l'attaquant ayant déjà attaqué ce round
  (Défense contre les attaques multiples), ou désavantage sur le prochain jet d'un PNJ hostile
  dont on vient de s'éloigner (Échappée de la horde).
- **Résistance/immunité/vulnérabilité aux dégâts** : réglable librement par le MJ sur toute fiche
  Personnage/PNJ (3 groupes de cases à cocher, 13 types SRD), et propre à chaque armure équipée
  (mêmes cases, indépendantes de celles du personnage — la meilleure protection l'emporte,
  résistance + vulnérabilité sur le même type s'annulent). Nuance SRD "contourné par une source
  magique" (case "Magique" sur une arme/le profil d'attaque d'un PNJ) : ne concerne QUE les 3 types
  physiques (contondant/perforant/tranchant) ET uniquement le réglage générique du personnage/PNJ —
  jamais une résistance déjà propre à une Capacité (Rage...) ni à une armure. Une arme/attaque de
  PNJ peut infliger un second type de dégâts bonus, résolu indépendamment du premier (ex. épée de
  feu = tranchant + feu, 2 messages de chat pour 1 clic).
- **Rage** (Barbare) : tant que l'état "En Rage" est actif, avantage aux tests et sauvegardes de
  Force, +2 dégâts aux attaques de corps à corps à la Force, résistance aux dégâts contondants/
  perforants/tranchants — indépendant de la possession de la Capacité elle-même.
- **Destruction des morts-vivants** (Clerc 5) : "Repousser les morts-vivants" détruit directement
  (au lieu de simplement repousser) un mort-vivant dont l'indice de dangerosité est sous le seuil
  de la table SRD pour le niveau du Clerc.
- **Voile des anciens** (Paladin, Serment des Anciens) : résistance aux dégâts de sorts (quel que
  soit leur type) dans une zone de 3 m autour d'un Paladin ayant activé la bascule dédiée.
- **Ennemi juré** (Rôdeur 1) : choix ponctuel et définitif d'un type de créature favori — avantage
  automatique aux tests de Survie et d'Intelligence contre une cible ciblée de ce type.
- **Traque implacable** (Paladin, Serment de Vengeance 3) : bouton dédié qui désigne la cible
  actuellement ciblée comme proie ("Traqué") et consomme la réserve de Canalisation divine. Tant
  qu'elle porte cet état, toute créature AUTRE que le Paladin qui l'a désignée subit un désavantage
  automatique à ses jets d'attaque contre elle (arme/sort d'un personnage, attaque d'un PNJ) — un
  état "Traqué" posé à la main depuis l'onglet États (sans passer par ce bouton) reste un simple
  marqueur visuel, sans désavantage automatique.
- **Application des dégâts d'un sort à sauvegarde** : tient compte du résultat du jet de CHAQUE
  cible (réussite = moitié des dégâts si le sort le prévoit sinon aucun ; échec = dégâts pleins).
  Deux exceptions automatisées : **Évasion** (Roublard 7 — réussite = aucun dégât, échec = moitié)
  et **Tour de magie renforcé** (Magicien Évocation 6 — réussite à un tour de magie = moitié au
  lieu d'aucun).

## Accessibilité

Couleurs et styles retravaillés pour respecter le RGAA (référentiel français basé sur le W3C) :
contrastes texte/fond suffisants dans toute l'interface, jamais la couleur seule pour porter une
information (ex. critiques de combat : bordure/icône en plus de la couleur).

## Langue

Tout le contenu visible en jeu (labels, textes UI, noms de compétences, descriptions) est en
français, avec traduction anglaise complète (`lang/en.json`). Le code (variables, fonctions,
commentaires techniques) reste en anglais/conventions standards de développement.
