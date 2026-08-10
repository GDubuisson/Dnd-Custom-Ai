# Contenu de référence à importer

## Comment importer (méthode recommandée)

Une Macro monde **"Importer le contenu du système"** est créée automatiquement au premier
chargement du monde (visible dans l'onglet "Macros", MJ uniquement — cf.
`scripts/helpers/content-import.js`). Double-cliquez dessus pour tout importer d'un coup, sans
jamais dupliquer une entrée déjà présente (comparaison par nom) : rejouable sans risque à
chaque mise à jour du système.

- `armors.json`, `weapons.json`, `gear.json`, `tools.json`, `spells.json`, `features.json` →
  importés dans les Items du monde (onglet "Objets" de Foundry, entre "Acteurs" et "Journaux").
- `classes.json`, `origins.json` → importés **directement dans leurs compendiums** (`packs/classes`,
  `packs/origines`), pas dans les Items du monde (cf. "Note sur les classes et les origines"
  plus bas).

| Fichier | Contenu | Type d'Item | Destination |
|---|---|---|---|
| `armors.json` | 13 armures SRD 5e (dont le bouclier) | `armor` | Items du monde |
| `weapons.json` | 37 armes SRD 5e (courantes et de guerre) | `weapon` | Items du monde |
| `gear.json` | 15 objets d'aventurier courants | `gear` | Items du monde |
| `tools.json` | 24 outils SRD 5e (outils d'artisan, kits...) | `tool` | Items du monde |
| `spells.json` | 15 sorts SRD 5e (5 tours de magie, niveaux 1 à 3) — sélection non exhaustive, à compléter selon vos besoins | `spell` | Items du monde |
| `features.json` | 24 capacités de classe SRD 5e (2 par classe, niveaux 1 à 3) — sélection non exhaustive | `feature` | Items du monde |
| `classes.json` | Les 12 classes SRD 5e avec description (dé de vie, sauvegardes maîtrisées, compétences, lanceur de sorts) | `class` | Compendium "Classes" |
| `origins.json` | Les 6 Origines de ce système (mêmes données que `scripts/data/origins.json`) | `origin` | Compendium "Origines" |

Ces fichiers ne sont pas censés être modifiés directement (données de référence versionnées
avec le système) — dupliquez l'Item une fois importé si vous voulez le personnaliser.

## Insérer un sort ou une capacité de classe sur une fiche personnage

Une fois importés (macro ci-dessus), glissez-déposez l'Item `spell`/`feature` depuis l'onglet
"Objets" du monde vers la fiche du personnage (onglet "Capacités"/"Sorts") : c'est le
glisser-déposer standard de Foundry, déjà géré par la fiche (cf.
`scripts/sheets/inventory-drag-drop.js`). Aucune étape supplémentaire n'est nécessaire.

## Si la Macro n'apparaît pas

Elle n'est (re)créée qu'une fois par monde et seulement pour un compte MJ (jamais écrasée si
vous l'avez renommée/supprimée volontairement). Si elle manque malgré tout, exécutez ce script
depuis une macro créée à la main :

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

`spells.json` ne couvre que 15 sorts (5 tours de magie + niveaux 1 à 3) choisis pour être
représentatifs, pas la liste complète du SRD 5e (~300 sorts) — complétez-la à la main depuis
l'onglet "Objets" selon les besoins de votre table. Aucun sort n'est rattaché à une liste de
classes précise (l'Item Sort est générique) : à vous de dupliquer/filtrer selon qui peut
l'apprendre. Les dégâts, DD et effets détaillés restent dans la description ; il n'y a pas de
champ dédié (comme pour les Capacités de classe), l'automatisation s'arrête au décompte de
l'emplacement de sort au moment de lancer (cf. bouton "Lancer" de l'onglet Sorts).

## Note sur les capacités de classe

`features.json` couvre 2 capacités par classe (niveau 1 et niveau 2/3, hors capacités liées
à un choix de sous-classe — non modélisées dans ce système, cf. `ClaudeFiles/ITEMS.md`), pas
la progression complète des 12 classes. Le champ `class` contient le nom de la classe en
texte libre (ex. "Barbare"), pas une référence stricte à un Item Classe. Quand
`requiresRoll` est actif (ex. Second souffle), un bouton "1d10 + niveau" apparaît sur la
fiche du personnage et poste le jet dans le chat.

11 des 24 capacités ont des utilisations limitées (`system.uses.max` > 0, ex. Rage 2/repos
long, Second souffle 1/repos court) : un compteur "restantes/max" s'affiche sur la fiche,
décrémenté à chaque utilisation (jet ou simple bouton "-" si pas de jet associé, ex.
Imposition des mains) et restauré au maximum lors d'un repos court ou long selon
`system.uses.recharge` (un repos long restaure aussi les capacités à récupération "repos
court"). `system.uses.max` à 0 = pas de suivi, comportement précédent (capacité toujours
disponible).

## Note sur les classes et les origines

Contrairement aux autres fichiers, `classes.json` et `origins.json` sont importés directement
dans leur compendium système (`packs/classes` / `packs/origines`, cf. `system.json` > `packs`),
pas dans les Items du monde : ces compendiums restent vides tant que la Macro d'import n'a pas
été exécutée une première fois (Foundry ne les compile qu'à partir de documents ajoutés depuis
l'interface — ce système n'a pas d'étape de build pour les préremplir autrement). Une fois
importées, cliquer sur "Classe"/"Origine" depuis la fiche de personnage ouvre l'Item
correspondant par son nom (recherche dans les Items du monde puis dans ces deux compendiums).

## Dépendance de l'assistant de création de personnage

L'assistant de création (bouton "Créer un personnage" sur la fiche) donne un équipement de
départ simplifié (une arme + une armure typiques par classe, cf.
`DND_CUSTOM.classStartingEquipment` dans `scripts/helpers/config.js`) en cherchant les noms
exacts dans les Items du monde — **la Macro d'import ci-dessus doit avoir été exécutée au
moins une fois** pour que `weapons.json`/`armors.json` y soient présents, sinon l'équipement
de départ est silencieusement ignoré (le personnage reste créé, juste sans arme/armure).
