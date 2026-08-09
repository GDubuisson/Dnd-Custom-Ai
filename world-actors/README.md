# Adversaires à importer dans l'onglet "Acteurs" du monde

Comme `world-items/` mais pour des `Actor` plutôt que des `Item` : des fiches PNJ (`type: "npc"`)
prêtes à dupliquer/adapter pour peupler vos rencontres, sans passer par un compendium système
(mêmes raisons qu'`world-items/README.md` : contenu de monde, pas de système, modifiable
librement table par table).

**Univers réaliste, sans créature magique** : ce monde n'a ni monstres ni races fantastiques
(cf. `ClaudeFiles/PROJECT.md`, système d'Origines = cultures humaines réelles). `adversaries.json`
ne contient donc que des humains (brigands, gardes, nobles...) et des bêtes du monde réel (loup,
ours, serpent...) — pas de gobelin, mort-vivant, dragon ou créature enchantée.

| Fichier | Contenu | Type d'Actor |
|---|---|---|
| `adversaries.json` | 16 adversaires SRD 5e adaptés (8 humains, 8 bêtes), FI 0 à 3 | `npc` |

## Comment importer

Même principe que `world-items/` : une macro (Script) à créer dans le monde et exécuter en
tant que MJ. Elle importe le fichier sans jamais dupliquer une entrée déjà présente
(comparaison par nom) :

```js
const files = ["adversaries.json"];

for (const file of files) {
  const data = await fetch(`systems/dnd-custom-ai/world-actors/${file}`).then((r) => r.json());
  const existingNames = new Set(game.actors.map((actor) => actor.name));
  const missing = data.filter((entry) => !existingNames.has(entry.name));
  if (missing.length) await Actor.createDocuments(missing);
  console.log(`${file} : ${missing.length} acteur(s) importé(s)`);
}

ui.notifications.info("Import terminé (voir la console pour le détail).");
```

## Note sur les données

- `xpReward` est déjà rempli selon la table FI → XP officielle (cf.
  `DND_CUSTOM.challengeRatingXp`), pas besoin de la retoucher après import.
- `specialAbilities` regroupe les traits et attaques (texte libre, pas de calcul automatisé
  de jets d'attaque pour les PNJ) ; `particularity` est une phrase d'ambiance courte.
- Sélection non exhaustive (16 entrées) : dupliquez et ajustez FI/PV/CA pour varier les
  rencontres (ex. un "Garde" légèrement modifié fait un bon "Milicien" ou "Soldat").
