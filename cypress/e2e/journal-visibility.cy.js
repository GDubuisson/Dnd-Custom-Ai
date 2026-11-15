// Visibilité des Journaux générés : Guide du Joueur et Comparatif des Origines en Observateur,
// Guide du MJ en Aucun. Les Journaux joueur sont repassés en « Aucun » puis rattrapés au rechargement.

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

    // Journaux joueur remis en « Aucun ».
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

    // Rechargement : le hook `ready` rattrape la visibilité (asynchrone, `should()` réessaie).
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

  it("les Chroniques des objets sont réservées au MJ, une page par région (T-JOURNAL-003)", () => {
    cy.loginAsGM();
    cy.window({ timeout: 25000 }).should((win) => {
      const player = win.game.users.find((user) => !user.isGM);
      const chronicles = journalByKey(win, "DND_CUSTOM.Journal.ItemLoreTitle");
      expect(chronicles, "Chroniques des objets présentes").to.exist;
      expect(chronicles.ownership.default, "réservées au MJ").to.equal(NONE);
      expect(chronicles.testUserPermission(player, "OBSERVER"), "invisibles du joueur").to.be.false;

      const regions = ["fleuraine", "altenmark", "lucentia", "ravenmoor", "valdera", "azhar", "saintSiege"].map((key) =>
        win.game.i18n.localize(`DND_CUSTOM.Regions.${key}`)
      );
      expect(chronicles.pages.map((page) => page.name)).to.have.members(regions);
      const fleuraine = chronicles.pages.getName(win.game.i18n.localize("DND_CUSTOM.Regions.fleuraine"));
      expect(fleuraine.text.content).to.include("La Lame des Bannières");
    });
  });
});
