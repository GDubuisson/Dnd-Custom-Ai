# Compendium "Adversaires"

Dossier vide dans le dépôt : Foundry le compile en LevelDB directement ici, la première fois
qu'un document y est ajouté depuis l'interface (glisser un Actor de type `npc` depuis le monde
vers ce compendium, ou "Créer un acteur" directement dedans).

Les créatures prêtes à l'emploi de `world-items/npcs.json` y sont importées **automatiquement au
chargement du monde**
(hook `ready`, cf. `scripts/dnd-custom-ai.js` et `scripts/helpers/content-import.js`), sans
doublon (comparaison par nom) et sans action du MJ.

73 créatures, rangées dans des dossiers par **phase de campagne** (nombre de pierres brisées) puis par
**milieu** (Partout, une nation, côtes ou large de la Mer intérieure, site de pierre). Phase 0, monde
scellé : humains et bêtes réelles de chaque région, faune aberrante autour des sites de la forêt de Logne
et de la Sümpfenmark (grenouille, crapaud, grand serpent, avec patrouilleurs et tourbiers), et, seul
surnaturel possible avant la première pierre, les créatures du large de la Mer intérieure (où la magie
survit), dont le Kraken endormi. Phase 1, premières fissures : créatures du suintement de la Logne
(arbres et arbustes éveillés, lutin, loup gris, liés à la Dame de Logne), de la Sümpfenmark (Moorlicht,
morts et goules de tourbière, tourbe qui marche) et le Kraken affaibli qui approche des côtes. Toutes
reprennent exactement un bloc SRD 5.1 (seul le Kraken affaibli est dérivé, FP recalculé).

Les dossiers sont créés par l'import d'après les flags `phase` et `habitat` de chaque entrée
(`scripts/helpers/bestiary.js`) ; une créature déjà présente sans dossier y est rangée au chargement
suivant.

Seul compendium de ce système invisible aux joueurs par défaut (`ownership.PLAYER: "NONE"`, cf.
`system.json` > `packs`) — un bestiaire n'a pas vocation à être consulté à l'avance par la table.
Glissez-déposez un PNJ directement depuis ce compendium vers une scène, ou dupliquez-le dans les
Actors du monde pour le personnaliser avant de le déployer (cf. `world-items/README.md` > "Note
sur les Adversaires" pour le détail du contenu).
