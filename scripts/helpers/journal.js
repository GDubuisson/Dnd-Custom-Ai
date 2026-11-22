const SYSTEM_ID = "dnd-custom-ai";

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

/**
 * Comme `ensureGmAuthoredJournal`, mais resynchronise un Journal existant à chaque appel : les pages
 * du système (flag `systemPage`) absentes sont ajoutées, celles dont la source a changé sont réécrites.
 * Les pages créées par le MJ ne sont jamais touchées. La source est comparée via le flag `source`,
 * car Foundry peut normaliser le HTML enregistré.
 * `adoptUnflagged` : pour un Journal autrefois créé une seule fois (`ensureGmAuthoredJournal`, pages
 * sans flag), une page sans flag qui porte le nom d'une page du système est reprise et réécrite.
 */
export async function syncGmAuthoredJournal(title, buildPages, { ownership, adoptUnflagged = false } = {}) {
  if (!game.user.isGM) return;
  const pages = await buildPages();
  if (!pages?.length) return;

  const pageData = ({ name, content }, index) => ({
    name,
    type: "text",
    sort: (index + 1) * 100,
    text: { format: 1, content },
    flags: { [SYSTEM_ID]: { systemPage: true, source: content } }
  });

  const existing = game.journal.getName(title);
  if (!existing) {
    await JournalEntry.create({ name: title, ...(ownership ? { ownership } : {}), pages: pages.map(pageData) });
    return;
  }

  const creates = [];
  const updates = [];
  pages.forEach((page, index) => {
    const current = existing.pages.find((entry) => entry.name === page.name && entry.flags?.[SYSTEM_ID]?.systemPage);
    const legacy =
      !current && adoptUnflagged
        ? existing.pages.find((entry) => entry.name === page.name && !entry.flags?.[SYSTEM_ID]?.systemPage)
        : null;
    if (legacy) {
      updates.push({
        _id: legacy.id,
        "text.content": page.content,
        [`flags.${SYSTEM_ID}.systemPage`]: true,
        [`flags.${SYSTEM_ID}.source`]: page.content
      });
    } else if (!current) creates.push(pageData(page, index));
    else if (current.flags[SYSTEM_ID].source !== page.content) {
      updates.push({ _id: current.id, "text.content": page.content, [`flags.${SYSTEM_ID}.source`]: page.content });
    }
  });
  if (creates.length) await existing.createEmbeddedDocuments("JournalEntryPage", creates);
  if (updates.length) await existing.updateEmbeddedDocuments("JournalEntryPage", updates);
}
