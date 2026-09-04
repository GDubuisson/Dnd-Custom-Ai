# Maquette — fiche personnage dans 708 × 768 px (côté joueur)

## Fichiers
- `maquette-fiche-708x768.html` — maquette **interactive** (onglets cliquables, bascule
  densité Confortable / Compacte, pilules d'économie d'action). À ouvrir dans un navigateur.
- `apercu-*.png` — captures d'un onglet chacune, cadre = exactement 708 × 768
  (barre de titre Foundry comprise).
- `apercu-confortable-stats.png` — variante « Confortable » de l'onglet Caractéristiques.
- `_shoot.mjs` — script Playwright qui régénère les PNG.

## Contrainte
Fenêtre plafonnée à **708 de large** (aujourd'hui `min-width: 640`, `position.width: 720`)
et **768 de haut**. Objectif : chaque onglet reste consultable en entier, l'un après l'autre,
sans jamais élargir la fenêtre.

## Ce qui change par rapport à la fiche actuelle

### En-tête — passe de ~3 blocs empilés à 4 bandes fines (~150 px au lieu de ~230)
1. **Identité sur une ligne** : portrait réduit (58 px), nom, puis
   `Classe · Sous-classe · Origine` en texte cliquable + 3 petites icônes 📖 pour les
   descriptions. Barre d'XP = filet de 4 px sous le nom.
2. **Bande « constantes »** : PV (avec jauge) · CA · Vitesse · Init. · Perception passive ·
   Inspiration, en 6 cases égales. Ces valeurs sont donc visibles **quel que soit l'onglet**.
3. **Bande « économie d'action »** : 3 pilules Action / Bonus / Réaction, + puce États
   (repliée) + puce Épuisement.
4. **Repos court / long** : déplacés en boutons-icônes dans la barre de titre de la fenêtre
   (☕ / 🛏️), ils ne mangent plus une ligne entière.

### Onglets
- Barre d'onglets compacte (icône + libellé, 1 ligne).
- **Caractéristiques** : barre utilitaire fine (bonus de maîtrise, init., perc. passive,
  épuisement, états) puis 2 colonnes — 6 cartes de caracs en grille 2×3 à gauche,
  liste de compétences à droite. Seule la liste de compétences défile si besoin
  (17 lignes → ~1 écran).
- **Équipement** : grille 2×2 des emplacements (main/main/armure/accessoires), tient sans défiler.
- **Inventaire** : bande monnaie + 2 tableaux condensés + jauge de charge. Défilement interne
  si beaucoup d'objets (inhérent).
- **Capacités** : bande DD/bonus d'attaque, langues en puces, trait d'origine, emplacements
  de sorts en puces, puis 2 colonnes Capacités / Sorts (sous-onglets par niveau conservés).
- **Journal** : les 2 éditeurs se partagent la hauteur.

## Principe retenu
Tout ce qui est *transversal* (identité, PV/CA/vitesse, économie d'action) vit dans l'en-tête
fixe ; chaque onglet ne porte plus que **son** contenu. Les listes intrinsèquement longues
(compétences, sorts, inventaire) défilent à l'intérieur de leur onglet — jamais la fiche entière.

## Deux densités
- **Compacte** (défaut) : tout ce qui peut tenir sans défiler tient sans défiler.
- **Confortable** : mêmes contenus, marges un peu plus larges ; les onglets denses
  (Caractéristiques, Capacités) défilent alors légèrement.
