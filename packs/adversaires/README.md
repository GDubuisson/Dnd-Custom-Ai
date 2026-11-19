# Compendium "Adversaires"

Dossier vide dans le dépôt : Foundry le compile en LevelDB directement ici, la première fois
qu'un document y est ajouté depuis l'interface (glisser un Actor de type `npc` depuis le monde
vers ce compendium, ou "Créer un acteur" directement dedans).

Les créatures prêtes à l'emploi de `world-items/npcs.json` y sont importées **automatiquement au
chargement du monde**
(hook `ready`, cf. `scripts/dnd-custom-ai.js` et `scripts/helpers/content-import.js`), sans
doublon (comparaison par nom) et sans action du MJ.

96 créatures. L'ordre et l'auteur des ruptures de pierres dépendent de la table (seul le début est
prévu : la forêt de Logne brisée par les PJ, puis Ulrich à la Sümpfenmark) ; le rangement le reflète :
- **Phases de campagne** (nombre de pierres brisées) puis **milieu** (Partout, une nation, côtes ou
  large de la Mer intérieure) pour ce qui dépend du monde entier. Phase 0, monde scellé : humains et
  bêtes réelles de chaque région et, seul surnaturel possible avant la première pierre, les créatures
  du large de la Mer intérieure (la magie fonctionne encore dans ses profondeurs), dont le Kraken
  endormi au fond ; ses courants rendent la traversée suicidaire. Phase 1 : le Kraken
  affaibli qui approche des côtes.
- **Un dossier par site de pierre**, découpé en « Avant la rupture » et « Après la rupture », quel
  que soit le moment où il tombe. Forêt de Logne : gardien et faune aberrante avant, arbres et
  arbustes éveillés, lutin et loup gris (liés à la Dame de Logne) après. Sümpfenmark : grenouille,
  crapaud, grand serpent, patrouilleurs et tourbiers avant, Moorlicht, morts et goules de tourbière,
  tourbe qui marche après. Désert gelé de Kis : faune figée avant (chouette des glaces, grand élan,
  tigre à dents de sabre, mammouth), loup arctique, méphite de glace et les deux oiseaux de l'ancien
  monde après, Kisaeth (glace : renaissante, éveillée, pleine puissance) et Varhun (feu : oisillon,
  jeune, adulte), aux statistiques exactes des dragons blanc et rouge SRD.
- **« Ulrich et sa bande »**, premier grand méchant de la campagne : sa bande (homme de main,
  cogneur, guetteur, bagarreur, lieutenant, déserteur des Passwachten, du FP 1/8 au FP 3) et Ulrich,
  qui n'a pas de fiche avant sa transformation. Il se renforce avec le temps, en cinq étapes calées
  sur le niveau des PJ (FP 5, 8, 11, 14 et 17, une pierre absorbée), et chaque pierre de plus qu'il
  absorbe ajoute un gabarit cumulable (environ +3 FP),
  chaque fragment de pierre un plus petit (environ +1 FP), tous deux décrits sur ses fiches.

Toutes reprennent exactement un bloc SRD 5.1 (seuls le Kraken affaibli et les paliers d'Ulrich sont
dérivés, FP recalculé).

Les dossiers sont créés par l'import d'après les flags `phase` et `habitat` de chaque entrée
(`scripts/helpers/bestiary.js`) ; une créature déjà présente sans dossier, ou rangée selon un ancien
découpage, y est déplacée au chargement suivant, et les dossiers du bestiaire devenus vides sont supprimés.

Seul compendium de ce système invisible aux joueurs par défaut (`ownership.PLAYER: "NONE"`, cf.
`system.json` > `packs`) — un bestiaire n'a pas vocation à être consulté à l'avance par la table.
Glissez-déposez un PNJ directement depuis ce compendium vers une scène, ou dupliquez-le dans les
Actors du monde pour le personnaliser avant de le déployer (cf. `world-items/README.md` > "Note
sur les Adversaires" pour le détail du contenu).
