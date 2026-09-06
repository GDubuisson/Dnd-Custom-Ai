# Conception technique — dnd-custom-ai

Document de référence technique du système Foundry VTT `dnd-custom-ai`. Remplace
`PROJECT.md`/`ITEMS.md` (disparus, contenu repris ici) et les notes techniques éparpillées dans
les anciens fichiers de retours testeurs. Mis à jour au fil des sessions — c'est ce fichier qu'il
faut lire avant toute intervention technique, avec `ClaudeFiles/CONCEPTION_FONCTIONNELLE.md` pour
le "quoi" et `ClaudeFiles/ANOMALIES_ACTIVES.md` pour ce qui reste à corriger.

## Stack et bornes strictes

- **Plateforme** : Foundry VTT **v14** (`compatibility.minimum` et `verified` — la v13 n'est plus
  déclarée compatible faute d'y avoir été réellement testée). Documentation API de référence :
  https://foundryvtt.com/api/ — aucune API dépréciée ou non documentée.
- **Aucun système de build** : JavaScript vanilla (ES modules), chargé directement via
  `system.json` (`esmodules`). Pas de npm/webpack/bundler pour le système livré.
- **Pas de framework front** (React/Vue...) : Handlebars natif Foundry uniquement.
- **Framework de fiches** : `ActorSheetV2`/`ItemSheetV2` (ApplicationV2 + `HandlebarsApplicationMixin`)
  — l'ancien `ActorSheet`/`ItemSheet` V1 est déprécié depuis la v13, jamais utilisé ici.
- **DataModels** : schéma de données en JS (`scripts/data/*.js`), pas `template.json` (approche
  dépréciée depuis la v12/v13).
- Toute donnée de jeu (Origines, classes, capacités, sorts, équipement de départ...) est
  externalisée en JSON (`scripts/data/*.json`, `world-items/*.json`), jamais en dur dans le JS.
- CSS scoppé au système (`styles/dnd-custom-ai.css`) pour ne pas entrer en conflit avec d'autres
  modules/systèmes installés.
- Ne jamais modifier le cœur de Foundry (core) — uniquement hooks et API officiels
  (`Hooks.on`, `game.actors`, etc.).
- Fichiers de template < 300 lignes ; découper par onglet.
- Toute règle D&D 5e implémentée doit être vérifiable/sourcée (SRD 5e).
- `npm`/`node_modules`/`tests/` sont **développement uniquement** : `system.json` ne les
  référence jamais, et `.github/workflows/release.yml` ne zippe que
  `system.json README.md LICENSE scripts styles templates lang assets packs world-items` — le
  système reste 100% vanilla JS pour l'utilisateur final.

## Arborescence

```
scripts/
  dnd-custom-ai.js              # point d'entrée (~300 l.) : Hooks.once("init"/"ready")
                                 # (enregistrement DataModels/fiches, préchargement templates,
                                 # game.dndCustomAi, importSystemContent, migrations), 3 loaders
                                 # JSON, et les appels register*Hooks() (dans l'ordre historique :
                                 # security > token-actor > equipment > hit-point > combat-effect
                                 # > chat-message). Les hooks de règles eux-mêmes sont dans
                                 # helpers/*-hooks.js
  helpers/*-hooks.js            # security-hooks (verrous champs non-MJ), token-actor-hooks (cycle
                                 # de vie Actor : lien token, entrée assistant, contenu sous-classe),
                                 # equipment-hooks (contenants, collisions d'emplacement),
                                 # hit-point-hooks (PV/mort/agonie/XP PNJ — le preUpdateActor de
                                 # snapshot PV DOIT rester avant les updateActor qui le lisent),
                                 # combat-effect-hooks (économie d'action, durée de Rage, immunités
                                 # de condition, fin de combat), chat-message-hooks
                                 # (renderChatMessageHTML). Chacun : export registerXxxHooks()
  data/                         # DataModels (schéma de données Actor/Item)
    character-data.js, npc-data.js, vehicle-actor-data.js
    class-data.js, item-data.js, origin-data.js, shared-schema.js
  helpers/
    config.js                   # CONFIG.DND_CUSTOM — classes, sous-classes, compétences,
                                 # caractéristiques, types de créature, tailles, FI, niveaux de
                                 # sous-classe, classes lanceuses de sorts... clés stables, jamais
                                 # de libellé traduit en dur
    rules.js                    # règles SRD pures (modificateur, bonus de maîtrise, CA, PV max,
                                 # capacité de charge, emplacements de sorts 1-9 via SPELL_LEVELS/
                                 # emptySpellSlots/spellSlotsForClass/spellSlotFillUpdates) —
                                 # testées en isolation (tests/unit/)
    spell-slot-choice.js        # fenêtre de choix de palier de surclassement (upcasting) quand
                                 # l'emplacement du niveau exact du sort est épuisé mais qu'un
                                 # palier supérieur reste disponible, cf. #onCastSpell (actor-sheet.js)
    gm-relay.js                  # createGmRelay(socketEvent, perform) — factorise le pattern
                                 # "relais socket vers le MJ actif" (jusqu'ici tripliqué
                                 # indépendamment), utilisé par actor-relay.js/companion.js/
                                 # wild-shape-form.js, chacun son propre SOCKET_EVENT/perform
    actor-relay.js               # requestActorUpdate/registerActorUpdateRelay +
                                 # requestToggleStatusEffect/registerStatusEffectRelay (via
                                 # createGmRelay) — applique un update / bascule un état sur un
                                 # Actor non possédé, utilisé par dnd-custom-ai.js, actor-sheet.js
                                 # (#castSaveSpell/#applySpellCondition) et wild-shape-form.js
    system-json.js               # loadSystemJson(relativePath) — point d'entrée unique pour lire
                                 # un JSON livré avec le système (fetch relatif à la racine du
                                 # système) : dnd-custom-ai.js, content-import.js, Journaux-guide
    rolls.js                    # rollCheck()/rollDamage() — point d'entrée UNIQUE de tous les
                                 # jets de dés (caractéristique, sauvegarde, compétence, attaque,
                                 # dégâts, capacité à formule libre)
    damage-resolution.js        # applyDamageToTargets/applyHealToTargets — résolution des dégâts/
                                 # soins appliqués depuis un bouton de chat (PvP, auto-dégâts,
                                 # résistances/immunités damageTypeMultiplier, concentration),
                                 # extrait de dnd-custom-ai.js (chantier clean architecture)
    chat-message-hooks.js       # registerChatMessageHooks() — tous les hooks renderChatMessageHTML
                                 # du système (boutons Appliquer les dégâts/soin/réduction, Point de
                                 # Chance/Fiélon/Indomptable/Inspiration, style visuel jets/
                                 # critiques), extrait de dnd-custom-ai.js, appelé une seule fois
                                 # depuis là
    class-content.js            # grantClassContent — octroi auto Capacités/Sorts de classe à la
                                 # création et à la montée de niveau
    content-import.js           # game.dndCustomAi.importSystemContent() — import world-items/*
                                 # → compendiums packs/*
    ability-score-improvement.js, level-up-choice.js, subclass-choice.js  # fenêtres de choix à
                                 # la montée de niveau (ASI/Don, sous-classe)
    dialog-content.js           # radioListDialogContent() — HTML « liste radio libellé+desc »
                                 # partagé par les DialogV2 de choix (sous-classe/Don/Forme sauvage)
    death.js                    # agonie/mort, stabilisation
    xp.js                       # attribution XP (entière à chaque participant, jamais divisée)
    origins-journal.js, player-guide-journal.js, gm-guide-journal.js  # génération du contenu
                                 # de référence dans le Journal du monde ; création via
                                 # ensureGmAuthoredJournal (journal.js, garde MJ + anti-écrasement).
                                 # Guide du Joueur + Comparatif des Origines : ownership.default =
                                 # OBSERVER (visibles des joueurs) ; Guide du MJ : NONE. Un Journal
                                 # créé « Aucun » avant ce param est remonté à OBSERVER au chargement.
    handlebars-helpers.js       # helpers Handlebars custom
    tactical-distance.js        # MELEE_REACH_METERS, tokenCenter, distanceBetweenPoints —
                                 # mesure de distance via canvas.grid.measurePath, base commune du
                                 # combat automatisé ci-dessous
    opportunity-attack.js       # hooks preUpdateToken/updateToken (MJ actif seulement) : Attaque
                                 # d'opportunité (PNJ hostile qui s'éloigne d'un PJ) + Échappée de
                                 # la horde en sens inverse (Tactiques défensives)
    sentinel.js                 # checkSentinelReminder, appelé depuis npc-sheet.js#onRollAttack
    action-economy.js           # noteActionEconomyUsage (suivi non-bloquant Action/Action bonus
                                 # du tour, actif uniquement en combat) + consumeActionEconomy
                                 # (garde de réaction bloquante avant l'usage d'une Capacité/d'un Sort)
    feature-charges.js          # consumeFeatureCharge — décrément d'une Capacité à charges limitées
    sheet-items.js              # itemFromTarget(actor, el) — Item porté par une ligne DOM [data-item-id]
    sheet-conditions.js         # conditionsContext(actor) — liste des états SRD + sous-ensemble actif
    damage-affinity.js          # damageAffinityGroups / damageAffinitySummary (cases résist./immun./vuln.)
    hunters-defense.js          # recordAttackOnTargets, hasSteadfastAdvantage,
                                 # hasMultiattackDefenseAdvantage — options de Tactiques
                                 # défensives (Hunter, Rôdeur)
    giant-killer.js             # rappel de réaction Tueur de géants (Hunter, Rôdeur)
    condition-immunity.js       # hook preCreateActiveEffect — immunité Charmé/Effrayé (Rage sans
                                 # esprit, Aura de dévotion), + freedomOfMovement/protectedFromEvilGood
    relentless-hunter.js        # isDisadvantagedByHuntedTarget, HUNTED_BY_ACTOR_ID_FLAG — Traque
                                 # implacable (Paladin, Vengeance) : flag propriétaire SCOPÉ à
                                 # cette seule Capacité, cf. section dédiée ci-dessous
    metamagic.js, sculpt-spells.js  # chooseMetamagicOption (Sort Prudent/Élevé), 
                                 # chooseSculptSpellsTarget (Sculpteur de sorts)
    initiate-magic-choice.js, wild-magic-tables.js  # don Magie d'initié, Surtenance sauvage
    companion.js                # création automatique de l'Actor Compagnon animal (Maître des
                                 # bêtes/Rôdeur) — pas d'IA de combat, juste la création/liaison
    wild-shape-choice.js, wild-shape-form.js  # dialogue de choix de forme + gestion de l'Actor
                                 # de Forme sauvage (Druide), cf. section Combat automatisé
    token-sync.js                # macro MJ de resynchronisation manuelle d'un token désynchronisé
  sheets/
    actor-sheet.js               # DndCustomActorSheet (character) — ~1240 l. : _prepareContext
                                 # scindé en 9 méthodes #prepareXContext (ordre précis, à ne pas
                                 # réordonner) + jets de base (ability/save/skill/arme/mort/test
                                 # opposé), états/exhaustion, objets/outils/lumière, fiches de
                                 # référence, #onSelectSpellLevel. Le reste des gestionnaires
                                 # d'action est éclaté en 5 mixins (chaîne : Spellcasting >
                                 # FeatureActions > RestAndLeveling > WildShape > InventoryDragDrop
                                 # > HandlebarsApplicationMixin > ActorSheetV2), chacun avec son
                                 # static DEFAULT_OPTIONS.actions fusionné par ApplicationV2
    wild-shape-mixin.js          # Combat monté + Forme sauvage
    rest-and-leveling-mixin.js   # repos court/long, montée de niveau, ASI/sous-classe
    feature-actions-mixin.js     # jet/sauvegarde/état/charges/manœuvres de Capacité, toggles
                                 # d'économie d'action, Magie d'initié, compagnon animal
    spellcasting-mixin.js        # incantation (coût/concentration/lumière, délégation par type
                                 # de sort, jet de dégâts différé)
    npc-sheet.js                 # DndCustomNpcSheet
    vehicle-actor-sheet.js       # fiche Véhicule/Monture
    character-creation-wizard.js # assistant de création (ApplicationV2 à part, pas une ActorSheet)
    item-sheets.js                # fiches par type d'Item (weapon/armor/gear/feature/origin/
                                   # class/subclass/tool/spell/language)
    inventory-drag-drop.js        # InventoryDragDropMixin : glisser-déposer inventaire/sorts
                                 # (filtrage par classe, etc.) + _preparePartContext (context.tab
                                 # par PART) partagé par les 3 fiches d'Actor
templates/
  actor/                # character-sheet.hbs (en-tête compact seul) + tab-*.hbs (un par onglet),
                        #   npc-*.hbs, vehicle-sheet.hbs
  actor/abilities/       # class-flavor.hbs : partial unique d'en-tête d'ambiance (icône/titre/
                          # accroche/couleur par classe, cf. context.classFlavorKey), résolu via
                          # {{> (lookup this "classTabPartial")}} dans tab-abilities.hbs
  apps/                  # character-creation-wizard.hbs
  item/                  # un .hbs par type d'Item (9)
  item/parts/            # partials communs aux fiches d'Item : header.hbs (racine + image/nom +
                         #   note MJ, params `placeholder`/`notice`), price.hbs (fieldset Prix),
                         #   description.hbs (zone ProseMirror, params `field`/`label`),
                         #   reaction-trigger.hbs — préchargés au hook init (loadTemplates)
lang/fr.json, lang/en.json   # toutes les clés DND_CUSTOM.* utilisées par JS/templates DOIVENT
                              # exister dans les deux fichiers (vérifié par tests/data)
packs/                  # compendiums Foundry (LevelDB), remplis via importSystemContent()
world-items/*.json      # source de vérité JSON pour le contenu de règles (classes, sous-classes,
                         # capacités, sorts, dons, armes, armures, objets, langues, origines, PNJ)
```

## Système d'Origines (remplace les races)

Tous les personnages sont **Humains** ; les traits culturels/mécaniques varient selon
l'**Origine** géographique choisie — voir `ClaudeFiles/CONCEPTION_FONCTIONNELLE.md` pour le détail
des 6 Origines. Côté code : `scripts/data/origins.json` externalise les données,
`scripts/data/origin-data.js` définit le schéma, l'attribution des bonus/traits à l'Actor se fait
à la création (assistant) et n'est jamais recalculée dynamiquement après coup (les valeurs sont
copiées sur l'Actor).

## Clés stables vs libellés traduits — piège récurrent

**Ne jamais comparer un libellé localisé (`game.i18n.localize(...)`) à un nom d'Item ou une
valeur métier.** Le contenu de référence (classes, sous-classes) stocke des **clés stables**
(`classKey`/`subclassKey`, ex. `"fighter"`/`"champion"`) indépendantes de la langue active du
monde — `grantClassContent`, `#onOpenClassSheet`/`#onOpenSubclassSheet`,
`isSpellAllowedForActor` comparent toujours des clés, jamais des libellés traduits. Un bug de ce
type (`grantClassContent` ne donnait aucune Capacité/Sort de classe hors monde francophone) a déjà
coûté une session complète à diagnostiquer (corrigé le 2026-08-16) — cf. `tests/README.md` section
"Bug connu — CORRIGÉ" pour le détail complet. Depuis le 2026-09-05, `importSystemContent()`
resynchronise aussi les entrées déjà présentes dont le contenu diffère du JSON (cf.
"Resynchronisation du contenu de référence" plus bas) — un simple rappel suffit désormais après
une correction de format, plus besoin de vider les compendiums à la main au préalable.

## Jets de dés — `rollCheck()`/`rollDamage()` (`scripts/helpers/rolls.js`)

Point d'entrée unique de tout jet de d20 (caractéristique, sauvegarde, compétence, attaque) et de
tout jet de dégâts, **sauf l'Initiative** — celle-ci passe par la formule native du Combat
Tracker Foundry (`system.json > "initiative"`), pas par `rollCheck`. Pour un avantage
conditionnel par Actor sur ce jet précis (ex. Instinct sauvage, Barbare 7), la technique retenue
est une substitution de donnée de jet dans la formule elle-même :
`"(@attributes.initiativeDice)d20kh1 + @attributes.initiativeMod"`, où `initiativeDice` (donnée
dérivée, `character-data.js`/`npc-data.js`) vaut 1 ou 2 — `kh1` sur un seul dé est un no-op, donc
la MÊME formule fonctionne pour les deux cas sans logique conditionnelle côté Foundry.

Options principales de `rollCheck`/`rollDamage` :

- `advantage`/`disadvantage` → `2d20kh1`/`2d20kl1`.
- `compareToTargetAc` (jets d'attaque uniquement) : si une cible est sélectionnée
  (`game.user.targets`), compare automatiquement au total de CA et affiche touché/raté dans le
  message. Sans cible : aucune erreur, le jet reste "manuel" (au MJ de juger) — comportement
  volontaire, pas une régression.
- `criticalRules` (jets d'attaque et de sauvegarde uniquement — jamais les tests de
  caractéristique/compétence/outil) : un 1 naturel est toujours un échec critique, un 20 naturel
  toujours une réussite critique, **uniquement si l'Actor est actuellement Combattant d'un combat
  en cours** (`isActorInCombat`). Sur un jet d'attaque avec cible, ça force le résultat touché/raté
  indépendamment de la CA. Le dé actif est lu via
  `roll.dice[0].results.find(r => r.active).result` (fiable avec avantage/désavantage, Foundry
  marque déjà le dé qui compte). Le message de chat n'affiche alors QUE le résultat du d20 seul
  (`Roll.fromTerms([roll.terms[0]])`, sans relancer), jamais les modificateurs, sur demande
  explicite de test (lot 3, point Rapide n°7). Un flag `flags["dnd-custom-ai"].criticalHit`/
  `criticalFumble` est posé sur le message ; le hook `renderChatMessageHTML`
  (`dnd-custom-ai.js`) s'en sert pour ajouter une bordure/halo + icône dédiés sur `.dice-roll`
  (jamais la couleur seule — accessibilité).
- `rollDamage({ critical })` : un coup critique double le **nombre de dés**, jamais le
  modificateur (`Roll#alter(2, 0)`, API native Foundry qui ne touche qu'aux `DiceTerm`).
  `2d6+3` devient `4d6+3`, jamais `(2d6+3)×2`.

Attaque et dégâts restent **deux clics volontairement séparés et non automatiques** — le jet de
dégâts n'est affiché qu'après confirmation du jet d'attaque (bouton contextuel dans le message de
chat), jamais un état stocké séparément à synchroniser.

### Points d'inspiration (PI) — règle maison (2026-08-25)

Distincte de l'Inspiration bardique du SRD (Capacité de Barde, `world-items/features.json` — un
dé donné à un allié). Ressource libre accordée manuellement par le MJ
(`system.attributes.inspirationPoints`, `CharacterData` uniquement, aucun maximum), dépensée pour
relancer intégralement un test de caractéristique **ou** de compétence déjà lancé — jamais une
sauvegarde ni un jet d'attaque (`inspirationEligible`, posé uniquement par `#onRollAbility`/
`#onRollSkill`, `actor-sheet.js`).

Réutilise la famille de flags `luckRoll`/`luckFormula`/`luckActorId` déjà posés inconditionnellement
par `rollCheck` (cf. don Chanceux ci-dessous) plutôt que d'en recréer une nouvelle : seul un flag
`inspirationEligible` + `checkFlavor` (le `flavor` d'origine, avant suffixe Avantage/Désavantage)
s'ajoute quand l'appelant passe `inspirationEligible: true`. Le hook dédié (`dnd-custom-ai.js`,
`renderChatMessageHTML`) ajoute un bouton `.dnd-spend-inspiration-btn` si l'acteur a au moins 1 PI.

Différence volontaire avec Chanceux/Chance du Fiélon/Indomptable (mêmes flags `luckRoll`, mais
gardent le message d'origine et postent une relance à la suite) : ici, `message.delete()` retire
le message d'origine du chat **avant** de poster le nouveau jet — demande explicite de
l'utilisateur ("le jet précédent disparaît"), un seul jet reste jamais visible à la fois. Résultat
du nouveau jet toujours conservé (jamais le meilleur des deux).

## Permissions et sécurité

- **Armes/armures d'inventaire non modifiables par les Joueurs** (contenu de règles, pas de
  personnalisation libre) — seuls Quantité/Équipé restent pilotables depuis l'onglet Inventaire.
- **PvP bloqué** entre personnages joueurs sur l'application de dégâts via le chat, y compris
  l'auto-ciblage (un Joueur ne peut plus s'appliquer de dégâts à lui-même — seul le MJ le peut,
  poison/chute/piège déclenchés à sa discrétion).
- Bouton "Appliquer les dégâts" à usage unique, restreint à l'auteur du jet (ou au MJ).
- `preUpdateActor` (`helpers/security-hooks.js`) bloque toute baisse directe de
  `system.attributes.hp.value` par un non-MJ, SAUF option `dndCustomDamageApply` (posée par
  `applyDamageToTargets`, le vrai bouton "Appliquer les dégâts", et par le correctif
  `dndCustomHpClamp` qui suit une hausse d'Exhaustion). **Piège pour toute future spec E2E** qui
  simule des dégâts déjà subis via un `actor.update()` direct : passer
  `{ dndCustomDamageApply: true }`, sinon la baisse est silencieusement annulée.
- Même hook : `system.attributes.exhaustion` est ignoré pour un non-MJ SAUF option
  `dndCustomExhaustionChange` (posée par `#onRestShort`/`#onRestLong`) — le pas-à-pas ± manuel de
  l'onglet Statistiques est réservé au MJ côté template. **Même piège E2E** : une spec qui force
  l'Épuisement via `actor.update()` en session Joueur doit passer
  `{ dndCustomExhaustionChange: true }`.
- Verrouillage MJ/Joueur des fiches d'Item de compendium : pattern uniforme
  `{{#unless isGM}}disabled{{/unless}}` posé sur CHAQUE champ (pas de verrou global JS), sur
  toutes les fiches `item/*.hbs` **et leurs partials `item/parts/*.hbs`** (qui héritent d'`isGM`
  du contexte de la fiche). Notes dédiées, passées en paramètre `notice` au partial `header.hbs` :
  `DND_CUSTOM.Item.Fields.EquipmentGmOnlyNotice` (objets avec Quantité/Équipé gérés depuis l'onglet
  Inventaire), `CompendiumGmOnlyNotice` (contenu pur), `GmOnlyNotice` (Capacités de classe).
- Champs Classe/Origine non éditables directement sur la fiche (seul l'assistant, ou le MJ en
  édition directe, peut les changer).
- Exception `dndCustomLevelUp` (hook de restriction des champs verrouillés) : ne laisse passer
  QUE `level`, même si `class` est posé dans la même update.
- Items de compendium : Joueur en lecture seule (Observateur), MJ propriétaire — comportement de
  permission standard Foundry, pas un bug (indication visuelle ajoutée : bordure pointillée,
  curseur "interdit").

## Fiche de personnage — en-tête compact (708 × 768)

- `DndCustomActorSheet.DEFAULT_OPTIONS.position = { width: 708, height: 768 }` (adopté le
  2026-09-04, cf. `maquettes/fiche-708x768/`). Reste `resizable`, sans plafond ; plancher via
  `.dnd-custom-ai.sheet.actor.character { min-width: 640px }` (Foundry lit le `computedStyle.minWidth`
  de l'élément racine pour borner le redimensionnement, `ApplicationV2#_onResizeMouseMove`).
- `character-sheet.hbs` ne contient plus que l'en-tête (3 bandes : identité / constantes /
  économie d'action). Les `data-action`, les `name="system.attributes.*"` et les classes ciblées
  par les tests (`.xp-gm-field`, `.xp-bar-fill`, `.active-condition-chip`, `.level-up-btn`,
  `.computed-value`, `input.actor-name`, `[data-action="restShort|restLong|toggleReaction|levelUp"]`)
  sont **inchangés** — c'est une refonte de disposition, pas de comportement.
- **`.sheet-header` est partagé avec la fiche PNJ** (`npc-sheet.hbs` : `.header-fields`,
  `.header-row`, `.hp-field`). La disposition d'origine (en lignes, portrait 84 px) est donc
  conservée telle quelle, et tout le style compact est scopé sous `.sheet-header-compact` (classe
  ajoutée uniquement sur le `<header>` de `character-sheet.hbs`). Ne jamais remettre de style
  compact directement sur `.sheet-header` / `.header-row` / `.hp-field` sans vérifier le rendu PNJ.
- Garde-fous : `tests/dom/templates.test.js` (structure/sélecteurs de l'en-tête) et
  `tests/visual/layout.test.js` (« En-tête compact… tient dans 708 × 768 » : hauteur < 300 px,
  bande de constantes sur une seule ligne).
- Onglet Statistiques : gouttières réduites (`.tab.stats { padding-inline: 0.5rem }`, scopé) et
  cases de caractéristiques resserrées (`.ability-main { flex: 0 1 auto }`,
  `.abilities-column { flex: 0 1 284px }`) pour tenir la double colonne caracs/compétences.

## Infobulles de glossaire (data-tooltip)

- **Source unique** : `scripts/data/glossary.json` — tableau `{ key, term, definition }` (43
  entrées). `key` = slug ASCII stable (`ca`, `pv-temporaires`...), `term` = libellé complet
  affiché sur la page « Glossaire » du Guide du Joueur, `definition` = le texte de l'infobulle.
- **Chargement** : `loadGlossary()` (`dnd-custom-ai.js`, hook `ready`) → `game.dndCustomAi.glossary`,
  une `Map(key -> definition)`.
- **Helper Handlebars** `glossaryTip` (`handlebars-helpers.js`) : `{{glossaryTip 'ca'}}` renvoie la
  définition, utilisée comme valeur d'un attribut `data-tooltip` (jamais `title`). Le slug évite
  d'échapper les apostrophes/parenthèses du `term` dans les templates. Renvoie `""` si absent.
- **`data-tooltip` vs `title`** : `data-tooltip` déclenche l'infobulle stylée de Foundry
  (`TooltipManager`, instantanée) ; `title` déclenche celle du navigateur (moche, lente). **Tous
  les éléments de la fiche personnage (libellés ET boutons/badges d'action) utilisent
  `data-tooltip`** — `title` n'est plus utilisé (revue couche joueur 2026-09-06). **Ne jamais
  mettre les deux sur un même élément** (double infobulle) — test dédié dans `tests/dom/templates.test.js`.
- **Portée** : glossaire sur les *libellés* (en-tête + onglets Statistiques/Capacités/Équipement/
  Inventaire) ; sur les *boutons d'action*, `data-tooltip` porte l'aide au geste (« cliquer :
  jet normal, Maj : avantage… », déclencheur de réaction, description d'objet au survol via
  `htmlSnippet`). Pas sur le texte libre (biographie). `styles/dnd-custom-ai.css` ajoute
  `cursor: help` sur les éléments non cliquables porteurs d'un `data-tooltip`.
- **i18n** : le glossaire est FR uniquement (comme les Journaux Guide Joueur/MJ). Le helper
  reçoit un slug littéral, jamais une clé `DND_CUSTOM.*` — donc invisible au test
  `i18n-coverage.test.js`, et aucune entrée `lang/*.json` requise.
- **Régénération** : la page « Glossaire » du Guide du Joueur n'est créée qu'une fois (si
  absente) ; ajouter une entrée au glossaire ne met pas à jour un monde existant tant que le
  Journal n'est pas supprimé/recréé. Les infobulles de la fiche, elles, sont toujours à jour
  (lues au rendu).
- Les `*Tooltip` de `lang/*.json` qui recopiaient une définition ont été supprimées (10 clés) —
  les infobulles concernées passent par le glossaire. `HPTemp`, `XpBarTooltip`,
  `OpenDescriptionTooltip`, `Roll.Tooltip`/`Roll.DamageTooltip` (indices d'action, pas des
  définitions) restent en `lang/*.json`.

## Style de chat des jets du système (parchemin déchiré)

- **Marqueur** : `sheetRollFlags(extra)` (`helpers/rolls.js`) fusionne `sheetRoll: true` dans les
  flags `dnd-custom-ai` d'un message — appelé sur QUASIMENT tout `Roll#toMessage`/
  `RollTable#toMessage` du système (`rollCheck`/`rollDamage`/`rollHeal` dans rolls.js, tous les
  `.toMessage()` directs de `actor-sheet.js` et `dnd-custom-ai.js`, le tirage de Magie sauvage
  dans `wild-magic-tables.js`). **Toute nouvelle fonction qui poste un jet de dés doit y penser**
  (`flags: sheetRollFlags({...})`) sous peine de retomber au style Foundry par défaut.
- **Hors scope, volontairement** : `actor.rollInitiative()` (API Foundry native, bouton
  "Initiative" de la fiche PNJ) ne passe pas par nos helpers et ne porte donc pas ce style — pas
  un oubli, juste hors de portée d'un flag qu'on ne contrôle pas côté appel natif.
- **Hook** : un `Hooks.on("renderChatMessageHTML", ...)` dédié (dnd-custom-ai.js, avant celui des
  critiques) pose `.dnd-sheet-roll` sur la racine du message si `sheetRoll` est vrai. Jamais
  déduit du `speaker` (un joueur peut taper `/r` avec son personnage sélectionné).
- **CSS** : `.dnd-sheet-roll` dans `dnd-custom-ai.css`, hors du bloc `.dnd-custom-ai` (même
  raison que `.dnd-critical-hit`/`.dnd-critical-fumble` juste après : les cartes de chat vivent
  dans la barre latérale, jamais dans la fiche — couleurs en dur, texture via le même chemin
  relatif que `--dca-texture-parchment`). Bord irrégulier en `clip-path` (pourcentages, donc
  stable à toute hauteur de carte), vraie texture parchemin, libellé en serif, résultat centré en
  grand (pas de soulignement — un trait de cire testé puis retiré, retour de test : ressortait
  comme un trait rouge disgracieux). `!important` sur les propriétés qui doivent gagner sur le
  style de base `.chat-message` du cœur Foundry (spécificité exacte non garantie selon version).
- **Médaillon d'icône de classe** : résolu dans le même hook, depuis `game.actors.get(message
  .speaker?.actor)` (jamais depuis les sites `.toMessage()` eux-mêmes) → `system.class` → 
  `DND_CUSTOM.classFlavorIcon` (même donnée que l'en-tête d'ambiance de classe de l'onglet
  Capacités, `class-flavor.hbs`). Élément `<i class="dnd-class-icon">` injecté en tête de
  `.message-header`, absent pour un PNJ (pas de `system.class`).
- **Accent de couleur par type de jet** (`.dnd-roll-attack`/`-save`/`-damage`/`-heal`, posées par
  le même hook, jamais cumulées avec `.dnd-critical-hit`/`-fumble`) : ne retouchent que le
  fleuron devant le libellé et la couleur du résultat, jamais le fond. Signal résolu à partir des
  flags déjà existants — `damageRoll`/`healRoll` (rollDamage/rollHeal), nouveau `attackRoll` posé
  dans `rollCheck` quand `compareToTargetAc` est vrai (signal déjà fiable, cf. sa docstring),
  `savingThrowRoll` (existant pour les saves du personnage via `#onRollSave`, étendu aux jets de
  sauvegarde imposés à une CIBLE — Capacité/sort — et au jet de concentration). Un test de
  caractéristique/compétence "nu" reste à l'accent par défaut.
- **Coins ornés** : 4 couches `radial-gradient` supplémentaires dans le `background-image` de
  `.dnd-sheet-roll` (avec `background-size`/`-position`/`-repeat` alignés couche par couche) —
  aucun nouvel élément DOM, juste du CSS.
- **Historique de conception** : plusieurs tours d'itération visuelle avec l'utilisateur
  (maquettes successives dans `maquettes/chat-roll-style/`, puis retour sur une maquette externe
  "Stitch" fournie dans `maquettes/chat-roll-style-stitch/` — dont le chrome de chat/badge de DD
  ont été explicitement écartés, hors de portée d'un système ou contraires à un choix de
  conception déjà pris) avant validation de la direction "parchemin déchiré" + accents "sobres".

## Pièges CSS/UI récurrents

- **`<prose-mirror>` vide = zone éditable à 0px de haut** : `min-height` posé sur `<prose-mirror>`
  ne se propage jamais à sa zone éditable interne (`.editor-content.ProseMirror`) — CSS ne fait
  jamais correspondre un `height: 100%` d'enfant à un `min-height` de parent. Un champ vide
  (aucun paragraphe, donc aucune hauteur intrinsèque) devient invisible ET non cliquable. Corrigé
  en donnant à `<prose-mirror>` un layout flex (`display: flex; flex-direction: column`) +
  `flex: 1` sur sa zone éditable. **Sauvegarder un champ ProseMirror via son bouton
  `data-action="save"` dédié, jamais un simple `blur`.**
- **`ul li:last-child { margin-bottom: 0; }` (règle core Foundry, `foundry2.css`)** : réduit la
  marge du dernier élément d'une liste, ce qui donne visuellement l'impression que ce dernier
  élément est "plus grand"/différent des autres (pas une différence de taille de police réelle).
  Piège rencontré sur les puces de langue et à surveiller sur toute liste `<ul>`/`<ol>` du système
  (ex. grille de compétences à 2 colonnes) — neutraliser `margin-bottom` sur le sélecteur
  spécifique du système plutôt que de dépendre de `:last-child`.

## Wizard de création — course avec la fiche native (CORRIGÉ le 2026-09-05)

**Root cause réelle**, confirmée par une repro exacte de l'utilisateur (bouton natif "Créer un
Acteur" de la sidebar, type "character", clic sur "Créer Acteur") puis un traçage en direct sur
l'instance Docker de test (`Hooks.callAll`/`render` instrumentés en conditions réelles) : la
boîte de dialogue "Créer un Acteur" de Foundry v13+ (reconstruite en `DialogV2`, PAS l'ancien
`Document#createDialog()`) appelle **`doc.sheet.render(true)` directement dans le callback de
son propre bouton "ok"** (`DialogV2._onSubmit` → callback `ok`), un chemin totalement
indépendant de `options.renderSheet` — ce dernier ne concerne qu'un mécanisme antérieur devenu
mort en pratique pour ce bouton précis. Ce rendu survient SYNCHRONEMENT, dans le même tick que le
hook `createActor` (qui construit l'assistant), mais **avant** que l'assistant n'ait eu le temps
d'apparaître dans `foundry.applications.instances` — son propre pipeline de rendu (chargement de
template, etc.) prend, mesuré en conditions réelles, plusieurs centaines de ms. Les 4 tentatives
précédentes (dont le correctif du 2026-08-16, `DndCustomActorSheet#render()` scannant
`foundry.applications.instances`) supposaient toutes, à tort, que cette inscription était
synchrone — la fiche gagnait donc systématiquement la course.

**Pourquoi l'E2E ne l'a jamais attrapé avant** (T-WIZ-010/020/021, `wizard.cy.js`) : ces 3
scénarios simulent la création via `Actor.create(data, {renderSheet: true})` appelé directement
depuis `cy.window()` — une approximation plausible de l'ancien mécanisme `Document#createDialog()`,
mais qui n'exerce PAS le vrai chemin `DialogV2` ci-dessus. Deux nouveaux tests (**T-WIZ-022**
session Joueur, **T-WIZ-023** session MJ) pilotent désormais la VRAIE boîte de dialogue (clic sur
`#actors button.create-entry[data-action="createEntry"]`, remplissage du formulaire réel,
soumission) — seule façon de couvrir ce chemin précis. Vérifié manuellement : ces deux tests
échouaient avant le correctif ci-dessous, passent après.

**Correctif** : `openWizardActorIds` (`character-creation-wizard.js`) — un `Set` d'`Actor.id`
rempli de façon strictement SYNCHRONE au constructeur de `CharacterCreationWizard`, avant tout
appel à `.render()`, et vidé à sa fermeture (`_onClose`). `DndCustomActorSheet#render()`
(actor-sheet.js) vérifie ce `Set` au lieu de scanner `foundry.applications.instances` — ne dépend
plus d'aucune hypothèse de timing sur le pipeline de rendu de Foundry.

**Sujet connexe repéré pendant l'investigation** (corrigé dans la foulée) : le titre de fenêtre
de la fiche personnage s'affichait `"TYPES.Actor.character: <nom>"` (clé i18n non résolue) au
lieu de `"Character: <nom>"`/`"Personnage : <nom>"` — `lang/en.json`/`lang/fr.json` > `TYPES.Actor`
ne déclarait que `vehicle`/`mount`, pas `character`/`npc`/`wildShapeForm` (ni `TYPES.Item.subclass`
côté Item). Foundry résout ces clés automatiquement pour le titre de fenêtre ET le `<select>` de
type de la boîte de dialogue "Créer un Acteur" — les 5 types Actor et 10 types Item du système
(`system.json > documentTypes`) ont maintenant tous un libellé dans les deux langues.

## Resynchronisation du contenu de référence — `importSystemContent()` (ajouté le 2026-09-05)

**Avant ce chantier**, `importSystemContent()` (`scripts/helpers/content-import.js`) ne faisait
qu'ajouter les entrées **absentes par nom** (compendiums *et* Items du monde de type
équipement/arme/armure/outil) — une entrée déjà présente restait figée dans son état d'import
initial pour toujours, y compris quand `world-items/*.json` évoluait ensuite. Décision explicite
de l'utilisateur pour la politique de conflit : **écraser depuis le JSON, sans détection de
conflit** — le JSON reste l'unique source de vérité pour ce contenu de règles ; toute modification
manuelle d'un Item/document de compendium de référence est perdue au prochain chargement du monde
si le JSON source a changé depuis. Attendu, pas un bug — à ne jamais "corriger" en sens inverse.

**Mécanisme** : pour chaque catégorie (boucle `WORLD_ITEM_FILES` sur les Items du monde, boucle
`COMPENDIUM_FILES` sur les 8 compendiums), après l'import des entrées absentes par nom (logique
existante, inchangée), une seconde passe construit une Map nom→document des entrées déjà
présentes puis calcule un patch via `diffPatch(entry, existing)` pour chacune :

```js
function diffPatch(entry, existing) {
  const patch = {};
  if (entry.img && entry.img !== existing.img) patch.img = entry.img;
  if (entry.system) {
    const currentSystem = existing.toObject().system ?? {};
    const mergedSystem = foundry.utils.mergeObject(currentSystem, entry.system, { inplace: false });
    if (!foundry.utils.objectsEqual(mergedSystem, currentSystem)) patch.system = entry.system;
  }
  if (!Object.keys(patch).length) return null;
  return { _id: existing.id ?? existing._id, ...patch };
}
```

Les patches non nuls sont appliqués en un seul `updateDocuments()` par catégorie (pas un `update()`
par entrée) — `Item.updateDocuments()` pour les Items du monde,
`compendium.documentClass.updateDocuments(staleUpdates, { pack: packId })` pour un compendium.

**Piège découvert en écrivant `diffPatch`** (à ne jamais réintroduire — cf. garde-fou T-SYNC-001
ci-dessous) : une première version comparait `entry.system` (JSON brut, forcément partiel — ne
contient que les champs que l'auteur du JSON a explicitement renseignés) directement à
`existing.system` (DataModel Foundry déjà préparé : valeurs par défaut du schéma + champs dérivés
calculés) via `foundry.utils.objectsEqual`. Résultat : **quasiment chaque entrée de tout le
système** remontait comme "modifiée", JSON identique ou pas, à chaque appel — les valeurs par
défaut/dérivées absentes du JSON brut créaient un écart systématique et illusoire. Corrigé en
comparant plutôt à `existing.toObject().system` (données brutes réellement stockées, sans
défauts/dérivés) et en fusionnant `entry.system` PAR-DESSUS cet état brut avant de comparer le
résultat de la fusion à l'état brut de départ — ne détecte plus que les VRAIS écarts.

**Bug de données latent découvert comme effet de bord** de la vérification en direct de ce
mécanisme : `world-items/weapons.json` stockait pour "Sarbacane" (`range.normal: 7.5`) et "Filet"
(`range: {normal: 1.5, long: 4.5}`) des valeurs SRD fractionnaires cohérentes avec la grille à
1,5 m — mais `scripts/data/item-data.js` > `rangeSchema()` déclare ces champs en
`NumberField({ integer: true })`, donc Foundry les arrondissait silencieusement en écriture
(`7.5→8`, `1.5→2`, `4.5→5`) depuis toujours. Sans correction, le nouveau mécanisme de
resynchronisation aurait re-détecté et réécrit ces 2 entrées EN BOUCLE à chaque appel (le JSON
"non arrondi" ne correspondrait jamais à ce que Foundry accepte réellement d'écrire). Corrigé côté
JSON (valeurs alignées sur leur équivalent entier, cf. les 13 autres armes qui utilisent déjà
toutes des mètres entiers — convention système établie), pas côté schéma.

**Limite connue, documentée et acceptée** : le rapprochement se fait **par nom**. Un renommage
dans le JSON source (ex. "Rage" → "Fureur") crée une NOUVELLE entrée au prochain import plutôt que
de renommer l'existante, qui reste alors orpheline dans le compendium (à nettoyer à la main le cas
échéant) — pas de détection de renommage.

**Couverture E2E** (`cypress/e2e/content-resync.cy.js`, session MJ uniquement — `importSystemContent`
retourne immédiatement pour un non-MJ) :
- **T-SYNC-001** — garde-fou direct contre le piège de faux positifs ci-dessus : sur tout le
  contenu (8 compendiums), aucune entrée déjà à jour ne doit ressortir comme "à resynchroniser".
- **T-SYNC-002** — modifie à la main la description de "Rage" (compendium `capacites`), rappelle
  `importSystemContent()`, vérifie qu'elle est bien réécrasée par le JSON ET qu'un champ NON
  modifié (`uses.max`) reste intact (patch partiel, pas table rase de l'entrée entière).
- **T-SYNC-003** — même vérification côté Item du monde (poids de "Dague").
- **Piège Cypress rencontré en écrivant ces tests** : passer un littéral objet construit dans le
  realm du test runner (`{ "system.weight": 999 }`) à `Document#update()` fait échouer la
  validation de schéma Foundry (`"Item must be constructed with a DataModel or Object"`, levée
  côté `cleanData`) — un objet doit être reconstruit dans le realm de la fenêtre AUT via
  `win.JSON.parse(win.JSON.stringify(...))` avant d'être passé à `.update()`/`.create()`,
  convention déjà en usage ailleurs dans ce dépôt (`npc-sheet.cy.js`, `combat-tracker.cy.js`...).

## Combat automatisé — positionnement et économie d'action

Toujours **pas de grille tactique/pathfinding reconstruit** ni d'interruption synchrone du jet
pour proposer une réaction — cadrage explicite du 2026-08-23, cf.
`ClaudeFiles/CONCEPTION_FONCTIONNELLE.md` pour le détail fonctionnel. Ce qui existe côté code :

- **Positionnement** : `helpers/tactical-distance.js` (`tokenCenter`, `distanceBetweenPoints`,
  `MELEE_REACH_METERS`) s'appuie sur l'API native de Foundry (`canvas.grid.measurePath`), jamais
  une grille reconstruite. Dans `Hooks.on("updateToken", ...)`, `tokenDoc.x`/`y` NE reflètent PAS
  encore la nouvelle position au moment du hook (cette version de Foundry) — utiliser
  `changes.x`/`changes.y` (avec repli sur `tokenDoc.x`/`y` si non modifié).
- **Attaque d'opportunité** (`helpers/opportunity-attack.js`) : un PNJ HOSTILE qui quitte la
  portée de mêlée d'un Combattant PJ avec réaction disponible déclenche un message de chat de
  rappel (jamais de jet automatique). Le même hook, en sens inverse, gère **Échappée de la
  horde** (Tactiques défensives, Rôdeur) : un PJ avec ce choix qui s'éloigne d'un PNJ hostile pose
  un flag éphémère `pendingOpportunityDisadvantage` sur l'Actor de ce PNJ, consommé par son
  PROCHAIN `#onRollAttack` (npc-sheet.js) — approximation assumée, rien ne garantit que ce
  prochain jet soit bien l'attaque d'opportunité elle-même.
- **Sentinelle** (`helpers/sentinel.js`) : rappel si un PNJ hostile attaque une cible autre qu'un
  Combattant PJ possédant Sentinelle avec réaction disponible à 1,50 m.
- **Combat monté** : `character-data.js#combat.mountedActorId` référence un Actor de type
  "mount" ; avantage automatique aux jets d'attaque si la cible ciblée est plus petite que la
  monture.
- **Suivi de l'Action/Action bonus du tour** (`helpers/action-economy.js`,
  `noteActionEconomyUsage`) : suivi **non-bloquant** (rappel de chat seulement, jamais de jet
  refusé), actif **uniquement en combat** (`isActorInActiveCombat`, même garde que
  `criticalRules`). Champs `character-data.js#combat.actionAvailable/bonusActionAvailable`,
  régénérés comme `reactionAvailable` (hooks `updateCombat`/`deleteCombat`).
- **Tactiques défensives** (`helpers/hunters-defense.js`) : `system.combat.attackedByThisRound`
  (rempli par `recordAttackOnTargets` à chaque jet d'attaque arme/sort, remis à zéro en début de
  tour propre) permet l'avantage de Volonté de fer/Défense contre les attaques multiples aux
  sauvegardes forcées.
- **Forme sauvage** (Druide) : nouveau type d'Actor **"wildShapeForm"** (même `NpcData`/
  `DndCustomNpcSheet` que "mount") dont la réserve de PV sert de 2e réserve pendant la
  transformation. `character-data.js#combat.wildShapeActorId`, retour automatique à la forme
  normale à 0 PV (hook `updateActor`, `dnd-custom-ai.js`).

**Pièges transverses rencontrés** :
- `game.combat` (le combat "affiché") n'est pas fiablement le Combat le plus récent quand
  plusieurs documents Combat coexistent sur la même scène — toute spec E2E doit supprimer les
  Combat de test précédents avant d'en créer un nouveau.
- Le token d'un PNJ **non lié** (`actorLink: false`, réglage par défaut) a un Actor
  **synthétique** propre au token (`token.actor`/`combatant.actor`) — un état/flag posé dessus
  n'apparaît **jamais** sur `game.actors.get(id)` (l'Actor "prototype" du monde). Toujours lire
  l'état d'un PNJ ciblé via `canvas.tokens.get(tokenId).actor`, jamais `game.actors.get(id)`.
- `Combatant#tokenId` reste `null` si non passé explicitement à
  `createEmbeddedDocuments("Combatant", ...)` (Foundry ne le résout pas depuis `actorId`) — le
  getter `combatant.token` renvoie alors silencieusement `undefined`.
- Un nouveau Token hérite d'une disposition **HOSTILE** par défaut, quel que soit le type
  d'Actor — à corriger explicitement (`prototypeToken.disposition`) pour tout scénario qui
  déplace le token d'un PJ.
- **`Actor#update`/`setFlag` FUSIONNE les objets imbriqués, ne les remplace JAMAIS** (chantier
  "PNJ multiattack", 2026-08-25) : `setFlag(scope, key, {sousObjetPlusPetit})` pour "retirer" une
  clé d'un flag objet ne fonctionne PAS — l'ancienne clé absente du nouvel objet survit à la
  fusion côté serveur. Pour retirer UNE clé précise d'un objet imbriqué (flags compris), utiliser
  la syntaxe de suppression Foundry : `actor.update({"flags.scope.key.-=sousCle": null})`.
- **`ArrayField#initial` avec un tableau contenant un objet non-vide (`[{}]`) peut faire échouer
  silencieusement `Actor.create`** quand le champ est absent des données de création (aucune
  erreur serveur observée) — `initial: []` (tableau vide) s'est révélé fiable. Cf. `NpcData#attacks`
  (npc-data.js) : un PNJ neuf démarre donc sans aucun élément, jamais avec un élément par défaut
  pré-rempli.

## Résistances/immunités/vulnérabilités aux dégâts

Chantier "types de dégâts" (2026-08-24/25, 4 phases, terminé) : `damageAffinitySchema()`
(`shared-schema.js`, 3 `SetField` — `damageResistances`/`damageImmunities`/`damageVulnerabilities`,
les 13 types SRD) est un sous-schéma **partagé et réutilisé tel quel à 3 endroits** :
`CharacterData#combat`, `NpcData` (racine), et `ArmorData` (Phase 4, item-data.js). Résolution
unique et centralisée : `damageTypeMultiplier(actor, damageType, { isSpellDamage,
isMagicalSource })` dans `helpers/damage-resolution.js` — combine, dans l'ordre, l'immunité (prioritaire sur
tout), les résistances déjà câblées en dur par état/Capacité (Rage, Résilience draconique, Affinité
de la tempête, Voile des anciens), le champ générique réglable par le MJ (cases à cocher sur la
fiche Personnage/PNJ), et `hasArmorDamageAffinity` (résistance/immunité/vulnérabilité **propre** à
une armure ÉQUIPÉE, indépendante du champ générique). Résistance et vulnérabilité sur le MÊME type
s'annulent (dégâts normaux) ; sinon la meilleure protection l'emporte, jamais de cumul.

`isMagicalSource`/`genericBypassed` : nuance SRD "résistance aux attaques non magiques" —
**UNIQUEMENT** pour les 3 types physiques (`PHYSICAL_DAMAGE_TYPES`) ET **UNIQUEMENT** le champ
générique (`WeaponData#magic`/attaque PNJ `magic` contournent la case MJ). Les résistances câblées
en dur (Rage...) et la résistance d'armure n'ont **jamais** cette nuance — une armure qui protège
du feu protège du feu quelle que soit la source, comme une résistance de créature figée par le
SRD. `WeaponData#secondaryDamage`/`NpcData#attack.secondaryDamage` (Phase 3) : second type de
dégâts bonus, résolu indépendamment du premier (2 messages de chat distincts pour 1 clic) —
utilisé pour une arme/attaque à dégâts combinés (ex. épée de feu = tranchant + feu).

## Compendium "Adversaires" (bestiaire, Actor) — 2026-08-25

Demande explicite de l'utilisateur ("crée des fiches d'ennemis humains et de bêtes sauvages
réelles") : `world-items/npcs.json` (15 Actors `npc` — 7 humanoïdes FI 1/8 à 3, 8 bêtes FI 0 à 1,
volontairement AUCUNE créature légendaire/mythique) importé dans un NOUVEAU compendium **Actor**
`packs/adversaires` (`system.json` > `packs`, `ownership.PLAYER: "NONE"` — seul compendium de ce
système invisible aux joueurs, un bestiaire n'a pas vocation à être consulté à l'avance).

**Généralisation de `content-import.js`** : `COMPENDIUM_FILES` importait jusqu'ici uniquement des
compendiums **Item** (`Item.createDocuments` en dur) — remplacé par
`compendium.documentClass.createDocuments(missing, { pack: packId })`, résolu dynamiquement selon
le type réel du pack (Item ou Actor), pour que ce même fichier serve aussi bien les compendiums
existants que `packs/adversaires`.

**Bug de course rencontré et corrigé** (retour de test réel, pas seulement théorique) :
`existingNames = new Set(compendium.index.map(...))` lisait le getter `compendium.index` BRUT
(non awaité) — pour un pack dont l'index n'a pas encore été chargé par ce client à ce point précis
du hook `ready` (reproduit de façon fiable sur `adversaires`, tout juste ajouté à `system.json` >
`packs`, jamais encore "connu" de ce monde), `.index` renvoie une Collection VIDE plutôt que le
contenu réel — `existingNames` restait donc vide à CHAQUE session, et `missing` valait toujours la
liste complète : les 15 PNJ étaient dupliqués à chaque rechargement du monde. Corrigé en
remplaçant par `await compendium.getIndex()` (force le chargement avant de lire), appliqué à
TOUS les fichiers de `COMPENDIUM_FILES` par cohérence, pas seulement `npcs.json` — inoffensif pour
un pack déjà indexé (retourne le cache existant sans requête réseau superflue). Piège symétrique
côté test E2E : `Hooks.once("ready", ...)` n'est jamais attendu par Foundry (fire-and-forget), et
`cy.loginAsGM()` fait un VRAI rechargement de page à chaque appel — un test qui accède au
compendium juste après doit attendre la fin de l'import automatique via une assertion
**retryable** (`cy.window().should(...)`, PAS un `.then()` qui n'évalue qu'une fois), jamais
rappeler `importSystemContent()` une seconde fois manuellement pour "s'assurer" que c'est fait :
ça crée une VRAIE course avec l'appel automatique déjà en cours et double les PNJ.

**Contenu emprunté au SRD 5e** (Bandit, Garde, Chef de brigands, Vétéran, Loup, Ours brun...),
adapté au schéma simplifié `NpcData#attacks` (bonus direct + `damage.bonus` déjà net du
modificateur de caractéristique automatique) plutôt que recopié tel quel. Chaque PNJ embarque son
propre butin (`items`, weapon/armor/gear/tool réutilisant les données de `world-items/weapons.json`
etc. quand un objet existant correspond) — visible dans l'onglet "Butin" de sa fiche une fois
placé sur une scène. Espion/Chef de brigands/Ours brun illustrent le profil d'attaque multiple
(2 attaques distinctes) ; Serpent venimeux illustre `secondaryDamage` (poison en plus du
perforant). Icônes : `icons/svg/mystery-man.svg` pour les 7 humanoïdes (portrait Foundry par
défaut, aucun art dédié disponible), `icons/creatures/*` (bibliothèque core Foundry, déjà utilisée
par `world-items/weapons.json` etc.) pour les bêtes — 2 approximations faute de mieux (Crocodile,
Défenses de sanglier), cf. `assets/icons/MISSING.md`.

**Legacy retiré** : ce système avait déjà un embryon de bestiaire, `world-actors/adversaries.json`
(16 entrées, v0.9.0, 2026-08-09, session autonome) — import MANUEL par macro (jamais branché sur
`content-import.js`/le hook `ready`), stocké en Actors du monde plutôt qu'en compendium, et
surtout **sans aucune attaque automatisée** (tout en texte libre dans `specialAbilities`, ni
`attack` ni `attacks` — antérieur à cette partie du schéma `NpcData`). Entièrement supersédé par
`packs/adversaires` (même esprit — humains + bêtes réelles, aucune créature fantastique — mais
attaques réellement cliquables + butin structuré + intégration au pipeline d'import standard) :
dossier `world-actors/` supprimé plutôt que laissé à côté comme second mécanisme concurrent et
non maintenu.

## Test opposé (Agripper/Bousculer) — `opposedCheckType`

Premier mécanisme de ce système où les DEUX camps lancent un d20, comparés entre eux (jusqu'ici
tout compare toujours un jet à un DD/une CA fixe) — chantier "mécaniques jamais modélisées"
(2026-08-25, cadré avec l'utilisateur). `FeatureData#opposedCheckType` (`"grapple"`/`"shove"`),
2 Capacités universelles (`world-items/features.json`, même convention qu'Attaque d'opportunité).
`#onRollOpposedCheck` (actor-sheet.js) : jet d'Athlétisme de l'attaquant contre le MEILLEUR des
jets d'Athlétisme/Acrobaties de la cible (`opposedCheckModifier`, `rules.js` — fonction pure,
branche Personnage/PNJ via la même détection que `targetSaveModifier` : pas de `.total` sur
`abilities` = PNJ, bonus direct). Égalité = statu quo (comparaison strictement supérieure). Bousculer
"repoussé" : jamais de déplacement de token (aucun dans tout le système, cf. section "Combat
automatisé" ci-dessus) — simple mention dans le message, choix fait via `DialogV2.prompt` (même
UX que `#onUseOpenHandTechnique`) AVANT le jet. **Piège de test** : `cy.forceD20` ne fixe qu'UN
seul jet (se restaure après usage) — inutilisable pour un mécanisme qui en fait 2 dans le même
clic ; la spec rige plutôt les MODIFICATEURS (écart > 19) pour un résultat garanti quel que soit
le d20 réel des deux côtés, même technique que `combat-criticals.cy.js` (CA 999/1).

## États homebrew, `grantsCondition` et propriétaire scopé d'un état

Les états homebrew de ce système (`raging`/`blessed`/`guided`/`hunted`/`ancientsVeil`...,
`DND_CUSTOM.conditions`, config.js) sont de **simples bascules** (`Actor#toggleStatusEffect`,
natif Foundry) : aucune notion de durée ni de **propriétaire** n'est tracée nulle part par défaut
— une automatisation lit l'état lui-même, jamais la Capacité qui l'a posé (même philosophie que
Rage : le bonus/la résistance dépend de `actor.statuses.has("raging")`, pas de la possession de la
Capacité "Rage").

- **`FeatureData#grantsCondition`/`SpellData#grantsCondition`** (item-data.js, sibling l'un de
  l'autre) : pose un état sur CHAQUE cible actuellement ciblée SANS jet associé (contrairement à
  `appliesCondition`/`save.appliesCondition`, qui dépendent d'un jet de sauvegarde). Câblé côté
  Sort dans `#onCastSpell` (Invisibilité...), côté Capacité dans `#onGrantFeatureCondition`
  (Traque implacable) — ce dernier gère aussi `costsResource` (chargeHolder, même mécanisme que
  `#onRollFeatureSave`).
- **Propriétaire scopé à une seule Capacité (technique réutilisable)** : quand une automatisation a
  besoin de savoir QUI a posé un état (ex. Traque implacable — désavantage pour "quiconque n'est
  pas le Paladin"), la solution retenue n'est **jamais** de généraliser un système de propriétaire
  à `toggleStatusEffect` — un flag Foundry standard (`Actor#setFlag`/`getFlag`, namespace
  `dnd-custom-ai`) est posé sur la CIBLE, scopé à cette seule Capacité, via une spécialisation par
  NOM à l'intérieur d'un handler par ailleurs générique (même technique déjà utilisée pour
  Destruction des morts-vivants dans `#onRollFeatureSave`). Cf. `helpers/relentless-hunter.js`
  (`HUNTED_BY_ACTOR_ID_FLAG`, `isDisadvantagedByHuntedTarget`, branché sur les 3 jets d'attaque —
  arme/sort PJ dans actor-sheet.js, attaque PNJ dans npc-sheet.js). Un état posé À LA MAIN (onglet
  États, sans passer par le bouton dédié) ne porte jamais ce flag : aucun désavantage automatique
  dans ce cas — comportement dégradé assumé plutôt que de deviner un propriétaire.
- **Cible non possédée par le lanceur (Joueur)** : `#castSaveSpell`/`#applySpellCondition`
  (actor-sheet.js) posent `pendingSpellSaveOutcome` et basculent la condition sur des PNJ que le
  Joueur ne possède pas — donc jamais `targetActor.setFlag(...)`/`toggleStatusEffect(...)` en
  direct (lève "User lacks permission to update ActorDelta..."), mais via `requestActorUpdate` /
  `requestToggleStatusEffect` (helpers/actor-relay.js) qui relaient au MJ actif, comme
  `applyDamageToTargets`.

## Tests

Voir `tests/README.md` (suite `unit`/`data`/`dom`/`visual`, commande `npm test`, ~890 tests) et sa
section "Tests au réel" pour la couche Docker + Cypress + Quench (E2E contre un vrai client
Foundry + intégration Document/DataModel, `cypress/e2e/*.cy.js`). `tests/
E2E_TEST_PLAN.md` est le plan de scénarios source des 17 premières sections ; tout chantier
ultérieur (combat automatisé, sous-classes, Métamagie...) ajoute sa propre spec Cypress ciblée
sans repasser par ce plan initial. Point de vigilance permanent : **toujours comparer
`game.system.version` à `system.json` local avant de lancer des tests d'interface**, sans quoi un
échec peut juste être un monde de test resté sur une ancienne version du système.

## Versionnage et publication

- Le champ `version` de `system.json` est la source de vérité — c'est lui que lit le workflow de
  release, pas une saisie manuelle. **Incrémenter en fin de session de travail** (SemVer : patch
  pour un correctif, minor pour une fonctionnalité, major réservé à une rupture — rare avant le
  `1.0.0`), en cohérence avec la section "Non publié" du `CHANGELOG.md`.
- Publication : onglet GitHub Actions du dépôt → workflow **Release Foundry System**
  (workflow_dispatch, aucune saisie requise). Il lit `version` dans `system.json`, met à jour
  `download`, commit, crée le tag `vX.Y.Z`, construit `system.zip` et publie une Release GitHub.
  Le `manifest` de `system.json` reste stable — Foundry s'en sert pour détecter les mises à jour.
- **Ne jamais `git push`** — commit local uniquement, le push reste à l'utilisateur.
