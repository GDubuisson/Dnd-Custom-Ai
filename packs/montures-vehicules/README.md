# Compendium « Montures et véhicules »

Compendium **Actor**, visible des joueurs (Observateur). Rempli automatiquement au chargement du
monde (`importSystemContent()`, cf. `scripts/helpers/content-import.js`) depuis
`world-items/mounts.json` :

- **Montures** (Actor `mount`, fiche PNJ) : Cheval de selle, Destrier fleurainais, Cheval de trait,
  Mule de l'Eismark, Chameau de piste — blocs SRD 5.1 exacts (cheval de selle, cheval de guerre,
  cheval de trait, mule, chameau). Utilisables avec le don Combat monté.
- **Véhicules** (Actor `vehicle`) : Chariot de convoi, Traîneau des guides d'Eisengrund, Navire de
  cabotage, Barque de la Passe — prix SRD (chariot, traîneau, voilier, barque), PV de la table SRD
  des objets (bois résistant, par taille), capacité de charge = traction SRD (cinq fois la charge de
  l'attelage, véhicule compris) ou cargaison SRD pour les bateaux. Prix et contexte dans la
  description.
