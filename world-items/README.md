# Contenu de référence à importer

## Comment ça s'importe

Tout le contenu de référence ci-dessous est importé **automatiquement au premier chargement du
monde** (hook `ready`, MJ uniquement — cf. `scripts/dnd-custom-ai.js` et
`scripts/helpers/content-import.js`), sans jamais dupliquer une entrée déjà présente
(comparaison par nom) : rejouable sans risque à chaque mise à jour du système, aucune action
du MJ n'est nécessaire.

Une Macro monde **"Importer le contenu du système"** est aussi créée automatiquement (visible
dans l'onglet "Macros", MJ uniquement) en secours, si vous voulez rejouer l'import à la
demande (ex. juste après une mise à jour du système, sans attendre le prochain rechargement).

- `armors.json`, `weapons.json`, `gear.json`, `tools.json` → importés dans les Items du monde
  (onglet "Objets" de Foundry, entre "Acteurs" et "Journaux").
- `classes.json`, `subclasses.json`, `origins.json`, `spells.json`, `features.json`,
  `feats.json`, `npcs.json` → importés **directement dans leurs compendiums** (`packs/classes`,
  `packs/sous-classes`, `packs/origines`, `packs/sorts`, `packs/capacites`, `packs/dons`,
  `packs/adversaires`), pas dans les Items du monde (cf. "Note sur les classes et les origines"
  plus bas). `npcs.json` est le seul à peupler un compendium **Actor** plutôt qu'Item.

| Fichier | Contenu | Type d'Item | Destination |
|---|---|---|---|
| `armors.json` | 13 armures SRD 5e (dont le bouclier) + 26 ouvrages rituels et pièces rares : armures et bouclier +1/+2, acier d'Eisengrund (mithral du SRD), armures de résistance, accessoires (Anneau et Cape de protection, Bracelets de défense, 10 Anneaux de résistance) | `armor` | Items du monde |
| `weapons.json` | 37 armes SRD 5e (courantes et de guerre) + 10 ouvrages rituels (+1/+2) | `weapon` | Items du monde |
| `gear.json` | 52 objets d'aventurier SRD 5e (dont munitions et contenants) + 4 préparations rituelles et 3 préparations d'herboriste | `gear` | Items du monde |
| `regional.json` | 74 objets propres aux 6 nations et au Saint-siège (armes, armures, outils, objets du quotidien) | mélangé | Items du monde, dossier « Objets régionaux » > région |
| `historical.json` | 25 pièces historiques uniques, sans pouvoir ni bonus, dont 4 liées aux secrets du MJ (région `secrets`) | mélangé | Items du monde, dossier « Objets historiques » > région |
| `tools.json` | 24 outils SRD 5e (outils d'artisan, kits...) | `tool` | Items du monde |
| `spells.json` | 42 sorts SRD 5e (9 tours de magie, niveaux 1 à 5) — sélection non exhaustive, à compléter selon vos besoins | `spell` | Compendium "Sorts" |
| `features.json` | 103 capacités de classe (50 de classe de base niveaux 1 à 9, + 53 de sous-classe) — sélection non exhaustive | `feature` | Compendium "Capacités de classe" |
| `feats.json` | 10 dons PHB (règle optionnelle, `class`/`subclass` vides — jamais auto-octroyés) | `feature` | Compendium "Dons" |
| `classes.json` | Les 12 classes SRD 5e avec description (dé de vie, sauvegardes maîtrisées, compétences, lanceur de sorts) | `class` | Compendium "Classes" |
| `subclasses.json` | 3 sous-classes par classe (36 — 1 SRD 5e d'origine + 2 inspirées de Baldur's Gate 3), avec description | `subclass` | Compendium "Sous-classes" |
| `origins.json` | Les 6 Origines de ce système (mêmes données que `scripts/data/origins.json`) | `origin` | Compendium "Origines" |
| `npcs.json` | 84 créatures prêtes à l'emploi, rangées par phase de campagne puis par milieu (flags `phase`/`habitat`), butin embarqué pour les humains | Actor `npc` | Compendium "Adversaires" |
| `mounts.json` | 5 montures (blocs SRD exacts : cheval de selle, destrier, cheval de trait, mule, chameau) et 4 véhicules (chariot, traîneau, navire de cabotage, barque), prix en description | Actor `mount` / `vehicle` | Compendium "Montures et véhicules" |

Ces fichiers ne sont pas censés être modifiés directement (données de référence versionnées
avec le système) — dupliquez l'Item une fois importé si vous voulez le personnaliser.

## Insérer un sort ou une capacité de classe sur une fiche personnage

Une fois importés (automatiquement, cf. ci-dessus), glissez-déposez l'Item `spell`/`feature`
depuis le compendium "Sorts"/"Capacités de classe" vers la fiche du personnage (onglet
"Capacités"/"Sorts") : c'est le glisser-déposer standard de Foundry, déjà géré par la fiche
(cf. `scripts/sheets/inventory-drag-drop.js`). Aucune étape supplémentaire n'est nécessaire.

## Si le contenu n'apparaît pas / si la Macro n'apparaît pas

L'auto-import ne tourne qu'une fois par session serveur (hook `ready`) et seulement pour un
compte MJ ; la Macro n'est (re)créée qu'une fois par monde et jamais écrasée si vous l'avez
renommée/supprimée volontairement. Si le contenu manque malgré tout, exécutez ce script depuis
une macro créée à la main (ou relancez la Macro "Importer le contenu du système") :

```js
await game.dndCustomAi.importSystemContent();
```

## Note sur les outils

Chaque outil (`tools.json`) est lié à une compétence (`useEffect.skill`), choisie parmi celles
que le *Xanathar's Guide to Everything* associe à cet outil (ex. Kit d'herboristerie → Nature,
Kit de déguisement → Tromperie). Le bouton "Utiliser" de l'inventaire lance 1d20 + modificateur
de la caractéristique liée + bonus de maîtrise (l'outil confère sa propre maîtrise) +
`useEffect.bonus`, et consomme une unité de l'outil.

## Note sur les objets magiques

Le monde est à magie faible : la magie relève d'artisans ritualistes, lents et coûteux. Les
objets magiques sont donc présentés comme des **ouvrages rituels**, plafonnés à +2 (les objets +3
et les armes à effets spéciaux reviendront si l'univers évolue vers la haute fantasy). Ils suivent
le SRD 5.1 ; leurs prix (absents du SRD) reprennent les fourchettes par rareté du Guide du Maître
(peu courant 500 po, rare 5 000 po, très rare 20 000 po). Effets automatisés : bonus d'arme +X
(`enhancement`, attaque et dégâts), CA et bonus de sauvegarde des armures et accessoires équipés
(`saveBonus`, `unarmoredOnly` pour les Bracelets de défense), résistances accordées par une armure,
un accessoire ou une arme équipés, soin à dés (`use.healDice`, `use.consumable`).
L'harmonisation n'est pas suivie par le système : au MJ de la faire respecter.

Deux familles de préparations de guérison : les **préparations rituelles** des guildes de
ritualistes (2d4+2 à 10d4+20, de 50 à 1 350 po) et les **préparations d'herboriste**, bon marché et
peu efficaces (1d4 à 2d4, de 5 pa à 5 po).

## Note sur les objets régionaux et historiques

`regional.json` et `historical.json` mélangent les types d'objets ; chaque entrée porte sa région
dans `flags["dnd-custom-ai"].region` (clé de `DND_CUSTOM.regions`), qui sert à la ranger dans le
sous-dossier de sa région. Ce sont des créations propres à l'univers, calibrées sur un objet SRD
ou dérivées de ses calculs (dérogation validée par l'auteur du monde). Les pièces historiques
reprennent exactement les caractéristiques de leur objet de base, sans bonus ni effet : leur
valeur tient à leur histoire.

Leur description reste neutre, avec un indice ; leur histoire vit dans
`scripts/data/item-lore.json` et alimente le Journal **« Chroniques des objets »**, créé au
chargement et réservé au MJ (une page par région). Le MJ choisit ce qu'il partage. La région
`secrets` regroupe les objets liés à l'histoire cachée (doc MJ) : leur description visible reste
banale, et leur histoire est isolée sur une page « Secrets (MJ) », à ne jamais partager, pour que
le MJ puisse partager les pages des nations sans rien révéler. Comme les
autres Items du monde, ces objets ne sont pas visibles des joueurs tant que le MJ ne les leur
donne pas.

## Note sur les sorts

`spells.json` ne couvre que 42 sorts (9 tours de magie + niveaux 1 à 5) choisis pour être
représentatifs, pas la liste complète du SRD 5e (~300 sorts) — complétez-la à la main depuis
le compendium "Sorts" selon les besoins de votre table. Aucun sort n'est rattaché à une liste
de classes précise (l'Item Sort est générique) : à vous de dupliquer/filtrer selon qui peut
l'apprendre. Les dégâts, DD et effets détaillés restent dans la description ; il n'y a pas de
champ dédié (comme pour les Capacités de classe), l'automatisation s'arrête au décompte de
l'emplacement de sort au moment de lancer (cf. bouton "Lancer" de l'onglet Sorts).

## Note sur les capacités de classe

`features.json` couvre les capacités de classe de base (hors sous-classe) des niveaux 1 à 9
selon les classes, plus 1 ou 2 capacités par sous-classe (cf. "Note sur les sous-classes" plus
bas) — pas la progression complète des 12 classes jusqu'au niveau 20. Le
champ `class` contient la CLÉ stable de la classe (ex. `"barbarian"`, cf. `DND_CUSTOM.classes`,
`scripts/helpers/config.js`) — jamais un libellé localisé/traduit, pour que la comparaison
(`grantClassContent`) reste correcte quelle que soit la langue active du monde ; `subclass`
fonctionne pareil (ex. `"berserker"`), vide pour une capacité de classe de base. Quand
`requiresRoll` est actif (ex. Second souffle), un bouton "1d10 + niveau" apparaît sur la
fiche du personnage et poste le jet dans le chat.

Plusieurs capacités ont des utilisations limitées (`system.uses.max` > 0, ex. Rage 2/repos
long, Second souffle 1/repos court) : un compteur "restantes/max" s'affiche sur la fiche,
décrémenté à chaque utilisation (jet ou simple bouton "-" si pas de jet associé, ex.
Imposition des mains) et restauré au maximum lors d'un repos court ou long selon
`system.uses.recharge` (un repos long restaure aussi les capacités à récupération "repos
court"). `system.uses.max` à 0 = pas de suivi, comportement précédent (capacité toujours
disponible).

## Note sur les sous-classes

3 sous-classes par classe (`subclasses.json`, 36 entrées), chacune avec 1 ou 2 Capacités liées
(`features.json`, `system.subclass` renseigné) — 1 sous-classe SRD 5e d'origine par classe, plus
2 sous-classes supplémentaires inspirées de Baldur's Gate 3, ajoutées lors du chantier
"plusieurs sous-classes par classe" (2026-08-19) :

| Classe | SRD 5e d'origine | + 2 sous-classes ajoutées |
|---|---|---|
| Barbare | Voie du Berserker | Voie du Cœur sauvage, Voie de la Magie sauvage |
| Barde | Collège du Savoir | Collège des Lames, Collège de la Vaillance |
| Clerc | Domaine de la Vie | Domaine de la Lumière, Domaine de la Ruse |
| Druide | Cercle de la Terre | Cercle de la Lune, Cercle des Spores |
| Guerrier | Champion | Maître de guerre, Chevalier occulte |
| Moine | Voie de la Main Ouverte | Voie de l'Ombre, Voie des Quatre Éléments |
| Paladin | Serment de Dévotion | Serment des Anciens, Serment de Vengeance |
| Rôdeur | Chasseur | Maître des bêtes, Traqueur des ténèbres |
| Roublard | Voleur | Bretteur, Assassin |
| Ensorceleur | Lignage draconique | Magie sauvage, Sorcellerie des tempêtes |
| Occultiste | Le Fiélon | Le Grand Ancien, L'Archifée |
| Magicien | École d'évocation | École de nécromancie, École d'illusion |

Sélectionnable sur la fiche de personnage une fois le niveau d'obtention SRD atteint
(`DND_CUSTOM.subclassLevel`, `scripts/helpers/config.js`) ; les Capacités liées sont octroyées
automatiquement dès la sélection, comme les Capacités de classe (cf. `helpers/class-content.js`).

Contrairement aux 12 sous-classes SRD 5e d'origine (largement génériques — cf. "Simplifications
assumées" du Journal "Guide du MJ"), les 24 sous-classes ajoutées apportent chacune un mécanisme
actif propre sur `FeatureData`, au-delà du `requiresRoll`/`uses.max` déjà utilisés par les
Capacités de classe de base :

- `requiresState` : bouton activable seulement si l'Actor porte l'état indiqué (`DND_CUSTOM.
  conditions`, ex. Frénésie nécessite "raging", Forme sauvage de combat nécessite "wildShape").
- `costsResource` : la Capacité consomme la réserve d'usages d'une AUTRE Capacité présente sur
  l'Actor, trouvée par son nom exact (ex. Pas dans l'ombre/Disciplines élémentaires consomment
  la réserve de "Ki").
- `grantsChoice` : bouton "Choisir" proposant un choix ponctuel et définitif (DialogV2), stocké
  sur `system.combat.<champ>` (ex. Aspect de la bête → esprit totem Ours/Aigle/Loup).
- `offersManeuverChoice` : variante de `requiresRoll` qui propose d'abord un choix (DialogV2)
  avant de lancer la formule (ex. Dés de manœuvre → Attaque précise/Repousser/Feinte).
- `summonsCompanion` : bouton "Invoquer" qui crée un Actor `npc` prédéfini lié au personnage,
  une seule fois (ex. Compagnon animal, Maître des bêtes).
- `grantsSpells` : liste de noms de Sorts toujours prêts sans emplacement dédié, même pour une
  classe non lanceuse (ex. Incantation mineure, Chevalier occulte).
- Table de surtenance sauvage (RollTable Foundry native, cf. `scripts/helpers/
  wild-magic-tables.js`) : tirage automatique posté en chat au déclenchement (Rage pour le
  Barbare, emplacement de sort dépensé pour l'Ensorceleur).
- Critique automatique conditionnel (`forceCriticalHit`, cf. `rollCheck` dans `scripts/helpers/
  rolls.js`) : un jet d'attaque contre une cible portant l'état "surprised" devient
  systématiquement critique (Assassinat, Assassin).

## Note sur les Adversaires

`npcs.json` (compendium "Adversaires", `packs/adversaires`) contient 84 Actors `npc` prêts à
glisser sur une scène.

84 créatures, rangées dans des dossiers par **phase de campagne** (nombre de pierres brisées) puis par
**milieu** (Partout, une nation, côtes ou large de la Mer intérieure, site de pierre). Phase 0, monde
scellé : humains et bêtes réelles de chaque région, faune aberrante autour des sites de la forêt de Logne
et de la Sümpfenmark (grenouille, crapaud, grand serpent, avec patrouilleurs et tourbiers), et, seul
surnaturel possible avant la première pierre, les créatures du large de la Mer intérieure (où la magie
survit), dont le Kraken endormi. Phase 1, premières fissures : créatures du suintement de la Logne
(arbres et arbustes éveillés, lutin, loup gris, liés à la Dame de Logne), de la Sümpfenmark (Moorlicht,
morts et goules de tourbière, tourbe qui marche) et le Kraken affaibli qui approche des côtes. Toutes
reprennent exactement un bloc SRD 5.1 (seuls le Kraken affaibli et les paliers d'Ulrich sont dérivés, FP
recalculé). Dossier à part « Ulrich et sa bande », premier grand méchant de la campagne : sa bande en
phase 0 (homme de main, cogneur, guetteur, bagarreur, lieutenant, déserteur des Passwachten, du FP 1/8
au FP 3) et Ulrich, qui n'a pas de fiche avant sa transformation, en un palier par pierre absorbée
(1 à 5 pierres, FP 5, 8, 11, 14 et 17, phases 1 à 3).

Chaque entrée porte `flags["dnd-custom-ai"].phase` (0 à 3, `DND_CUSTOM.bestiaryPhases`) et
`.habitat` (`DND_CUSTOM.bestiaryHabitats`) ; un test de cohérence refuse toute créature surnaturelle
en phase 0 hors du large (`fitsSealedWorld`). Bloc SRD recopié au schéma simplifié : jet d'attaque =
modificateur + `bonus`, dégâts = dés + modificateur + `damage.bonus` ; ce que le schéma ne modélise
pas (attaques multiples, sauvegardes, nuées, actions légendaires) est écrit dans `specialAbilities`.

Contenu de la 1.3.0, en phase 0 : 16 humanoïdes (Brigand, Maraudeur, Garde, Espion, Chef de brigands,
Mercenaire vétéran, Chevalier, et 9 PNJ de l'univers qui reprennent exactement les statistiques
de l'un d'eux : pirates de la Mer intérieure, Passwacht, Veilleur, Compagnies de la Route, Ordre
de la Flamme, caravane azhari, charbonnier de Logne, contrebandier de Blackwych) et 8 bêtes sauvages réelles (Rat, Corbeau, Loup, Sanglier, Serpent
venimeux, Panthère, Crocodile, Ours brun). Indices de dangerosité SRD 5e du FI 0 au FI 3, calculés à partir de vrais blocs de
statistiques SRD adaptés au schéma simplifié de `NpcData` (bonus directs, pas de score complet) —
`xpReward` pré-rempli depuis `DND_CUSTOM.challengeRatingXp`. Chaque PNJ embarque son propre butin
(`items`, visible dans l'onglet "Butin" de sa fiche une fois placé sur une scène) : armes/armures
correspondant à ses attaques, plus quelques objets de circonstance (bourse de pièces pour les
humanoïdes, trophées — fourrure, défenses, griffes — pour les bêtes qui s'y prêtent). Ce
compendium n'est **visible que du MJ** par défaut (`ownership.PLAYER: "NONE"`, cf. `system.json`
> `packs`), contrairement aux autres compendiums de ce système (tous "OBSERVER" pour les joueurs)
— un bestiaire n'a pas vocation à être consulté à l'avance par les joueurs. Plusieurs PNJ
illustrent le profil d'attaque multiple (Espion, Chef de brigands, Ours brun — 2 attaques
distinctes chacun) et le Serpent venimeux illustre `secondaryDamage` (poison en plus du
perforant). Comme les autres fichiers de ce dossier, pas censé être modifié directement —
dupliquez le PNJ une fois glissé sur une scène pour le personnaliser.

## Note sur les dons

`feats.json` (compendium "Dons", cf. `packs/dons/README.md`) contient 10 dons du manuel
officiel — une règle optionnelle qu'un joueur peut choisir à la place d'une Amélioration de
caractéristiques (`DND_CUSTOM.abilityScoreImprovementLevels`). Ce sont des Items `feature`
comme les Capacités de classe, mais avec `class`/`subclass` vides : `grantClassContent` ne les
octroie donc jamais automatiquement, ils se glissent toujours à la main depuis ce compendium
vers l'onglet "Capacités" de la fiche — le MJ et le joueur décident ensemble s'il remplace une
Amélioration de caractéristiques ou s'ajoute en plus, ce système ne l'impose pas.

## Note sur les classes, sous-classes, origines, sorts et capacités de classe

Contrairement à `armors.json`/`weapons.json`/`gear.json`/`tools.json`, ces fichiers
(`classes.json`, `subclasses.json`, `origins.json`, `spells.json`, `features.json`) sont
importés directement dans leur compendium système (`packs/classes`, `packs/sous-classes`,
`packs/origines`, `packs/sorts`, `packs/capacites`, cf. `system.json` > `packs`), pas dans
les Items du monde. Ces compendiums
sont peuplés **automatiquement** au premier chargement du monde (hook `ready`) : Foundry ne
compile chaque pack en LevelDB qu'à partir du moment où un document y est ajouté — ce système
n'a pas d'étape de build pour les préremplir autrement, l'auto-import au démarrage joue ce
rôle. Une fois importées, cliquer sur "Classe"/"Origine" depuis la fiche de personnage ouvre
l'Item correspondant par son nom (recherche dans les Items du monde puis dans ces
compendiums) ; les sorts/capacités se glissent-déposent directement depuis leur compendium
vers la fiche.

## Dépendance de l'assistant de création de personnage

L'assistant de création (bouton "Créer un personnage" sur la fiche) donne un équipement de
départ simplifié (une arme + une armure typiques par classe, cf.
`DND_CUSTOM.classStartingEquipment` dans `scripts/helpers/config.js`) en cherchant les noms
exacts dans les Items du monde — **la Macro d'import ci-dessus doit avoir été exécutée au
moins une fois** pour que `weapons.json`/`armors.json` y soient présents, sinon l'équipement
de départ est silencieusement ignoré (le personnage reste créé, juste sans arme/armure).
