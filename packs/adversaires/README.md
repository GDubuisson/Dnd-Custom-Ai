# Compendium "Adversaires"

Dossier vide dans le dépôt : Foundry le compile en LevelDB directement ici, la première fois
qu'un document y est ajouté depuis l'interface (glisser un Actor de type `npc` depuis le monde
vers ce compendium, ou "Créer un acteur" directement dedans).

Les créatures prêtes à l'emploi de `world-items/npcs.json` y sont importées **automatiquement au
chargement du monde**
(hook `ready`, cf. `scripts/dnd-custom-ai.js` et `scripts/helpers/content-import.js`), sans
doublon (comparaison par nom) et sans action du MJ.

271 créatures. L'ordre et l'auteur des ruptures de pierres dépendent de la table (seul le début est
prévu : la forêt de Logne brisée par les PJ, puis Ulrich à la Sümpfenmark) ; le rangement le reflète :
- **Phases de campagne** (six phases, du monde scellé à l'ancien monde : les pierres brisées en
  fixent le plafond, le temps fait monter jusqu'à lui ; guide dans le journal « Sites de pierre (MJ) »,
  page « Les phases du retour ») puis **milieu** (Partout, une nation, côtes ou
  large de la Mer intérieure) pour ce qui dépend du monde entier. Phase 0, monde scellé : humains et
  bêtes réelles de chaque région et, seul surnaturel possible avant la première pierre, les créatures
  du large de la Mer intérieure (la magie fonctionne encore dans ses profondeurs), dont le Kraken
  endormi au fond ; ses courants rendent la traversée suicidaire. Phase 1 : le Kraken
  affaibli qui approche des côtes. Le folklore des nations
  prend corps à partir de la phase 1 : Hausgeist (phase 1), arbre du Waldvater (phase 3) et
  Waldvater (phase 4) en Altenmark ; esprit du Silver Lake (phase 2) à Lucentia ; feu follet
  (phase 1), guenaude des murmures et Écho des collines (phase 2) à Ravenmoor ; guenaude du mauvais
  œil (phase 2) à Valdera ; esprit des Sceaux (phase 2) puis grand esprit des Sceaux (phase 4,
  dérivé, FP 9) à Azhar.
  Les peuples de l'ancien monde reviennent eux aussi, progressivement : gobelin et kobold
  (phase 2), orc (né de la terre), homme-lézard, gnoll (Azhar, fait par un démon) et elfes
  sauvages, éclaireur et druide (phase 3), puis hobgobelin et gobelours (des gobelins que la magie a
  fait grandir), chef de guerre orc (dérivé, FP 4) et troll (pétrifié dans les montagnes, passif
  tant qu'on ne le provoque pas) en phase 4 ; blocs SRD avec, sur chaque fiche, leur comportement
  selon la phase (sauvages d'abord, puis bandes qui parlent, puis peuples).
  Les humains recouvrent des pouvoirs : chaque ordre d'une nation suit une **carrière**, un rang par
  phase de 2 à 5 (environ FP 4, 6, 9 puis 12, recalculés par la méthode de création de monstres) au-dessus
  de sa fiche de phase 0 : Aube Blanche (Fleuraine, paladins du serment, nouvelle fiche de base
  « Chevalier de l'Aube Blanche »), Ordre de la Flamme (Valdera, paladins du feu), Passwachten
  (Altenmark, rôdeurs des cols), Veilleurs (Ravenmoor, rôdeurs enquêteurs), Compagnies de la Route
  (Lucentia, guerriers qui achètent leur magie aux guildes) et guerriers de la Mesure (Azhar).
  Les ritualistes deviennent des mages selon la même échelle, une carrière par nation : astrologues de
  la Maison des Cent Portes (Azhar), charmeurs de la guilde (Lucentia), géomanciens (Altenmark), mages
  de domaine (Fleuraine) et illusionnistes du Registre (Ravenmoor) ; aucun à Valdera, où ils sont
  interdits.
  Les prières trouvent d'autres oreilles : sectateur (phase 1) et fanatique de culte (phase 2), blocs
  SRD valables pour tout culte, puis trois carrières génériques de prêtres, sans pays attitré :
  fidèles de l'Unique exaucés sans savoir par qui, culte d'un dieu ancien (domaine au choix du MJ)
  et culte démoniaque, jusqu'au possédé.
  Les golems naissent des filons : dans l'Eismark (dossier Altenmark), filon éveillé (phase 3, bloc
  Élémentaire de terre en fer), Eisenmann (phase 4, dérivé, FP 10) puis grand Eisenmann (phase 5, bloc
  Golem de fer) ; dans les autres montagnes, plus faibles, rocher éveillé (phase 3, FP 3), homme de
  pierre (phase 4, FP 7) puis golem de pierre (phase 5, bloc SRD). Le xorn (phase 3, Eismark) ne
  perçoit que les êtres magiques de métal et ignore les êtres de chair.
  Ceniza, le démon qui prend le contrôle du culte d'Inés (Valdera) : une voix en phase 3, incarnée et
  affaiblie en phase 4 (dérivée du Balor, FP 13), pleine puissance en phase 5 (bloc SRD Balor, FP 19).
  Les démons, blocs SRD dans le dossier commun (aucun céleste ni diable dans ce monde) : dretch, quasit,
  succube ou incube et guenaude nocturne (phase 3) ; destrier de cauchemar, vrock, hezrou, glabrezu
  (phase 4) ; nalfeshnee, marilith et un balor générique (phase 5).
  Morts-vivants, fées et élémentaires, blocs SRD dans le dossier commun : squelette, zombi, goule et
  méphites (phase 1) ; ombre, spectre, blême, fantôme, esprit follet, satyre, dryade (phase 2) ;
  nécrophage, momie, âme-en-peine, les quatre élémentaires, gargouille (phase 3) ; traqueur invisible
  (phase 4) ; djinn et éfrit (phase 5). Ni vampires ni liches dans cette campagne.
  Les êtres des profondeurs de la Mer intérieure, invisibles en phases 0 et 1, échoués morts en phase 2,
  remontent vers les côtes à partir de la phase 3, craintifs et sans sortir de l'eau : homme-poisson
  (neutre tant qu'on ne le chasse pas), sahuagin, merrow, guenaude marine, plésiosaure, crabe géant, et
  l'ancien des profondeurs, présence psychique qui ne se montre jamais (dérivé de l'Aboleth, FP 4). Les
  flottes pirates ont leur carrière (écumeur, maître d'abordage, capitaine corsaire, seigneur des
  courants) : sans pouvoir propre, elles changent avec la mer.
- **Un dossier par site de pierre**, découpé en « Avant la rupture » et « Après la rupture », quel
  que soit le moment où il tombe. Forêt de Logne : gardien et faune aberrante avant, arbres éveillés (dont un jeune
  arbre calibré pour le premier combat, PJ niv. 1), arbustes éveillés, lutin et loup gris (liés à la Dame de Logne) après. Sümpfenmark : grenouille,
  crapaud, grand serpent, patrouilleurs et tourbiers avant, Moorlicht, morts et goules de tourbière,
  tourbe qui marche après. Désert gelé de Kis : faune figée avant (chouette des glaces, grand élan,
  tigre à dents de sabre, mammouth, et Kisaeth renaissante, réveillée à l'approche et confinée au
  site), loup arctique, méphite de glace et les deux oiseaux de l'ancien monde après, Kisaeth
  (glace : éveillée, pleine puissance) et Varhun (feu : oisillon,
  jeune, adulte), aux statistiques exactes des dragons blanc et rouge SRD.
  Île de Tirwen : pas de gardien, la pierre fuit sur tout le vivant. Avant la rupture, dix bêtes
  géantes (mille-pattes, lézard, serpent venimeux, chauve-souris, guêpe, araignée, hyène, scorpion,
  crocodile, singe), cinq plantes (champignon violet, ronce-griffe, ronce-aiguille, liane
  étrangleuse, tertre errant) et les hommes du capitaine (sentinelle, pilote, traître, fidèle), avec
  la vitalité de Tirwen ; rien n'apparaît après la rupture, l'île devient plus tranquille.
  Désert de Zahir : vautour, serpent venimeux et scorpion géants, guide de Bir Azraq, et dans le
  palais invisible le sage du Zahir, deux sages fondus avec la pierre en un mort-vivant (Seigneur
  momie SRD exact, FP 15 fixe), avec ses invocations (momie, squelette) qui n'existent que par lui.
  Souterrain de Velencia : la garde de l'Église autour du tombeau d'Estevan (garde d'apparat,
  sergent, chanoine veilleur aux prières bridées) ; Estevan, vivant et végétatif près de la pierre,
  n'a pas de fiche : il ne se combat pas, ses visions sont décrites dans le journal des sites.
- **« Ulrich et sa bande »**, premier grand méchant de la campagne : sa bande, par palier de niveau
  des PJ (noté sur chaque fiche), et Ulrich, qui n'a pas de fiche avant sa transformation.
  - PJ niv. 1-4 : homme de main, cogneur, guetteur, bagarreur, lieutenant, déserteur des Passwachten
    (FP 1/8 à 3) ; fidèle de la pierre (FP 1/8) dès la phase 1.
  - PJ niv. 5-8 : exécuteur (FP 5) ; fanatique de la pierre (FP 2) et ritualiste (FP 6) dès la phase 2.
  - PJ niv. 9-12 : lame (FP 8), ritualistes.
  - PJ niv. 13-16 : champion d'Ulrich (FP 11) ; maître ritualiste (FP 12) dès la phase 4.
  - PJ niv. 17-20 : champions et maîtres ritualistes, autour d'Ulrich ou d'un porteur de pierre.
  - Un **porteur de pierre** (l'homme qu'Ulrich envoie absorber une pierre à sa place) est la fiche la
    plus forte du palier avec le gabarit de pierre d'Ulrich : déserteur, exécuteur, lame, champion,
    puis champion à deux gabarits (FP proches de ceux d'Ulrich au même palier). Il se renforce avec le temps, en cinq étapes calées
  sur le niveau des PJ (FP 5, 8, 11, 14 et 17, une pierre absorbée), et chaque pierre de plus qu'il
  absorbe ajoute un gabarit cumulable (environ +3 FP),
  chaque fragment de pierre un plus petit (environ +1 FP), tous deux décrits sur ses fiches.
- **Capitaine pirate** (côtes de la Mer intérieure, phase 0) : chef des flottes, ancien associé
  d'Ulrich parti fâché vers 877, lié à lui par un accord d'argent (Ulrich recèle le butin, la
  piraterie pousse le commerce vers la Grande Route du Nord que sa pègre rançonne). Base à Tirwen ;
  aucun pouvoir conscient, mais la fuite de la pierre le garde jeune et rend son équipage plus
  vigoureux (vitalité de Tirwen : résistance au poison) ; profil de boss duelliste dérivé du
  Gladiateur SRD (FP 5), butin qui mène vers Ulrich.

Toutes reprennent exactement un bloc SRD 5.1 (seuls le Kraken affaibli, le Jeune arbre éveillé, les paliers d'Ulrich, le
Champion d'Ulrich et le Capitaine pirate sont dérivés, FP recalculé).

Les dossiers sont créés par l'import d'après les flags `phase` et `habitat` de chaque entrée
(`scripts/helpers/bestiary.js`) ; une créature déjà présente sans dossier, ou rangée selon un ancien
découpage, y est déplacée au chargement suivant, et les dossiers du bestiaire devenus vides sont supprimés.

Seul compendium de ce système invisible aux joueurs par défaut (`ownership.PLAYER: "NONE"`, cf.
`system.json` > `packs`) — un bestiaire n'a pas vocation à être consulté à l'avance par la table.
Glissez-déposez un PNJ directement depuis ce compendium vers une scène, ou dupliquez-le dans les
Actors du monde pour le personnaliser avant de le déployer (cf. `world-items/README.md` > "Note
sur les Adversaires" pour le détail du contenu).
