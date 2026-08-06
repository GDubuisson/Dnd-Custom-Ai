# CLAUDE.md

Ce projet est documenté en détail dans `PROJECT.md` dans le dossier 'ClaudeFiles/'.
**Lis systématiquement ce fichier avant toute intervention** : il définit le scope,
les bornes techniques, le mapping des Origines, et les conventions de code du projet.

## Rappels critiques
- Respecter absolument l'API Foundry VTT v14 (https://foundryvtt.com/api/)
- Pas de système de build : JavaScript vanilla uniquement
- Toute donnée de jeu (origines, classes, compétences) externalisée en JSON, jamais en dur dans le JS