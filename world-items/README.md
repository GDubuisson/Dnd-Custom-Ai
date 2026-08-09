# Objets à importer dans l'onglet "Objets" du monde

Ces fichiers ne sont **pas** des compendiums système : ce sont des données à importer une
fois dans les Items du monde (onglet "Objets" de Foundry, entre "Acteurs" et "Journaux"),
pour que chaque table puisse ensuite les dupliquer/adapter librement à son monde.

Ils ne sont pas censés être modifiés directement (données de référence versionnées avec le
système) — copiez/dupliquez l'Item une fois importé si vous voulez le personnaliser.

| Fichier | Contenu | Type d'Item |
|---|---|---|
| `armors.json` | 13 armures SRD 5e (dont le bouclier) | `armor` |
| `weapons.json` | 37 armes SRD 5e (courantes et de guerre) | `weapon` |
| `gear.json` | 15 objets d'aventurier courants | `gear` |
| `tools.json` | 24 outils SRD 5e (outils d'artisan, kits...) | `tool` |
| `spells.json` | 15 sorts SRD 5e (5 tours de magie, niveaux 1 à 3) — sélection non exhaustive, à compléter selon vos besoins | `spell` |
| `features.json` | 24 capacités de classe SRD 5e (2 par classe, niveaux 1 à 3) — sélection non exhaustive | `feature` |

## Comment importer

Foundry ne propose pas d'import JSON en masse depuis l'onglet "Objets". La méthode la plus
simple est une macro (Script) : créez une macro dans le monde, collez ce code, et exécutez-la
(en tant que MJ). Elle importe les 6 fichiers d'un coup, sans jamais dupliquer une entrée déjà
présente (comparaison par nom) :

```js
const files = ["armors.json", "weapons.json", "gear.json", "tools.json", "spells.json", "features.json"];

for (const file of files) {
  const data = await fetch(`systems/dnd-custom-ai/world-items/${file}`).then((r) => r.json());
  const existingNames = new Set(game.items.map((item) => item.name));
  const missing = data.filter((entry) => !existingNames.has(entry.name));
  if (missing.length) await Item.createDocuments(missing);
  console.log(`${file} : ${missing.length} objet(s) importé(s)`);
}

ui.notifications.info("Import terminé (voir la console pour le détail).");
```

## Note sur les outils

Les outils (`tools.json`) sont importés avec `useEffect.skill`/`useEffect.bonus` vides pour
la plupart : en SRD 5e, un outil confère la **maîtrise** (le bonus de maîtrise du personnage
s'applique aux tests concernés), pas un bonus fixe propre à l'objet — ce mécanisme n'est pas
encore automatisé sur la fiche de personnage. Seuls les "Outils de voleur" ont une compétence
pré-remplie (`sleightOfHand`) à titre d'exemple ; à vous d'ajuster `useEffect.bonus` si vous
préférez un bonus fixe simplifié pour votre table.

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
