// Garde-fou : les Journaux générés automatiquement par le système (hook `ready`,
// dnd-custom-ai.js) ont la bonne visibilité.
//
// Contexte : `JournalEntry.create()` sans `ownership` explicite crée un Journal visible du MJ
// SEUL (`ownership.default = 0`). Le Guide du Joueur et le Comparatif des Origines sont pourtant
// la documentation en jeu DESTINÉE aux joueurs (la couche d'infobulles de la fiche y renvoie) —
// ils passaient inaperçus faute d'être partagés. `ensurePlayerGuideJournal`/`ensureOriginsJournal`
// forcent désormais `ownership.default = OBSERVER` à la création, et `ensureGmAuthoredJournal`
// remonte un Journal resté « Aucun » (mondes créés avant ce correctif). Le Guide du MJ reste
// explicitement « Aucun ».
//
// Le test remet volontairement les 2 Journaux joueur en « Aucun » puis recharge, pour exercer le
// rattrapage à chaque exécution (indépendamment de l'état du monde de test) — et les laisse donc
// dans le bon état final, aucune trace à nettoyer.

const PLAYER_JOURNAL_KEYS = ["DND_CUSTOM.Journal.PlayerGuideTitle", "DND_CUSTOM.Journal.OriginsComparisonTitle"];
const GM_JOURNAL_KEY = "DND_CUSTOM.Journal.GmGuideTitle";
const NONE = 0;
const OBSERVER = 2;

function journalByKey(win, key) {
  return win.game.journal.getName(win.game.i18n.localize(key));
}

describe("Visibilité des Journaux générés par le système", () => {
  it("le rattrapage rend le Guide du Joueur et le Comparatif des Origines visibles des joueurs, jamais le Guide du MJ (T-JOURNAL-001)", () => {
    cy.loginAsGM();

    // Simule un monde créé avant le correctif : les 2 Journaux joueur repassent en « Aucun ».
    cy.window().then((win) =>
      Promise.all(
        PLAYER_JOURNAL_KEYS.map((key) => {
          const journal = journalByKey(win, key);
          expect(journal, `Journal « ${key} » présent`).to.exist;
          return journal.update(win.JSON.parse(JSON.stringify({ "ownership.default": NONE })));
        })
      )
    );
    cy.window().should((win) => {
      for (const key of PLAYER_JOURNAL_KEYS) {
        expect(journalByKey(win, key).ownership.default, `« ${key} » remis à Aucun avant rechargement`).to.equal(NONE);
      }
    });

    // Rechargement → hook `ready` → rattrapage de visibilité (asynchrone et détaché : `should()`
    // retente le temps qu'il aboutisse).
    cy.loginAsGM();
    cy.window({ timeout: 25000 }).should((win) => {
      const player = win.game.users.find((user) => !user.isGM);
      expect(player, "prérequis : au moins un utilisateur joueur dans le monde de test").to.exist;

      for (const key of PLAYER_JOURNAL_KEYS) {
        const journal = journalByKey(win, key);
        expect(journal.ownership.default, `« ${key} » remonté à Observateur`).to.equal(OBSERVER);
        expect(journal.testUserPermission(player, "OBSERVER"), `« ${key} » visible du joueur`).to.be.true;
      }

      const gmGuide = journalByKey(win, GM_JOURNAL_KEY);
      expect(gmGuide, "Guide du MJ présent").to.exist;
      expect(gmGuide.ownership.default, "Guide du MJ resté Aucun").to.equal(NONE);
      expect(gmGuide.testUserPermission(player, "OBSERVER"), "Guide du MJ invisible du joueur").to.be.false;
    });
  });
});
