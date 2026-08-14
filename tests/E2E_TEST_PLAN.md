# Plan de tests d'interface — dnd-custom-ai

Plan de tests écrit côté ingénierie + QA pour couvrir l'interface du système, à coder plus tard
avec l'infrastructure déjà en place (`cypress/`, `tests/quench/` — voir `tests/README.md` section
"Tests au réel"). Ce document liste les scénarios à implémenter, pas leur code : chaque ligne
deviendra un `it(...)` Cypress ou un test Quench une fois écrite.

## Conventions

- **ID** : `T-<section>-<numéro>`, stable dans le temps (ne pas renuméroter en insérant, ajouter
  à la fin d'une section).
- **Priorité** — **P0** : chemin critique (bloquant si cassé, ex. impossible de créer un
  personnage) · **P1** : fonctionnalité importante mais contournable · **P2** : confort/
  affichage, régression mineure acceptable temporairement.
- **Couche** — **E2E** (Cypress, DOM/interaction réelle) · **Quench** (pipeline Document/
  DataModel, sans interaction UI) · **E2E+Quench** (les deux apportent une garantie différente :
  Quench vérifie le calcul, E2E vérifie qu'il s'affiche correctement).
- Sauf mention contraire, les scénarios s'exécutent avec un utilisateur **Joueur** propriétaire
  du personnage (pas le Gamemaster) — le rôle GM n'est précisé que quand le comportement en
  dépend explicitement (champs verrouillés MJ, XP détaillé, etc.).

## Prérequis d'infrastructure pour coder cette suite

- Le monde de test doit contenir les Items du monde importés (`world-items/*.json`, cf. leurs
  README) : classes/origines de référence, armes/armures de départ, capacités, sorts. Sans eux,
  une bonne partie des scénarios Équipement/Capacités/Sorts ne peut pas s'exécuter.
- Le monde doit pouvoir être remis dans un état connu entre les tests (personnage supprimé et
  recréé, ou plusieurs Actors de fixture pré-créés à un niveau/classe donné). À trancher avant
  d'écrire le code : soit un `Actor.create` + `wizard` rejoué à chaque test (lent mais réaliste),
  soit des fixtures JSON importées directement via Quench (rapide, contourne l'assistant).
- Le bug connu "fiche par-dessus l'assistant" (cf. [[project_souci1_wizard_sheet_race]]) n'est
  **pas encore corrigé** au moment d'écrire ce plan — T-WIZ-010 ci-dessous doit rester rouge tant
  que ce n'est pas fait ; ne pas le neutraliser pour faire passer la CI au vert artificiellement.

---

## 1. Assistant de création de personnage (`character-creation-wizard.js`)

| ID | Titre | Priorité | Couche | Étapes clés | Résultat attendu |
|---|---|---|---|---|---|
| T-WIZ-001 | Ouverture auto sur un Actor vierge | P0 | E2E | Créer un Actor type "character" sans classe/origine | L'assistant s'ouvre automatiquement, la fiche native ne s'affiche pas |
| T-WIZ-002 | Contenu des listes déroulantes | P1 | E2E | Ouvrir l'assistant | Le select Origine liste toutes les origines de `game.dndCustomAi.origins`, le select Classe les 12 classes de `DND_CUSTOM.classes`, triées alphabétiquement (locale FR) |
| T-WIZ-003 | Résumé dynamique Origine | P1 | E2E | Sélectionner successivement 2 origines différentes ayant des bonus différents | Le texte sous le select se met à jour à chaque changement (bonus de caractéristiques, compétences avantagées, trait spécial en infobulle) |
| T-WIZ-004 | Résumé dynamique Classe | P1 | E2E | Sélectionner successivement 2 classes (une lanceuse de sorts, une non) | Le texte sous le select se met à jour (sauvegardes maîtrisées, nombre de compétences, mention "incantation" seulement si lanceuse) |
| T-WIZ-005 | Indication du quota de compétences | P1 | E2E | Sélectionner une classe avec 2 compétences au choix, puis une avec 4 | L'indice affiché change en conséquence |
| T-WIZ-006 | Verrouillage des compétences au quota | P0 | E2E | Choisir une classe à 2 compétences, cocher 2 cases | Les cases non cochées deviennent désactivées ; décocher une case réactive les autres |
| T-WIZ-007 | Permutation automatique des caractéristiques | P0 | E2E | Mettre 15 sur Intelligence alors que Force affiche déjà 15 | Force prend automatiquement l'ancienne valeur d'Intelligence — aucune valeur du tableau standard n'est jamais dupliquée à l'écran |
| T-WIZ-008 | Soumission valide | P0 | E2E+Quench | Remplir nom, origine, classe, 6 caractéristiques (permutation du tableau standard), quota exact de compétences ; soumettre | L'Actor est mis à jour (`system.class`, `system.origin`, `system.abilities.*.value`, `system.saves.*.proficient` déduit de la classe, `system.skills.*.proficient`), PV initialisés au max, notification de succès, assistant fermé, fiche rouverte |
| T-WIZ-009 | Rejet — tableau standard invalide | P0 | E2E | Mettre 2 select de caractéristique à la même valeur en modifiant le DOM autrement qu'au clic (ou intercepter la requête) puis soumettre | Notification d'erreur `DND_CUSTOM.Wizard.InvalidAbilities`, aucune mise à jour envoyée à l'Actor |
| T-WIZ-010 | **Régression connue** — fiche visible pendant l'assistant | P0 | E2E | Créer un nouvel Actor "character" (déclenche l'ouverture auto) | La fiche native (`DndCustomActorSheet`) ne doit **jamais** apparaître, même une fraction de seconde, tant que l'assistant est ouvert — cf. [[project_souci1_wizard_sheet_race]], bug non corrigé au moment d'écrire ce plan |
| T-WIZ-011 | Rejet — quota de compétences non respecté | P0 | E2E | Soumettre avec 1 compétence cochée alors que la classe en permet 2 | Notification d'erreur `DND_CUSTOM.Wizard.InvalidSkillCount`, aucune mise à jour envoyée |
| T-WIZ-012 | Liaison automatique au joueur | P1 | E2E+Quench | Terminer l'assistant en tant que Joueur (pas GM) | `ownership.<userId>` = OWNER sur l'Actor, `game.user.character` pointe vers cet Actor |
| T-WIZ-013 | Pas de liaison automatique pour le MJ | P2 | E2E | Terminer l'assistant en tant que GM | `game.user.character` n'est pas modifié |
| T-WIZ-014 | Équipement de départ attribué | P1 | E2E+Quench | Terminer l'assistant avec une classe ayant arme+armure de départ (ex. Guerrier) | Les deux Items apparaissent sur l'Actor avec `system.equipped = true` |
| T-WIZ-015 | Équipement de départ manquant → avertissement non bloquant | P2 | Quench | Terminer l'assistant sans que les Items du monde `world-items/weapons.json`/`armors.json` soient importés | Notification d'avertissement `StartingEquipmentMissing`, la création du personnage aboutit quand même |
| T-WIZ-016 | Capacités/sorts de niveau 1 octroyés | P1 | E2E+Quench | Terminer l'assistant avec une classe lanceuse de sorts | Les capacités de classe niveau 1 et les sorts/tours de magie de niveau 1 apparaissent sur l'Actor |
| T-WIZ-017 | Langues octroyées | P2 | Quench | Terminer l'assistant avec n'importe quelle origine | L'Actor possède un Item "Commune" + la langue propre à l'origine choisie |
| T-WIZ-018 | Réouverture après fermeture sans terminer | P2 | E2E | Fermer l'assistant sans soumettre, rouvrir la fiche | Le bouton "Créer un personnage" reste visible, aucune donnée n'a été modifiée |

---

## 2. Fiche personnage — en-tête et navigation (`character-sheet.hbs`)

| ID | Titre | Priorité | Couche | Étapes clés | Résultat attendu |
|---|---|---|---|---|---|
| T-SHEET-001 | Navigation entre les 5 onglets | P0 | E2E | Cliquer successivement sur Statistiques / Équipement / Inventaire / Capacités / Journal | Chaque onglet affiche son contenu, un seul actif à la fois (classe CSS + `data-tab`) |
| T-SHEET-002 | Barre de PV | P1 | E2E | Modifier les PV actuels (via un repos ou un dégât simulé) | La largeur de la barre reflète `hp.value / hp.max`, jamais < 0% ni > 100% même si `hp.value` dépasse temporairement `hp.max` |
| T-SHEET-003 | Résumé des états actifs visible sur tous les onglets | P2 | E2E | Activer un état (ex. Empoisonné) depuis l'onglet Statistiques, aller sur un autre onglet | L'état apparaît dans le résumé compact de l'en-tête, quel que soit l'onglet ouvert |
| T-SHEET-004 | Bouton "Créer un personnage" masqué une fois complet | P1 | E2E | Ouvrir la fiche d'un personnage ayant classe ET origine définies | Le bouton n'est pas affiché |
| T-SHEET-005 | Barre XP joueur — pas de valeurs chiffrées | P2 | E2E | Ouvrir la fiche en tant que Joueur | La barre de progression XP est visible mais aucun total ni seuil chiffré n'apparaît (réservé au bloc `{{#if isGM}}`) |
| T-SHEET-006 | Bloc XP détaillé — GM uniquement | P2 | E2E | Ouvrir la même fiche en tant que GM | Le total XP et le seuil du prochain niveau sont visibles |
| T-SHEET-007 | Barre XP à 100% au niveau 20 | P2 | E2E | Fiche d'un personnage niveau 20 | La barre affiche 100%, pas d'erreur de calcul (pas de seuil "niveau 21") |
| T-SHEET-008 | Champs Classe/Origine non éditables directement | P1 | E2E | Ouvrir la fiche | Aucun select Classe/Origine sur la fiche — seul l'assistant (ou GM via édition directe) peut les changer |

---

## 3. Onglet Statistiques (`tab-stats.hbs`)

| ID | Titre | Priorité | Couche | Étapes clés | Résultat attendu |
|---|---|---|---|---|---|
| T-STATS-001 | Jet de caractéristique simple | P0 | E2E | Cliquer sur le bouton de jet d'une caractéristique | Un message de chat apparaît avec 1d20 + le bon modificateur |
| T-STATS-002 | Jet de caractéristique avec avantage (Maj-clic) | P1 | E2E | Maj-clic sur le bouton de jet | Le jet est effectué avec avantage (2d20 garder le plus haut, ou équivalent du moteur de jet du système) |
| T-STATS-003 | Jet de caractéristique avec désavantage (Ctrl-clic) | P1 | E2E | Ctrl-clic sur le bouton de jet | Jet avec désavantage |
| T-STATS-004 | Jet de sauvegarde — bonus de maîtrise appliqué | P0 | E2E+Quench | Cliquer sur le jet de sauvegarde d'une caractéristique maîtrisée vs une non maîtrisée | Le total inclut le bonus de maîtrise seulement pour la sauvegarde maîtrisée |
| T-STATS-005 | Jet de compétence — avantage d'origine automatique | P1 | E2E | Cliquer sur le jet d'une compétence avantagée par l'origine du personnage | Avantage appliqué sans Maj-clic |
| T-STATS-006 | Jet de compétence — désavantage d'armure (Discrétion) | P1 | E2E | Équiper une armure imposant un désavantage, jeter Discrétion | Désavantage appliqué automatiquement |
| T-STATS-007 | Aptitudes multiples (Barde) — demi-bonus sur compétence non maîtrisée | P2 | E2E+Quench | Personnage Barde avec la capacité "Aptitudes multiples", jeter une compétence non maîtrisée | Le modificateur inclut la moitié (arrondie à l'inférieur) du bonus de maîtrise |
| T-STATS-008 | Boutons +/- caractéristique réservés au MJ | P1 | E2E | Ouvrir la fiche en Joueur | Les boutons +/- ne sont pas visibles/actifs ; en GM ils le sont et modifient `system.abilities.<key>.value` |
| T-STATS-009 | Repos court — soin de moitié des PV max | P0 | E2E+Quench | PV actuels < max, cliquer Repos court | PV = min(actuel + floor(max/2), max), message de chat posté |
| T-STATS-010 | Repos court — restaure les emplacements Occultiste | P1 | Quench | Personnage Occultiste avec emplacements de sorts utilisés, Repos court | `system.spells.uses.value` revient au max |
| T-STATS-011 | Repos long — soin complet + sorts restaurés | P0 | E2E+Quench | PV et sorts partiellement dépensés, Repos long | PV = max, sorts = max, message de chat posté |
| T-STATS-012 | Repos — recharge des capacités à charges | P1 | Quench | Capacité avec `uses.recharge = "shortRest"` épuisée, Repos court puis Repos long | Rechargée après le repos court (et donc aussi après le long) |
| T-STATS-013 | Repos bloqué si personnage mort | P0 | E2E | Personnage avec 3 échecs de mort (mort), cliquer Repos court/long | Aucun effet, pas d'update envoyé |
| T-STATS-014 | Jet d'Initiative | P0 | E2E | Personnage sur une scène active avec un combat en cours, cliquer Initiative | Un Combattant est créé si absent, le Combat Tracker affiche le résultat |
| T-STATS-015 | Bascule d'un état (condition) | P1 | E2E | Cliquer sur une icône d'état (ex. Empoisonné) | L'ActiveEffect correspondante est créée/retirée, l'icône reflète l'état actif |
| T-STATS-016 | Exhaustion +/- avec bornes | P1 | E2E | Cliquer + jusqu'à dépasser 6, puis - jusqu'à dépasser 0 | La valeur reste bornée entre 0 et 6 |
| T-STATS-017 | Désavantage automatique lié à l'Exhaustion | P1 | E2E+Quench | Exhaustion ≥ 1, jet de caractéristique/compétence | Désavantage appliqué automatiquement, sans Maj/Ctrl-clic |
| T-STATS-018 | Panneau Agonie — apparition à 0 PV | P0 | E2E | PV tombent à 0 (dégât simulé) | Le panneau Agonie devient visible, pastilles de réussite/échec à zéro |
| T-STATS-019 | Jet de sauvegarde de la mort — réussite/échec/critique | P0 | E2E+Quench | Cliquer "Jet de sauvegarde de la mort" plusieurs fois (mocker le jet ou répéter jusqu'à observer chaque cas) | 10+ = réussite ; <10 = échec ; nat 1 = deux échecs ; nat 20 = régénère 1 PV et sort de l'Agonie |
| T-STATS-020 | Troisième échec de mort → personnage mort | P0 | E2E+Quench | Provoquer 3 échecs de jet de sauvegarde de la mort | Statut "dead" appliqué, message de chat de décès, Repos désactivé (cf. T-STATS-013) |
| T-STATS-021 | Trois réussites → stabilisé | P1 | E2E | Provoquer 3 réussites de jet de sauvegarde de la mort | Panneau Agonie indique "stabilisé", plus de jets proposés |
| T-STATS-022 | Retour au-dessus de 0 PV réinitialise l'état de mort | P1 | E2E+Quench | Personnage en Agonie (0 PV, quelques réussites/échecs), recevoir des soins | Compteurs remis à zéro, panneau Agonie disparaît, statut Inconscient retiré |

---

## 4. Onglet Équipement (`tab-equipment.hbs`)

| ID | Titre | Priorité | Couche | Étapes clés | Résultat attendu |
|---|---|---|---|---|---|
| T-EQUIP-001 | Emplacement main principale | P1 | E2E | Équiper une arme à une main | Apparaît dans l'emplacement "main principale" |
| T-EQUIP-002 | Arme à deux mains occupe les deux emplacements | P1 | E2E | Équiper une arme à deux mains (non Polyvalente) | Emplacement "main secondaire" affiche une mention dédiée, pas un doublon de l'objet |
| T-EQUIP-003 | Arme Polyvalente — bascule 1 main / 2 mains | P1 | E2E | Équiper une arme Polyvalente seule, puis équiper un objet en main secondaire | Le mode change automatiquement (2 mains si secondaire libre, 1 main sinon), les dégâts affichés suivent (cf. T-INV-005) |
| T-EQUIP-004 | Emplacement armure | P1 | E2E | Équiper une armure de corps | CA affichée = CA totale de l'armure |
| T-EQUIP-005 | Accessoires (bouclier etc.) | P2 | E2E | Équiper un bouclier | Apparaît dans les accessoires, bonus affiché avec signe (+2) et non en CA absolue |

---

## 5. Onglet Inventaire (`tab-inventory.hbs`)

| ID | Titre | Priorité | Couche | Étapes clés | Résultat attendu |
|---|---|---|---|---|---|
| T-INV-001 | Deux tableaux distincts | P2 | E2E | Ouvrir l'onglet avec au moins une arme et un objet `gear` | Armes/Armures dans un tableau, Objets/Outils dans un autre |
| T-INV-002 | Poids porté et capacité de charge | P1 | E2E+Quench | Ajouter/retirer des objets | `carriedWeight` et `carryingCapacity` (et son %) se recalculent, `overCapacity` s'active au-delà |
| T-INV-003 | Jet d'attaque d'arme | P0 | E2E+Quench | Cliquer sur le bouton d'attaque d'une arme équipée | 1d20 + bonus (avec bonus de maîtrise seulement si la classe couvre la catégorie de l'arme) |
| T-INV-004 | Jet d'attaque comparé à la CA de la cible | P1 | E2E | Cibler un Token avant de lancer une attaque d'arme | Le message de chat indique touché/manqué par rapport à la CA de la cible ciblée |
| T-INV-005 | Jet de dégâts — dé suit l'équipement réel (Polyvalente) | P1 | E2E | Arme Polyvalente équipée à deux mains, cliquer Dégâts (sans forcer l'alternative) | Utilise le dé "deux mains" ; bouton alternative/Maj-clic force l'autre dé |
| T-INV-006 | Utiliser un objet — soin | P1 | E2E+Quench | Objet `gear` type "heal", cliquer Utiliser | PV augmentent de (base + bonus de compétence), plafonné au max, message de chat |
| T-INV-007 | Utiliser un objet — lumière (allumer/éteindre) | P2 | E2E | Objet `gear` type "light", cliquer Utiliser deux fois de suite | Allume puis éteint le token actif de l'Actor sur la scène ; une seule source de lumière active à la fois par Actor |
| T-INV-008 | Utiliser un objet lumineux sans token sur la scène | P2 | E2E | Même objet, Actor sans token sur la scène active | Avertissement `NoTokenOnScene`, aucune erreur |
| T-INV-009 | Utiliser un outil — test de compétence | P1 | E2E+Quench | Objet `tool` avec `useEffect.skill`, cliquer Utiliser | Jet de compétence avec bonus de maîtrise de l'outil + bonus fixe, `quantity` décrémenté de 1 |
| T-INV-010 | Outil épuisé | P1 | E2E | `quantity = 0`, cliquer Utiliser | Avertissement, aucun jet effectué |

---

## 6. Onglet Capacités / Sorts (`tab-abilities.hbs` + partials par classe)

| ID | Titre | Priorité | Couche | Étapes clés | Résultat attendu |
|---|---|---|---|---|---|
| T-ABIL-001 | En-tête spécifique par classe | P2 | E2E | Ouvrir l'onglet pour 2-3 classes différentes | Le partial `templates/actor/abilities/<classe>.hbs` propre à chaque classe s'affiche (titre/icône/accroche) |
| T-ABIL-002 | Repli sur le partial "default" | P2 | E2E | Ouvrir l'onglet sur un Actor sans classe (en cours d'assistant, si accessible) | Partial "default" utilisé, pas d'erreur |
| T-ABIL-003 | Jet libre d'une capacité (avec formule) | P1 | E2E+Quench | Capacité `requiresRoll` avec `rollFormula` (ex. Second souffle), cliquer | Formule évaluée avec les données de l'Actor (résolution des `@...`), résultat en chat |
| T-ABIL-004 | Consommation de charge sur une capacité limitée | P1 | E2E+Quench | Capacité à charges, l'utiliser | `uses.value` décrémenté, affiché dans le message de chat |
| T-ABIL-005 | Capacité épuisée | P1 | E2E | `uses.value = 0`, tenter d'utiliser | Avertissement `NoChargesLeft`, aucune charge décomptée en dessous de zéro |
| T-ABIL-006 | Capacité sans jet à charges (ex. Imposition des mains) | P2 | E2E | Capacité à charges sans `requiresRoll` | Décrémente et annonce en chat, sans poster de jet |
| T-ABIL-007 | Technique consommant la réserve d'une autre capacité | P1 | E2E+Quench | Capacité avec `costsResource` pointant vers une capacité réservoir (ex. Ki de Moine) | La réserve (pas la technique elle-même) est décrémentée |
| T-ABIL-008 | Bouton grisé si réserve vide | P1 | E2E | Réserve à 0, ouvrir l'onglet | Le bouton de la technique liée est grisé/non cliquable |
| T-ABIL-009 | Sentinelle modifie le déclencheur d'Attaque d'opportunité | P2 | E2E | Personnage avec les capacités "Sentinelle" et "Attaque d'opportunité" | Le déclencheur affiché change en conséquence (dérivé à l'affichage, rien d'écrit sur l'Item) |
| T-ABIL-010 | Lancer un sort — décompte du pool | P0 | E2E+Quench | Sort de niveau > 0, cliquer Lancer | `spells.uses.value` décrémenté de 1, message de chat |
| T-ABIL-011 | Aucun emplacement disponible | P0 | E2E | `spells.uses.value = 0`, tenter de lancer un sort de niveau > 0 | Avertissement `NoSlotAvailable`, aucun décompte |
| T-ABIL-012 | Tour de magie — pas de décompte | P1 | E2E | Sort de niveau 0, cliquer Lancer | Aucun changement de `spells.uses.value` |
| T-ABIL-013 | Incantation rituelle gratuite | P1 | E2E+Quench | Sort `ritual`, personnage avec la capacité "Incantation rituelle (Clerc/Druide)" | Lancé sans consommer de charge, même si niveau > 0 |
| T-ABIL-014 | Concentration — un seul sort à la fois | P1 | E2E+Quench | Lancer un sort à concentration, puis un second sort à concentration | `concentratingOn` reflète le second, message de chat "concentration rompue" pour le premier |
| T-ABIL-015 | Rompre la concentration manuellement | P1 | E2E | Cliquer le bouton dédié pendant une concentration active | `concentratingOn` vidé |
| T-ABIL-016 | Sort d'attaque — jet d'attaque puis dégâts séparés | P1 | E2E | Sort avec `system.attack`, cliquer Lancer | Jet d'attaque posté (1d20 + bonus de sort, comparé à la CA ciblée) ; bouton de dégâts distinct apparaît ensuite |
| T-ABIL-017 | Sort de dégâts — pas de modificateur de caractéristique | P2 | E2E | Cliquer le jet de dégâts d'un sort | Seuls les dés du sort sont lancés, sans ajout du modificateur d'incantation |
| T-ABIL-018 | Sort de lumière allume le token | P2 | E2E | Lancer un sort avec `light.bright`/`light.dim` renseigné | Le token du lanceur s'allume en conséquence, sans interrupteur persistant (chaque lancer réapplique) |
| T-ABIL-019 | Réaction — capacité de type "reaction" bloquée si déjà utilisée | P1 | E2E+Quench | Réaction déjà consommée ce round, tenter d'utiliser une autre capacité/sort de type "reaction" | Avertissement `ReactionUnavailable`, action annulée sans décompte de charge |
| T-ABIL-020 | Bascule manuelle de la réaction | P2 | E2E | Cliquer l'indicateur de réaction dans l'en-tête | `combat.reactionAvailable` bascule |
| T-ABIL-021 | Régénération de la réaction en début de tour | P1 | Quench | Simuler `updateCombat` faisant passer au tour du personnage | `combat.reactionAvailable` repasse à `true` (hook, à vérifier côté `dnd-custom-ai.js`) |

---

## 7. Onglet Journal (`tab-journal.hbs`)

| ID | Titre | Priorité | Couche | Étapes clés | Résultat attendu |
|---|---|---|---|---|---|
| T-JOURNAL-001 | Langues connues affichées et triées | P2 | E2E | Terminer l'assistant, ouvrir l'onglet Journal | Commune + langue d'origine listées, triées alphabétiquement |
| T-JOURNAL-002 | Ajout manuel d'une langue spéciale | P2 | E2E | Glisser un Item langue depuis le compendium "Langues" sur la fiche | La langue apparaît dans l'onglet Journal |

---

## 8. Montée de niveau (`#onLevelUp`, `level-up-choice.js`, `subclass-choice.js`)

| ID | Titre | Priorité | Couche | Étapes clés | Résultat attendu |
|---|---|---|---|---|---|
| T-LVL-001 | Montée d'un seul niveau à la fois | P0 | E2E+Quench | Personnage éligible (XP ≥ seuil), cliquer "Monter de niveau" plusieurs fois d'affilée rapidement | Le niveau n'augmente que de 1 par clic, jamais directement au niveau max éligible |
| T-LVL-002 | PV recalculés et remplis au max | P0 | E2E+Quench | Monter de niveau | `hp.max` recalculé, `hp.value` = nouveau max |
| T-LVL-003 | Bouton accessible au Joueur, pas seulement au GM | P1 | E2E | Monter de niveau en tant que Joueur propriétaire | L'action aboutit (option `dndCustomLevelUp` reconnue par le hook `preUpdateActor`) |
| T-LVL-004 | Capacités/sorts du nouveau niveau octroyés + annoncés | P1 | E2E+Quench | Monter jusqu'à un niveau accordant du nouveau contenu | Items ajoutés à l'Actor, message de chat listant les noms accordés |
| T-LVL-005 | Rien accordé → pas de message parasite | P2 | Quench | Monter à un niveau sans nouveau contenu de classe | Aucun message de chat "capacités accordées" |
| T-LVL-006 | Choix de sous-classe proposé au bon niveau | P0 | E2E | Personnage sans sous-classe, monter au niveau `DND_CUSTOM.subclassLevel[classe]` (ex. niveau 1 pour Clerc/Ensorceleur/Occultiste, niveau 3 pour Guerrier) | La fenêtre de choix de sous-classe s'ouvre automatiquement |
| T-LVL-007 | Pas de re-proposition si déjà choisie | P1 | E2E | Monter de niveau alors qu'une sous-classe est déjà choisie | La fenêtre ne s'ouvre pas |
| T-LVL-008 | Sélecteur d'en-tête en secours | P2 | E2E | Fermer la fenêtre de choix de sous-classe sans choisir, puis utiliser le sélecteur de l'en-tête de fiche | `system.subclass` mis à jour de la même façon, capacités de sous-classe octroyées |
| T-LVL-009 | Choix Amélioration de caractéristique / Don aux bons niveaux | P0 | E2E | Monter à un niveau de `[4, 8, 12, 16, 19]` | La fenêtre de choix ASI/Don s'ouvre automatiquement |
| T-LVL-010 | Pas de proposition ASI/Don aux autres niveaux | P1 | E2E | Monter à un niveau hors de cette liste | Fenêtre non proposée |
| T-LVL-011 | Choix "Amélioration de caractéristique" appliqué | P1 | E2E+Quench | Choisir l'option ASI dans la fenêtre | Les points sont répartis sur les caractéristiques choisies (vérifier les bornes/règles exactes du dialogue) |
| T-LVL-012 | Choix "Don" appliqué | P1 | E2E+Quench | Choisir l'option Don | Le don choisi est ajouté comme Item à l'Actor |

---

## 9. Fiches de référence (Classe / Sous-classe / Origine)

| ID | Titre | Priorité | Couche | Étapes clés | Résultat attendu |
|---|---|---|---|---|---|
| T-REF-001 | Ouvrir la fiche de Classe depuis la fiche personnage | P2 | E2E | Cliquer sur le nom de la classe | La fiche de l'Item Classe s'ouvre (trouvée dans les Items du monde ou le compendium `classes`) |
| T-REF-002 | Ouvrir la fiche de Sous-classe | P2 | E2E | Sous-classe choisie, cliquer sur son nom | Fiche de l'Item Sous-classe ouverte |
| T-REF-003 | Ouvrir la fiche d'Origine | P2 | E2E | Cliquer sur le nom de l'origine | Fiche de l'Item Origine ouverte |
| T-REF-004 | Avertissement si introuvable | P2 | E2E | Retirer temporairement l'Item du monde correspondant, cliquer | Avertissement non bloquant (`ClassSheetMissing`/`SubclassSheetMissing`/`OriginSheetMissing`), pas d'erreur JS |

---

## 10. Fiche NPC (`npc-sheet.js`, `npc-*.hbs`)

| ID | Titre | Priorité | Couche | Étapes clés | Résultat attendu |
|---|---|---|---|---|---|
| T-NPC-001 | Navigation 3 onglets | P1 | E2E | Ouvrir un Actor de type NPC | Onglets Statistiques/Capacités/Butin fonctionnels |
| T-NPC-002 | Jet de caractéristique | P1 | E2E | Cliquer un jet de caractéristique | 1d20 + modificateur en chat |
| T-NPC-003 | Bascule d'état | P2 | E2E | Cliquer une icône d'état | ActiveEffect créée/retirée |
| T-NPC-004 | Jet d'Initiative | P1 | E2E | Cliquer Initiative sur une scène avec combat actif | Combattant créé/mis à jour |
| T-NPC-005 | Octroi d'XP au groupe | P1 | E2E+Quench | Cliquer "Octroyer XP" avec des Actors joueurs sélectionnés/ciblés | XP répartie, notification |

---

## 11. Fiche Véhicule (`vehicle-actor-sheet.js`)

| ID | Titre | Priorité | Couche | Étapes clés | Résultat attendu |
|---|---|---|---|---|---|
| T-VEH-001 | Ouverture et champs de base | P2 | E2E | Ouvrir un Actor type Véhicule | Formulaire simple s'affiche, pas d'erreur |
| T-VEH-002 | Barre de PV | P2 | E2E | Modifier les PV | Barre recalculée, bornée 0-100% |
| T-VEH-003 | Inventaire embarqué | P2 | E2E | Ajouter un objet weapon/armor/gear/tool | Apparaît dans la liste d'inventaire du véhicule |

---

## 12. Fiches d'Item (`item-sheets.js`, `templates/item/*.hbs`)

| ID | Titre | Priorité | Couche | Étapes clés | Résultat attendu |
|---|---|---|---|---|---|
| T-ITEM-001 | Ouverture de chaque type d'Item | P1 | E2E | Ouvrir successivement weapon/armor/feature/gear/language/origin/class/spell/tool | Chaque fiche s'affiche sans erreur avec ses champs propres |
| T-ITEM-002 | Édition d'un champ simple persiste | P1 | E2E | Modifier un champ texte/numérique, fermer, rouvrir | La valeur est conservée |
| T-ITEM-003 | Champs conditionnels s'affichent/se masquent | P2 | E2E | Sur une arme, activer la propriété Polyvalente | Le champ `damageVersatile.dice` apparaît |

---

## 13. Glisser-déposer entre fiches (`inventory-drag-drop.js`)

| ID | Titre | Priorité | Couche | Étapes clés | Résultat attendu |
|---|---|---|---|---|---|
| T-DND-001 | Transfert d'un objet vers un autre Actor ouvert | P1 | E2E | Ouvrir deux fiches (ex. personnage + véhicule), glisser un objet inventaire de l'une vers l'autre | L'objet est retiré de la source et ajouté à la destination (pas dupliqué) |
| T-DND-002 | Glisser-déposer refusé sur une cible invalide | P2 | E2E | Glisser un objet en dehors de toute fiche | Aucune erreur JS, rien ne change |
| T-DND-003 | Import depuis un compendium par glisser-déposer | P2 | E2E | Glisser une entrée de compendium (ex. `dnd-custom-ai.classes`) sur la fiche | L'Item est dupliqué localement sur l'Actor |

---

## 14. Intégration Combat Tracker

| ID | Titre | Priorité | Couche | Étapes clés | Résultat attendu |
|---|---|---|---|---|---|
| T-COMBAT-001 | Initiative apparaît dans le tracker | P1 | E2E | Jet d'Initiative depuis la fiche | Le Combattant apparaît dans le Combat Tracker avec le bon score |
| T-COMBAT-002 | Réaction régénérée en début de tour propre | P1 | Quench | Avancer le tracker jusqu'au tour du personnage, réaction consommée au tour précédent | `combat.reactionAvailable` repasse à `true` |
| T-COMBAT-003 | Fin de combat ne casse rien | P2 | E2E | Supprimer le combat en cours | Pas d'erreur JS, fiche reste utilisable |

---

## 15. Permissions et champs verrouillés (Joueur vs MJ)

| ID | Titre | Priorité | Couche | Étapes clés | Résultat attendu |
|---|---|---|---|---|---|
| T-PERM-001 | Champs verrouillés MJ inaccessibles au Joueur | P0 | Quench | En tant que Joueur, tenter une mise à jour directe de `system.class`/`system.origin`/caractéristiques sans l'option `dndCustomWizard` | Rejeté par le hook `preUpdateActor` |
| T-PERM-002 | Exception `dndCustomWizard` fonctionne uniquement depuis l'assistant | P0 | Quench | Reproduire l'update de l'assistant avec l'option posée manuellement | Autorisé (comportement attendu du hook, pas une faille à corriger — sert de test de non-régression sur le mécanisme lui-même) |
| T-PERM-003 | Exception `dndCustomLevelUp` limitée au champ `level` | P1 | Quench | Avec l'option `dndCustomLevelUp`, tenter de modifier `system.class` en plus de `level` dans le même update | Seul `level` passe, le reste reste bloqué (ou l'update entier est rejeté — à clarifier avec le comportement réel du hook avant d'écrire le test) |
| T-PERM-004 | Joueur non propriétaire ne voit pas la fiche | P0 | E2E | Utilisateur sans ownership tente d'ouvrir la fiche d'un autre joueur | Accès refusé (comportement natif Foundry, test de garde-fou plutôt que de logique système) |

---

## 16. Internationalisation (FR/EN)

| ID | Titre | Priorité | Couche | Étapes clés | Résultat attendu |
|---|---|---|---|---|---|
| T-I18N-001 | Bascule de langue serveur | P2 | E2E | Changer la langue du monde en anglais, recharger une fiche | Tous les libellés basculent en anglais, aucune clé brute `DND_CUSTOM.*` affichée à l'écran |
| T-I18N-002 | Assistant de création en anglais | P2 | E2E | Même bascule, ouvrir l'assistant | Résumés dynamiques (origine/classe/quota compétences) aussi traduits, pas seulement les libellés statiques |

---

## Hors scope (rappel, cf. `tests/README.md` et mémoire projet)

- Pas de Hit Dice côté joueur : ne pas écrire de test qui en suppose l'existence.
- Pas de combat automatisé avancé dépendant de la position/portée/ligne de vue — seuls les
  effets univoques propres au personnage qui jette sont couverts (cf. `conditionRollEffects`).
- CI GitHub Actions (secrets + monde éphémère) : hors périmètre de ce plan, cf.
  [[project_docker_e2e_testing_setup]] pour l'état d'avancement de ce chantier séparé.
