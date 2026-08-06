# Changelog

Toutes les modifications notables de ce projet sont documentées dans ce fichier.

Le format est basé sur [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/),
et ce projet suit le [Semantic Versioning](https://semver.org/lang/fr/).

## [Non publié] - 0.1.0

Première ébauche du système : squelette complet, encore non testé dans un client
Foundry réel.

### Ajouté
- Manifeste `system.json` (Foundry VTT v13-14, `documentTypes`, `manifest`/`download`
  pointant vers les releases GitHub pour l'auto-update).
- Modèle de données (DataModel) de l'Actor "character" : 6 caractéristiques,
  18 compétences SRD 5e, jets de sauvegarde, PV/CA/vitesse/niveau, origine/classe,
  XP interne, monnaies, biographie/notes.
- Modèles de données des Items : `weapon`, `armor`, `gear`, `feature`.
- Données des 6 Origines (Fleuraine, Altenmark, Lucentia, Ravenmoor, Valdera, Ashar)
  externalisées en JSON : bonus de caractéristiques, avantages de compétences,
  trait spécial.
- Feuille de personnage (`ActorSheetV2` / ApplicationV2) avec un template par
  onglet : Statistiques, Équipement, Inventaire, Capacités/Sorts (selon la classe),
  Journal, plus une zone commune (nom, niveau, classe, PV, CA, vitesse, repos
  court/long).
- Règles D&D 5e sourcées : modificateur de caractéristique, bonus de maîtrise,
  capacité de charge (Force × 15 lb), conversion des monnaies en équivalent PC.
- Localisation française et anglaise.
- Feuille de style scopée au système.
- Workflow GitHub Actions (`workflow_dispatch`, sans saisie manuelle) qui lit la
  version depuis `system.json`, tague, construit le zip du système et publie une
  Release GitHub avec `system.json` en asset, pour l'installation/mise à jour de
  Foundry via le champ `manifest`.
- Type d'Actor `npc` (ennemi/PNJ) : modèle de données (`NpcData`) et fiche
  (`DndCustomNpcSheet`) distincts de `character` — type de créature et taille
  (listes SRD 5e), indice de dangerosité (FI, sourcé SRD), CA/PV/vitesse, bonus
  de caractéristiques (sauvegarde = bonus), capacités spéciales/particularité
  (texte libre), XP rapporté (saisie manuelle, table FI→XP prévue plus tard) et
  butin (réutilise les Items `weapon`/`armor`/`gear`).

### Modifié
- Champ "Classe" de la fiche de personnage : liste déroulante fermée sur les
  12 classes officielles D&D 5e (SRD) au lieu d'un champ texte libre. Liste des
  classes lanceuses de sorts (qui bascule l'onglet en "Sorts") déplacée dans
  `CONFIG.DND_CUSTOM.spellcastingClasses`.

### Corrigé
- Liste des compétences complétée : Perspicacité (Insight) ajoutée, absente de la
  spécification initiale (17 au lieu des 18 compétences standard du D&D 5e).
