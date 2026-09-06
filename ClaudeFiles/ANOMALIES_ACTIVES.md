# Anomalies actives — dnd-custom-ai

Liste vivante des chantiers **restants à traiter** (bugs ou améliorations) uniquement — tout point
corrigé/traité est retiré d'ici dès validation (l'historique complet reste dans `git log` et, pour
le contenu devenu permanent, dans `ClaudeFiles/CONCEPTION_TECHNIQUE.md`/`CONCEPTION_FONCTIONNELLE.md`).
Mise à jour le 2026-09-05 : la dette technique "compendiums qui ne se resynchronisent jamais par
nom" est CORRIGÉE — `importSystemContent` détecte désormais aussi le contenu déjà présent mais
modifié et l'écrase depuis le JSON source, cf. `ClaudeFiles/CONCEPTION_TECHNIQUE.md` >
"Resynchronisation du contenu de référence" pour le détail technique complet. Mise à jour le
2026-09-05 : le bug "fiche visible pendant l'assistant de création" (5e
signalement, actif depuis le 2026-08-19) est CORRIGÉ — root cause enfin identifiée grâce à une
repro exacte de l'utilisateur, cf. `ClaudeFiles/CONCEPTION_TECHNIQUE.md` > "Wizard de création"
pour le détail technique complet. Mise à jour du 2026-08-23 : ce fichier avait déjà été purgé de
tout l'historique de chantiers antérieurs désormais terminés (revue des 18 restrictions de
conception du 2026-08-21/22, 36 sous-classes, combat automatisé avancé, Tactiques défensives...).
Mise à jour le 2026-09-05 : les 7 échecs de `tab-abilities.cy.js` (onglet Capacités/Sorts) sont
CORRIGÉS — c'était un test obsolète depuis l'ajout des onglets par palier de sort (commit
`7a1719d`, 2026-08-27), pas un bug applicatif, cf. commit qui suit pour le détail complet. Mise à
jour le 2026-09-05 : le bug MOONWILD (PV temporaires de Forme sauvage de combat) est CORRIGÉ —
lui aussi un test obsolète (personnage de fixture resté niveau 1 au lieu de 2, cible un Actor
créé à la main au lieu du vrai résultat du dialogue de choix de forme), pas un bug applicatif,
cf. commit qui suit. Mise à jour le 2026-09-06 : le bug de permission "Sculpteur de sorts / sort à
sauvegarde sur une cible non possédée" (côté Joueur) est CORRIGÉ — `#castSaveSpell` et
`#applySpellCondition` passent désormais par `requestActorUpdate`/`requestToggleStatusEffect`
(helpers/actor-relay.js, nouveau relais d'état), comme le reste du système ; cf.
`ClaudeFiles/CONCEPTION_TECHNIQUE.md` > "États homebrew..." et le commit qui suit. Corrigés
dans la foulée : 2 tests obsolètes de `deferred-rider-spells.cy.js` (« Malédiction du sorcier »,
« Porte dimensionnelle ») — même piège « onglets de sort » que `tab-abilities.cy.js`, pas un bug
applicatif.

Pour le contexte fonctionnel/technique, voir `ClaudeFiles/CONCEPTION_FONCTIONNELLE.md` et
`ClaudeFiles/CONCEPTION_TECHNIQUE.md`.

## Dette technique connue

- **Licence non confirmée** pour une partie des icônes tierces (~166 fichiers/217, wiki
  Baldur's Gate 3, pack "Saethos Shared Icons", sprites génériques, cf.
  `assets/icons/MISSING.md`) — DÉCISION PRISE le 2026-09-05 : pas de remplacement icône par
  icône ; à la fin du développement, faire la dernière release GitHub publique puis passer le
  dépôt en privé. Reste ouvert uniquement en tant que rappel de cette dernière étape à faire.
