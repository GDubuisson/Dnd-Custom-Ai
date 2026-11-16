# 12 — Échelle & Distances (fiche de référence GM)

> Fiche établie d'après la carte du monde connu achevée en 887 par Maître Éloi de Montclair, du Cercle de l'Étoile Polaire (`all.png`, 4446×4446 px). Elle permet de recalculer n'importe quelle distance à vol d'oiseau **quelle que soit la taille de la copie utilisée**, tant que la carte reste carrée et non recadrée.

## 1. Référence de base

- **Distance étalon (fixée par le GM) :** Saint-Lys ↔ Bléval = **60 km**
- Mesurée à 323,1 px sur le fichier source 4446×4446 px.

## 2. Formule résolution-indépendante

```
km = (distance en pixels / largeur de l'image en px) × 825,6
```

La constante **825,6** est calibrée une fois pour toutes sur l'étalon Saint-Lys–Bléval. Elle reste valable que l'image chargée fasse 4446 px, 1096 px, ou toute autre résolution — tant qu'elle correspond au même cadrage (carte entière, non recadrée).

**Équivalences pratiques :**
| Résolution image | Échelle |
|---|---|
| 4446×4446 px (fichier source) | 0,186 km/px |
| 1096×1096 px (copie réduite) | 0,754 km/px |

## 3. Rythmes de déplacement

| Rythme | Vitesse | Distance/jour |
|---|---|---|
| Lent (discrétion possible) | 3 km/h | 27 km/j |
| Normal | 4,5 km/h | 36 km/j |
| Rapide (-5 Perception passive) | 6 km/h | 45 km/j |

Conversion rapide depuis le rythme normal : **×1,33** pour le rythme lent, **×0,8** pour le rythme rapide.

Toute distance donnée ici est **à vol d'oiseau** — majorer de 20 à 30 % pour un trajet réel contournant montagnes ou forêts denses.

## 4. Coordonnées de référence (villes et capitales)

Position normalisée (fraction de la largeur/hauteur de l'image, 0 à 1) et équivalent en pixels sur la copie réduite (1096×1096). Utiliser la fraction directement si l'image chargée a une autre résolution. Positions relevées sur le fichier source 4446×4446 de la carte datée de 887 (centre de l'icône de chaque lieu).

| Lieu | Nation | Fraction (x, y) | px @ 1096 |
|---|---|---|---|
| Saint-Lys | Fleuraine | 0,1912 ; 0,4390 | 210, 481 |
| Bléval | Fleuraine | 0,2584 ; 0,4123 | 283, 452 |
| Logneval (lisière Forêt de Logne) | Fleuraine | 0,3194 ; 0,2821 | 350, 309 |
| Vespera | Lucentia | 0,4375 ; 0,4345 | 479, 476 |
| Valdoro | Lucentia | 0,4640 ; 0,3965 | 509, 435 |
| Altenburg | Altenmark | 0,5355 ; 0,3007 | 587, 330 |
| Eisburg | Altenmark | 0,5855 ; 0,2474 | 642, 271 |
| Stoneford | Ravenmoor | 0,5391 ; 0,4501 | 591, 493 |
| Ravenhold | Ravenmoor | 0,5965 ; 0,4575 | 654, 501 |
| Hisn al-Hajar | Azhar | 0,5771 ; 0,6030 | 633, 661 |
| Qasirah | Azhar | 0,5646 ; 0,6410 | 619, 703 |
| Monteluz | Valdera | 0,7195 ; 0,4179 | 789, 458 |
| Varela | Valdera | 0,7161 ; 0,4683 | 785, 513 |
| Torralba | Valdera | 0,7901 ; 0,3925 | 866, 430 |
| Cortelba | Valdera | 0,8095 ; 0,5216 | 887, 572 |
| Velencia | Saint-siège | 0,8144 ; 0,5700 | 893, 625 |

## 5. Distances déjà calculées

| Trajet | Distance (km) | Lent | Normal | Rapide |
|---|---|---|---|---|
| Saint-Lys ↔ Bléval *(étalon)* | 60 | 2,2 j | 1,7 j | 1,3 j |
| Saint-Lys ↔ Logneval (Forêt de Logne) | 167 | 6,2 j | 4,6 j | 3,7 j |
| Saint-Lys ↔ Vespera | 203 | 7,5 j | 5,6 j | 4,5 j |
| Saint-Lys ↔ Altenburg | 306 | 11,3 j | 8,5 j | 6,8 j |
| Saint-Lys ↔ Ravenhold | 335 | 12,4 j | 9,3 j | 7,4 j |
| Saint-Lys ↔ Qasirah | 350 | 13,0 j | 9,7 j | 7,8 j |
| Saint-Lys ↔ Torralba | 496 | 18,4 j | 13,8 j | 11,0 j |
| Saint-Lys ↔ Velencia | 526 | 19,5 j | 14,6 j | 11,7 j |
| Altenburg ↔ Vespera | 137 | 5,1 j | 3,8 j | 3,0 j |
| Altenburg ↔ Ravenhold | 139 | 5,1 j | 3,9 j | 3,1 j |
| Altenburg ↔ Eisburg | 60 | 2,2 j | 1,7 j | 1,3 j |
| Vespera ↔ Ravenhold | 133 | 4,9 j | 3,7 j | 2,9 j |
| Vespera ↔ Valdoro | 38 | 1,4 j | 1,1 j | 0,9 j |
| Ravenhold ↔ Stoneford | 48 | 1,8 j | 1,3 j | 1,1 j |
| Ravenhold ↔ Qasirah | 154 | 5,7 j | 4,3 j | 3,4 j |
| Ravenhold ↔ Torralba | 169 | 6,2 j | 4,7 j | 3,7 j |
| Torralba ↔ Velencia | 148 | 5,5 j | 4,1 j | 3,3 j |
| Cortelba ↔ Velencia | 40 | 1,5 j | 1,1 j | 0,9 j |
| Qasirah ↔ Velencia | 214 | 7,9 j | 6,0 j | 4,8 j |
| Monteluz ↔ Varela | 42 | 1,5 j | 1,2 j | 0,9 j |
| Hisn al-Hajar ↔ Qasirah | 33 | 1,2 j | 0,9 j | 0,7 j |
| Île de Tirwen, traversée diagonale (NO→SE) | 132 | 4,9 j | 3,7 j | 2,9 j |

## 6. Échelle du continent

- **Continent principal** (hors Île de Tirwen) : environ **690 km × 555 km**, comparable à la Grande-Bretagne. Le monde connu est compact : les capitales sont à une à trois semaines de voyage les unes des autres.
- **Royaume de Fleuraine** (largeur est-ouest) : environ **225 km**.

## 7. Méthode de mesure (pour recalculer une nouvelle distance)

1. Repérer les deux points sur l'image chargée (peu importe sa résolution, tant qu'elle représente la carte entière).
2. Mesurer la distance en pixels entre les deux points.
3. Diviser par la largeur totale de l'image en pixels (ex. 1096 pour la copie réduite).
4. Multiplier par **825,6** pour obtenir la distance en km.
5. Diviser par 27 / 36 / 45 selon le rythme voulu pour obtenir un temps de trajet en jours.

Si la carte utilisée a été recadrée ou n'est pas carrée, cette méthode ne fonctionne plus telle quelle : repartir de la carte complète en pleine résolution (4446×4446 px) pour recalibrer.
