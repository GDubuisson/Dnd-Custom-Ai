// Support Cypress chargé avant chaque spec e2e.
import "@testing-library/cypress/add-commands";
// Commandes axe-core cy.injectAxe() / cy.checkA11y() (tests d'accessibilité).
import "cypress-axe";

// Ignore uniquement l'exception du cœur Foundry levée par `Token#_drawTargetArrows` lors d'un ciblage ;
// le ciblage est appliqué malgré tout. Toute autre exception fait échouer le test.
Cypress.on(
  "uncaught:exception",
  (err) =>
    !(err.message.includes("Cannot read properties of undefined (reading 'clear')") && err.stack?.includes("_drawTargetArrows"))
);

// À appeler dans chaque spec après `game.ready` : échoue si la version du système chargé
// diffère de system.json local (montage Docker ou monde non rechargé).
Cypress.Commands.add("assertSystemVersionMatches", () => {
  cy.window({ timeout: 20000 })
    .its("game.system.version")
    .should((actual) => {
      const expected = Cypress.expose("expectedSystemVersion");
      expect(
        actual,
        `game.system.version ("${actual}") ne correspond pas à system.json local ("${expected}") — ` +
          `le monde testé charge une version périmée du système, pas le code en cours de dev. ` +
          `Vérifier docker-compose.yml (montages) et relancer le monde avant de refaire tourner les tests.`
      ).to.equal(expected);
    });
});

// Supprime les notifications permanentes de Foundry qui masquent la fiche.
Cypress.Commands.add("dismissPermanentNotifications", () => {
  cy.get("body").then(($body) => {
    const notifications = $body.find("#notifications li.permanent");
    if (notifications.length) cy.wrap(notifications).invoke("remove");
  });
});

// Connecte la session sous `userName` puis charge /game prêt. Connexion en POST via `cy.request`
// (en-tête Sec-Fetch-Site requis par le CSRF), car Foundry refuse /game chargé depuis l'iframe Cypress.
Cypress.Commands.add("joinWorldAs", (userName) => {
  cy.visit("/join", { timeout: 30000 });

  // POST /join attend l'id de l'utilisateur, lu dans le formulaire.
  cy.get('select[name="userId"] option', { timeout: 20000 }).then(($options) => {
    const option = [...$options].find((o) => o.textContent.trim() === userName);
    expect(option, `utilisateur "${userName}" proposé par l'écran /join du monde de test`).to.exist; // NOSONAR : userName est une chaîne

    cy.request({
      method: "POST",
      url: "/join",
      headers: { "Content-Type": "application/json", "Sec-Fetch-Site": "same-origin" },
      body: { action: "join", userId: option.value, password: "" },
    });
  });

  cy.visit("/game", { timeout: 30000 });
  cy.get("#interface", { timeout: 30000 }).should("be.visible");
  cy.window({ timeout: 20000 }).its("game.ready").should("eq", true);
});

Cypress.Commands.add("loginAsGM", () => {
  cy.joinWorldAs("Gamemaster");
  cy.assertSystemVersionMatches();
  cy.dismissPermanentNotifications();
});

Cypress.Commands.add("loginAsPlayer", () => {
  cy.joinWorldAs(Cypress.expose("testPlayerName"));
  cy.assertSystemVersionMatches();
  cy.dismissPermanentNotifications();

  // Ferme la fenêtre « Configuration utilisateur » ouverte pour un Joueur sans personnage.
  cy.get("body").then(($body) => {
    const userConfig = $body.find('[id^="UserConfig-"]');
    if (userConfig.length) {
      cy.wrap(userConfig).find('[data-action="close"]').first().click({ force: true });
    }
  });
});

// Attend la fin de l'import automatique du contenu : le bestiaire est importé en dernier, son compendium
// compte alors autant d'entrées que world-items/npcs.json. Ne jamais relancer l'import en parallèle.
Cypress.Commands.add("waitForContentImport", () => {
  cy.readFile("world-items/npcs.json").then((npcs) => {
    cy.window({ timeout: 30000 }).should((win) => {
      const pack = win.game.packs.get("dnd-custom-ai.adversaires");
      expect(pack, "compendium 'adversaires' introuvable").to.exist;
      expect(pack.index.size, "import automatique du contenu pas encore terminé").to.equal(npcs.length);
    });
  });
});

// Recrée `data` dans la réalité JS de la page (aller-retour JSON), exigé par les API Foundry.
Cypress.Commands.add("toAutObject", (win, data) => win.JSON.parse(win.JSON.stringify(data)));

// Crée un personnage et termine son assistant de création (session déjà connectée) ;
// `skills` doit respecter le quota de la classe.
Cypress.Commands.add(
  "createReadyCharacter",
  ({ name = "Test Character", origin = "fleuraine", classKey = "fighter", skills = ["athletics", "intimidation"] } = {}) => {
    return cy
      .window()
      .then((win) => win.Actor.create(win.JSON.parse(win.JSON.stringify({ name, type: "character" }))))
      .then((actor) => {
        cy.get("form.character-wizard", { timeout: 15000 }).should("be.visible");
        cy.get('select[name="origin"]').select(origin);
        cy.get('select[name="classKey"]').select(classKey);
        skills.forEach((skill) => cy.get(`input[type="checkbox"][name="skills.${skill}"]`).check());
        cy.get('form.character-wizard button[type="submit"]').click();
        cy.get("form.character-wizard").should("not.exist");
        return cy.wrap(actor.id);
      });
  }
);

// Ouvre la fiche d'un Actor existant (session déjà connectée).
Cypress.Commands.add("openActorSheet", (actorId) => {
  cy.window().then((win) => win.game.actors.get(actorId).sheet.render(true));
  return cy.get("input.actor-name", { timeout: 15000 }).should("be.visible");
});

// Force la face du prochain d20 via `CONFIG.Dice.randomUniform`, restauré après un appel.
// Un seul dé par appel (pas pour `2d20kh1`).
Cypress.Commands.add("forceD20", (face) => {
  return cy.window().then((win) => {
    const original = win.CONFIG.Dice.randomUniform;
    win.CONFIG.Dice.randomUniform = () => {
      win.CONFIG.Dice.randomUniform = original;
      return 1 - (face - 0.5) / 20;
    };
  });
});
