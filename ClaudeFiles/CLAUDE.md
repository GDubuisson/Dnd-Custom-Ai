# CLAUDE.md

Ce projet est documenté en détail dans `ClaudeFiles/CONCEPTION_TECHNIQUE.md` (architecture,
stack, conventions de code, pièges connus) et `ClaudeFiles/CONCEPTION_FONCTIONNELLE.md` (scope,
mapping des Origines, spécification de la feuille de personnage, contenu de classes).
**Lire systématiquement ces deux fichiers avant toute intervention.** Les anomalies connues et
non encore corrigées sont recensées dans `ClaudeFiles/ANOMALIES_ACTIVES.md` — à consulter avant
de traiter un nouveau retour testeur (peut déjà être un point connu).

## Rappels critiques
- Respecter absolument l'API Foundry VTT v14 (https://foundryvtt.com/api/)
- Pas de système de build : JavaScript vanilla uniquement
- Toute donnée de jeu (origines, classes, compétences) externalisée en JSON, jamais en dur dans le JS