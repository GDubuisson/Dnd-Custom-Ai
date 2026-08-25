import { DND_CUSTOM } from "../helpers/config.js";

const { SchemaField, NumberField, SetField, StringField } = foundry.data.fields;

/** Sous-schéma monnaie (PC/PA/PO/PP), réutilisé par la monnaie de l'Actor et par le prix
 *  de tout Item vendable (arme, armure, objet, outil, moyen de transport). */
export function currencySchema() {
  return new SchemaField({
    pc: new NumberField({ required: true, integer: true, min: 0, initial: 0 }),
    pa: new NumberField({ required: true, integer: true, min: 0, initial: 0 }),
    po: new NumberField({ required: true, integer: true, min: 0, initial: 0 }),
    pp: new NumberField({ required: true, integer: true, min: 0, initial: 0 })
  });
}

/** Résistances/immunités/vulnérabilités aux types de dégâts (chantier "types de dégâts",
 *  Phase 1, 2026-08-24) — champ générique partagé par NpcData et CharacterData, réglable
 *  librement par le MJ (cases à cocher sur la fiche, comme les maîtrises d'armes de la fiche
 *  Classe). Les 13 types SRD sont déjà proposés en choix (pas seulement les 3 physiques de la
 *  Phase 1 en cours) pour ne jamais avoir à retoucher ce schéma en Phase 2 (dégâts magiques) —
 *  seule la couverture de test/contenu progresse par phase, jamais le champ lui-même. Résolu par
 *  `damageTypeMultiplier` (dnd-custom-ai.js) : immunité > (résistance+vulnérabilité qui
 *  s'annulent) > résistance seule > vulnérabilité seule > normal, cf. son commentaire pour le
 *  détail (dont la nuance "contre les attaques non magiques" propre aux 3 types physiques). */
export function damageAffinitySchema() {
  const damageTypeSet = () => new SetField(new StringField({ choices: Object.keys(DND_CUSTOM.damageTypes) }));
  return {
    damageResistances: damageTypeSet(),
    damageImmunities: damageTypeSet(),
    damageVulnerabilities: damageTypeSet()
  };
}
