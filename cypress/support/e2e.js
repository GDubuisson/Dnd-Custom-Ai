// Support file Cypress, chargé automatiquement avant chaque spec e2e (cf. cypress.config.js >
// e2e.supportFile).
import "@testing-library/cypress/add-commands";
// Enregistre cy.injectAxe()/cy.checkA11y() (axe-core) — cf. cypress/e2e/accessibility.cy.js,
// lot 3 point 9 "Accessibilité" (RGAA/WCAG).
import "cypress-axe";

// Garde-fou obligatoire : à appeler dans CHAQUE spec juste après avoir confirmé `game.ready`
// (avant toute assertion métier), sur le modèle de system-load.cy.js/quench.cy.js. Vérifie que
// le système chargé dans l'instance Foundry testée correspond à la version locale de
// system.json — sans ce contrôle, un mauvais montage Docker (ou un système jamais reconstruit/
// rechargé après une modif locale) fait tourner toute la suite contre du code périmé sans que
// rien ne le signale (incident réel, cf. [[project_docker_e2e_testing_setup]]). Échec volontaire
// et explicite plutôt qu'un faux vert : à l'utilisateur de corriger (relancer le monde, vérifier
// les montages docker-compose.yml), pas à Cypress de deviner quoi faire.
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

// Connexion en tant qu'utilisateur Joueur (cf. Cypress.expose("testPlayerName"), cypress.config.js)
// plutôt que Gamemaster : la majorité des scénarios de tests/E2E_TEST_PLAN.md s'exécutent
// délibérément côté Joueur propriétaire (cf. sa section "Conventions"), pas MJ — seuls les
// scénarios dont le comportement dépend explicitement du rôle (ex. T-WIZ-013) utilisent une
// connexion Gamemaster dédiée, comme dans system-load.cy.js/quench.cy.js. Même séquence
// join/garde-fous que ces deux specs (iframe Sec-Fetch-Dest, vérification de version).
// Même séquence que system-load.cy.js/quench.cy.js, factorisée ici pour être réutilisable par
// toute nouvelle spec (cf. wizard.cy.js > T-WIZ-013 et son nettoyage final, seul scénario de la
// section 1 dont le comportement dépend explicitement du rôle MJ).
// Ferme les notifications "permanentes" que Foundry peut poster à la connexion (ex. "You are
// using an older version of the Foundry Virtual Tabletop Electron client..." — avertissement
// générique du cœur Foundry sur la version du client détecté, sans rapport avec ce système ni
// avec la garde-fou de version ci-dessus). Apparu le 2026-08-19 sans changement de code
// applicatif de notre côté : ces notifications sont en position fixe en haut à gauche
// (`#notifications`) et recouvrent `input.actor-name`, faisant échouer `cy.openActorSheet` sur
// TOUTE spec (pas seulement les nouvelles) avec "expected <input.actor-name> to be visible".
// Suppression DOM directe (pas de clic sur un bouton de fermeture, dont le sélecteur exact varie
// selon la version du cœur Foundry) : robuste et suffisant, ces notifications ne reviennent pas
// spontanément pendant la durée d'un test.
Cypress.Commands.add("dismissPermanentNotifications", () => {
  cy.get("body").then(($body) => {
    const notifications = $body.find("#notifications li.permanent");
    if (notifications.length) cy.wrap(notifications).invoke("remove");
  });
});

// Connecte la session au monde de test sous l'utilisateur nommé, puis charge /game et attend
// que le client Foundry soit prêt. Brique commune à cy.loginAsGM()/cy.loginAsPlayer() et aux
// specs qui pilotent leur propre connexion (quench.cy.js, system-load.cy.js).
//
// Pourquoi ne PAS cliquer simplement le bouton du formulaire de connexion : Foundry rejette
// toute requête de DOCUMENT vers /game, /join, /setup... dont l'en-tête `Sec-Fetch-Dest` vaut
// autre chose que "document"/"empty" (View.assertDocumentDestination, protection
// anti-clickjacking côté serveur), et Cypress charge l'application testée dans une iframe —
// donc la navigation que la page déclenche ELLE-MÊME vers /game après le submit arrive en
// "iframe" et renvoie la page "The /game route does not accept this type of request". Les
// navigations pilotées par `cy.visit()` ne sont pas concernées (vérifié : un cy.visit("/game")
// explicite charge bien le jeu), seules celles déclenchées par la page le sont.
//
// Jusqu'à Cypress 15, la parade était `cy.intercept(..., (req) => delete
// req.headers["sec-fetch-dest"])` dans chaque spec. Elle ne fonctionne PLUS en Cypress 16 : le
// handler est appelé, mais l'en-tête n'y est même pas visible (`req.headers["sec-fetch-dest"]`
// undefined) alors que le serveur le reçoit toujours — Chrome le pose après la couche
// d'interception, qui n'a donc plus prise dessus. Un flag Chrome
// (`--disable-features=FetchMetadataDestination`) a aussi été testé : sans effet, ces features
// sont stabilisées et leur flag retiré.
//
// La parade actuelle supprime le problème à la racine : on soumet la connexion en POST hors
// navigateur (`cy.request`, qui partage les cookies de session avec lui), puis on charge /game
// via `cy.visit()`. Le POST /join n'est pas une requête de document, il n'est donc pas soumis à
// la protection ci-dessus — mais il doit prouver son origine depuis Foundry 14.370 (middleware
// CSRF, cf. l'en-tête Sec-Fetch-Site ci-dessous, obligatoire car cy.request part du process
// Node de Cypress et ne pose aucun en-tête Sec-Fetch-* de lui-même).
Cypress.Commands.add("joinWorldAs", (userName) => {
  cy.visit("/join", { timeout: 30000 });

  // L'identifiant de l'utilisateur (pas son nom) est ce qu'attend POST /join : on le lit dans
  // le vrai formulaire de connexion plutôt que de le coder en dur, un id Foundry étant
  // régénéré à chaque recréation du monde de test.
  cy.get('select[name="userId"] option', { timeout: 20000 }).then(($options) => {
    const option = [...$options].find((o) => o.textContent.trim() === userName);
    expect(option, `utilisateur "${userName}" proposé par l'écran /join du monde de test`).to.exist;

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

  // Foundry ouvre automatiquement la fenêtre "User Configuration" pour un Joueur qui n'a pas
  // encore de personnage assigné (`game.user.character` vide) — comportement du cœur Foundry,
  // rien à voir avec ce système. Découvert au premier run réel (2026-08-15) : cette fenêtre
  // reste ouverte pendant tout le test, entre en collision avec des sélecteurs génériques
  // (`input[name="name"]` matchait son champ à elle plutôt que celui de l'assistant, cf.
  // wizard.cy.js > T-WIZ-008) et peut recouvrir d'autres éléments. On la ferme systématiquement
  // ici plutôt que dans chaque spec. `{force: true}` : son bouton de fermeture peut lui-même
  // être recouvert par une notification au moment de ce clic (cf. viewportWidth/Height,
  // cypress.config.js).
  cy.get("body").then(($body) => {
    const userConfig = $body.find('[id^="UserConfig-"]');
    if (userConfig.length) {
      cy.wrap(userConfig).find('[data-action="close"]').first().click({ force: true });
    }
  });
});

// Un objet littéral `{...}` créé dans le code de la spec appartient à la réalité JS de Cypress,
// pas à celle de la page Foundry testée : Foundry le rejette dès qu'on le passe à une méthode
// comme Actor.create() ("Actor must be constructed with a DataModel or Object", découvert au
// premier run réel de wizard.cy.js, 2026-08-15). Aller-retour JSON (pas juste
// `win.Object.assign(new win.Object(), data)`, une surface suffisante pour un objet plat mais
// pas pour un objet imbriqué comme `{system: {attributes: {...}}}`) : reconstruit l'objet dans
// la bonne réalité à toute profondeur.
Cypress.Commands.add("toAutObject", (win, data) => win.JSON.parse(win.JSON.stringify(data)));

// Crée un Actor "character" et termine l'assistant de création pour lui (stratégie de fixtures
// retenue pour toute la suite E2E, cf. wizard.cy.js : Actor.create + assistant rejoué à chaque
// fois, pas de fixtures JSON pré-importées). Réutilisable par toute spec ayant besoin d'un
// personnage prêt sans tester l'assistant lui-même (sections 2+ de tests/E2E_TEST_PLAN.md).
// `skills` doit correspondre exactement au quota de la classe choisie (DND_CUSTOM.classSkillChoices,
// scripts/helpers/config.js) — l'appelant est responsable de l'accord, cf. wizard.cy.js > T-WIZ-011
// pour ce qui se passe sinon (assistant non soumis). Suppose une session déjà connectée
// (cy.loginAsPlayer()/cy.loginAsGM() déjà appelé) : ne se logge pas lui-même, pour rester
// utilisable aussi bien en session Joueur que MJ.
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

// Ouvre (ou réaffiche) la fiche d'un Actor déjà créé, sans repasser par l'assistant — pour les
// specs qui testent la fiche elle-même sur un personnage déjà prêt (cf. cy.createReadyCharacter).
// Suppose une session déjà connectée, comme cy.createReadyCharacter.
Cypress.Commands.add("openActorSheet", (actorId) => {
  cy.window().then((win) => win.game.actors.get(actorId).sheet.render(true));
  return cy.get("input.actor-name", { timeout: 15000 }).should("be.visible");
});

// Force le résultat du PROCHAIN d20 lancé (une seule face de dé, une seule fois) sans dépendre
// de Math.random : Foundry n'utilise PAS Math.random pour ses jets (vérifié dans le bundle
// client, scripts/foundry.mjs) mais `CONFIG.Dice.randomUniform` (par défaut
// `MersenneTwister.random`), un point d'extension officiel documenté par Foundry lui-même —
// c'est donc lui qu'il faut remplacer, pas Math.random. `DiceTerm#mapRandomFace` calcule
// `Math.ceil((1 - randomUniform) * faces)` : pour obtenir la face `face` avec certitude (pas
// seulement en probabilité, cf. arrondi flottant sur les bornes exactes), on vise le milieu de
// l'intervalle qui y correspond plutôt que sa borne. Se restaure tout seul après le premier
// appel (pas de fuite vers les jets suivants ni besoin d'un `cy.restoreDice()` séparé à ne pas
// oublier) — utiliser une fois par d20 à forcer (ex. jet de sauvegarde de la mort, `1d20` sans
// modificateur, cf. tab-stats.cy.js > T-STATS-019). Ne convient pas à une formule à plusieurs
// dés (ex. avantage `2d20kh1`) dont on voudrait fixer chaque dé indépendamment — pas nécessaire
// dans cette suite (l'avantage/désavantage y est vérifié via la formule du jet, pas son résultat).
Cypress.Commands.add("forceD20", (face) => {
  return cy.window().then((win) => {
    const original = win.CONFIG.Dice.randomUniform;
    win.CONFIG.Dice.randomUniform = () => {
      win.CONFIG.Dice.randomUniform = original;
      return 1 - (face - 0.5) / 20;
    };
  });
});
