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
 *  `{ default: CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER }` pour le Guide du Joueur (visible de
 *  tous), `{ default: NONE }` pour le Guide du MJ (jamais visible des joueurs).
 *
 *  **Rattrapage de visibilité** : si le Journal existe déjà mais qu'un `ownership.default`
 *  strictement au-dessus de « Aucun » est demandé alors que l'existant est resté à « Aucun »
 *  (défaut Foundry des mondes créés avant l'ajout du paramètre `ownership` ici — jamais un choix
 *  explicite du MJ pour un Journal destiné aux joueurs), on le remonte à ce niveau. On ne
 *  redescend jamais un niveau et on ne touche jamais aux droits par utilisateur.
 *
 *  Point d'entrée commun aux 3 `ensure*Journal` du système (Guide du MJ, Guide du Joueur,
 *  comparatif des Origines). */
export async function ensureGmAuthoredJournal(title, buildPages, { ownership } = {}) {
  if (!game.user.isGM) return;

  const existing = game.journal.getName(title);
  if (existing) {
    const wantedDefault = ownership?.default;
    const none = CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE;
    if (wantedDefault !== undefined && wantedDefault > none && existing.ownership.default === none) {
      await existing.update({ "ownership.default": wantedDefault });
    }
    return;
  }

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
