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
  `feats.json` → importés **directement dans leurs compendiums** (`packs/classes`,
  `packs/sous-classes`, `packs/origines`, `packs/sorts`, `packs/capacites`, `packs/dons`), pas
  dans les Items du monde (cf. "Note sur les classes et les origines" plus bas).

| Fichier | Contenu | Type d'Item | Destination |
|---|---|---|---|
| `armors.json` | 13 armures SRD 5e (dont le bouclier) | `armor` | Items du monde |
| `weapons.json` | 37 armes SRD 5e (courantes et de guerre) | `weapon` | Items du monde |
| `gear.json` | 15 objets d'aventurier courants | `gear` | Items du monde |
| `tools.json` | 24 outils SRD 5e (outils d'artisan, kits...) | `tool` | Items du monde |
| `spells.json` | 42 sorts SRD 5e (9 tours de magie, niveaux 1 à 5) — sélection non exhaustive, à compléter selon vos besoins | `spell` | Compendium "Sorts" |
| `features.json` | 69 capacités de classe SRD 5e (classe de base niveaux 1 à 9, + 24 de sous-classe) — sélection non exhaustive | `feature` | Compendium "Capacités de classe" |
| `feats.json` | 10 dons PHB (règle optionnelle, `class`/`subclass` vides — jamais auto-octroyés) | `feature` | Compendium "Dons" |
| `classes.json` | Les 12 classes SRD 5e avec description (dé de vie, sauvegardes maîtrisées, compétences, lanceur de sorts) | `class` | Compendium "Classes" |
| `subclasses.json` | Une sous-classe SRD 5e par classe (12), avec description | `subclass` | Compendium "Sous-classes" |
| `origins.json` | Les 6 Origines de ce système (mêmes données que `scripts/data/origins.json`) | `origin` | Compendium "Origines" |

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

Les outils (`tools.json`) sont importés avec `useEffect.skill`/`useEffect.bonus` vides pour
la plupart : en SRD 5e, un outil confère la **maîtrise** (le bonus de maîtrise du personnage
s'applique aux tests concernés), pas un bonus fixe propre à l'objet. Quand `useEffect.skill`
est renseigné, un bouton "Utiliser" apparaît sur l'inventaire de la fiche de personnage et
lance automatiquement 1d20 + modificateur de la caractéristique liée + bonus de maîtrise
(toujours appliqué, indépendamment de la maîtrise de la compétence elle-même) +
`useEffect.bonus` s'il est renseigné. Seuls les "Outils de voleur" ont une compétence
pré-remplie (`sleightOfHand`) à titre d'exemple ; laissez `useEffect.skill` vide pour un outil
sans automatisation (le bonus de maîtrise reste alors à appliquer manuellement en jeu).

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
selon les classes, plus deux capacités par sous-classe SRD modélisée (cf. "Note sur les
sous-classes" plus bas) — pas la progression complète des 12 classes jusqu'au niveau 20. Le
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

Une sous-classe SRD 5e par classe (`subclasses.json`, 12 entrées), avec ses 2 premières
Capacités liées (`features.json`, `system.subclass` renseigné) : Voie du Berserker (Barbare),
Collège du Savoir (Barde), Domaine de la Vie (Clerc), Cercle de la Terre (Druide), Champion
(Guerrier), Voie de la Main Ouverte (Moine), Serment de Dévotion (Paladin), Chasseur (Rôdeur),
Voleur (Roublard), Lignage draconique (Ensorceleur), Le Fiélon (Occultiste), École
d'évocation (Magicien). Sélectionnable sur la fiche de personnage une fois le niveau
d'obtention SRD atteint (`DND_CUSTOM.subclassLevel`, `scripts/helpers/config.js`) ; les
Capacités liées sont octroyées automatiquement dès la sélection, comme les Capacités de
classe (cf. `helpers/class-content.js`).

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
