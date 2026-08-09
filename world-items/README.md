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

## Comment importer

Foundry ne propose pas d'import JSON en masse depuis l'onglet "Objets". La méthode la plus
simple est une macro (Script) : créez une macro dans le monde, collez ce code, et exécutez-la
(en tant que MJ). Elle importe les 4 fichiers d'un coup, sans jamais dupliquer une entrée déjà
présente (comparaison par nom) :

```js
const files = ["armors.json", "weapons.json", "gear.json", "tools.json"];

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
