/**
 * Crée une seule fois un JournalEntry `title` (MJ seulement), une page texte par entrée de `buildPages`.
 * Remonte au besoin un `ownership.default` resté à « Aucun » vers le niveau demandé.
 */
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
