import { hasFeature } from "./rules.js";

const { DialogV2 } = foundry.applications.api;

const SCULPT_SPELLS_FEATURE_NAME = "Sculpteur de sorts";

/** Sculpteur de sorts (Évocation, Magicien, SRD 5e — chantier "12 sous-classes SRD génériques",
 *  2026-08-23, approximation assumée avec l'utilisateur, cf. ANOMALIES_ACTIVES.md) : le texte
 *  SRD ne protège que contre les sorts d'ÉVOCATION et un nombre limité d'alliés (1 + niveau du
 *  sort) — ni l'un ni l'autre n'est modélisé ici (l'école de magie a été retirée du schéma des
 *  Sorts, cf. SpellData ; le nombre d'alliés protégés se limite à UN choisi par lancer, comme
 *  Sort Prudent ci-dessous). S'applique donc à TOUT sort à sauvegarde du Magicien.
 *
 *  Même convention Maj-clic sur "Lancer" que Sort Prudent (Métamagie, cf. helpers/metamagic.js),
 *  mais GRATUIT (aucune réserve à dépenser — Sculpteur de sorts est une Capacité passive
 *  illimitée en SRD 5e, contrairement à la Métamagie). Les deux capacités ne se recoupent jamais
 *  en pratique (classes différentes, un seul personnage jamais les deux à la fois dans ce
 *  système sans multiclassage) : aucun conflit de convention à gérer. Renvoie l'id de l'Actor
 *  protégé, ou `null` (rien à appliquer, appelant inchangé). */
export async function chooseSculptSpellsTarget(actor, targets, { careful }) {
  if (!careful) return null;
  if (!hasFeature(actor.items.contents, SCULPT_SPELLS_FEATURE_NAME)) return null;
  if (!targets.length) return null;

  if (targets.length === 1) return targets[0].actor?.id ?? null;

  const options = targets
    .map((token) => `<option value="${token.actor.id}">${token.actor.name}</option>`)
    .join("");
  return DialogV2.prompt({
    window: { title: game.i18n.localize("DND_CUSTOM.Spells.SculptSpellsTitle") },
    content: `<select name="targetActorId">${options}</select>`,
    ok: {
      label: game.i18n.localize("DND_CUSTOM.Spells.MetamagicConfirm"),
      callback: (event, button) => button.form.elements.targetActorId.value
    },
    rejectClose: false
  });
}
