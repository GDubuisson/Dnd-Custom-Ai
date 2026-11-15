import { sheetRollFlags } from "./rolls.js";

const SURGE_TABLES = {
  barbarian: {
    nameKey: "DND_CUSTOM.WildMagic.BarbarianTableName",
    entries: [
      "Une onde de chaleur irradie de vous : le prochain allié à moins de 3 m à agir gagne +1 à son prochain jet.",
      "Vos yeux s'embrasent un instant — la prochaine créature qui croise votre regard doit réussir un jet de Sagesse ou reculer, impressionnée.",
      "Le sol tremble sous vos pieds : toutes les créatures à moins de 3 m (alliés compris) doivent garder l'équilibre ou tomber au sol.",
      "Votre rugissement se dédouble, assourdissant — il s'entend à des centaines de mètres à la ronde.",
      "Une odeur d'orage envahit la zone : le prochain jet de dégâts d'un allié proche inflige le maximum.",
      "Votre fourrure/vos cheveux se hérissent, chargés d'une électricité statique inoffensive pendant 1 minute.",
      "Un souffle glacial balaie la zone : la prochaine créature que vous touchez est ralentie jusqu'à la fin de son prochain tour.",
      "Vous semblez grandir d'une tête pendant 1 minute — impressionnant, mais sans effet mécanique direct.",
      "Une lueur spectrale entoure votre arme tant que dure la Rage : elle illumine faiblement (rayon 3 m).",
      "Votre rugissement fait fuir toute la faune environnante — plus aucune rencontre mineure fortuite aujourd'hui (à l'appréciation du MJ).",
      "Une douleur fantôme vous parcourt : perdez 1d4 PV temporaires en plus de ceux de la Rage (jamais en dessous de 0).",
      "Rien ne se passe... cette fois."
    ]
  },
  sorcerer: {
    nameKey: "DND_CUSTOM.WildMagic.SorcererTableName",
    entries: [
      "Pendant 1 minute, vous êtes entouré de papillons spectraux inoffensifs qui suivent chacun de vos mouvements.",
      "Vous pouvez voir à travers les 3 prochains mètres de matière solide devant vous pendant 1 round, comme si elle était transparente.",
      "Un vent violent et localisé souffle autour de vous pendant 1 round, sans direction précise (purement narratif).",
      "Votre peau prend la couleur d'un arc-en-ciel pendant 1 heure.",
      "Vous vous téléportez à 3 m dans une direction aléatoire (au MJ de trancher où, en évitant tout danger évident).",
      "Le prochain sort que vous lancez dans la minute qui suit produit un puissant parfum de lavande en plus de son effet habituel.",
      "Une pluie de flammes froides et inoffensives tombe sur vous et les créatures à 1,50 m pendant 1 round — spectaculaire, sans dégât.",
      "Vous flottez à 30 cm au-dessus du sol pendant 1 minute.",
      "Le prochain jet de dégâts que vous infligez avec un sort est maximisé.",
      "Vous gagnez temporairement 1d4 PV temporaires, immédiatement.",
      "Un souvenir aléatoire et sans importance vous revient avec une clarté saisissante — pas d'effet mécanique.",
      "Rien ne se passe... cette fois."
    ]
  }
};

/** Crée la RollTable de Surtenance sauvage de `subclassKey` si elle n'existe pas encore. */
export async function ensureWildSurgeTable(subclassKey) {
  if (!game.user.isGM) return;

  const table = SURGE_TABLES[subclassKey];
  if (!table) return;

  const name = game.i18n.localize(table.nameKey);
  if (game.tables.getName(name)) return;

  await RollTable.create({
    name,
    formula: `1d${table.entries.length}`,
    results: table.entries.map((text, index) => ({
      type: CONST.TABLE_RESULT_TYPES.TEXT,
      text,
      range: [index + 1, index + 1],
      weight: 1
    }))
  });
}

/** Tire sur la table de Surtenance sauvage et poste le résultat en chat. */
export async function rollWildSurge(actor, subclassKey) {
  const table = SURGE_TABLES[subclassKey];
  if (!table) return;

  const name = game.i18n.localize(table.nameKey);
  const rollTable = game.tables.getName(name);
  if (!rollTable) {
    console.warn(`dnd-custom-ai | Table de Surtenance sauvage "${name}" introuvable, tirage ignoré`);
    return;
  }

  const draw = await rollTable.roll();
  await rollTable.toMessage(draw.results, {
    roll: draw.roll,
    messageOptions: { speaker: ChatMessage.getSpeaker({ actor }), flags: sheetRollFlags() }
  });
}
