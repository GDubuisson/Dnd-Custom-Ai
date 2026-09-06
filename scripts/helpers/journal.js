/** Crée **une seule fois** un `JournalEntry` nommé `title`. No-op hors MJ, et no-op si un Journal
 *  du même nom existe déjà : jamais d'écrasement, le MJ reste libre de l'éditer ensuite sans le
 *  voir régénéré au prochain chargement du monde.
 *
 *  `buildPages` (async) n'est appelé **qu'une fois ces gardes passées** — il retourne
 *  `[{ name, content }]` (`content` = HTML) ; chaque entrée devient une page `text` triée par son
 *  rang (`sort` = (index + 1) × 100). S'il retourne une liste vide/nulle (données pas encore
 *  chargées, p. ex.), rien n'est créé.
 *
 *  `ownership` (optionnel) est passé tel quel à `JournalEntry.create` — ex.
 *  `{ default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE }` pour le Guide du MJ, jamais visible des
 *  joueurs même si le défaut de Foundry venait à changer.
 *
 *  Point d'entrée commun aux 3 `ensure*Journal` du système (Guide du MJ, Guide du Joueur,
 *  comparatif des Origines). */
export async function ensureGmAuthoredJournal(title, buildPages, { ownership } = {}) {
  if (!game.user.isGM) return;
  if (game.journal.getName(title)) return;

  const pages = await buildPages();
  if (!pages?.length) return;

  await JournalEntry.create({
    name: title,
    ...(ownership ? { ownership } : {}),
    pages: pages.map(({ name, content }, index) => ({
      name,
      type: "text",
      sort: (index + 1) * 100,
      text: { format: 1, content }
    }))
  });
}
