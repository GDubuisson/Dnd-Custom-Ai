// Tests d'intégration Quench exécutés dans un vrai monde Foundry (module de test, jamais livré).
// L'assistant est testé via submitWizardForm, qui déclenche la vraie soumission (#onSubmit).
import { grantClassContent, grantLanguages } from "/systems/dnd-custom-ai/scripts/helpers/class-content.js"; // NOSONAR : chemin servi par Foundry
import { CharacterCreationWizard } from "/systems/dnd-custom-ai/scripts/sheets/character-creation-wizard.js"; // NOSONAR : chemin servi par Foundry

/** Remplit et soumet l'assistant de création de `actor` (soumission valide uniquement). */
async function submitWizardForm(actor, { name, origin, classKey, abilities, skills }) {
  const wizard = new CharacterCreationWizard(actor);
  await wizard.render(true);
  // Laisse le premier rendu se terminer.
  await new Promise((resolve) => setTimeout(resolve, 200));

  const root = wizard.element;
  if (name !== undefined) root.querySelector('input[name="name"]').value = name;
  root.querySelector('select[name="origin"]').value = origin;
  root.querySelector('select[name="classKey"]').value = classKey;
  for (const [key, value] of Object.entries(abilities ?? {})) {
    root.querySelector(`select[name="abilities.${key}"]`).value = String(value);
  }
  for (const key of skills) {
    root.querySelector(`input[type="checkbox"][name="skills.${key}"]`).checked = true;
  }

  // Attend la fermeture de l'assistant, signe que la soumission est terminée.
  const closed = new Promise((resolve, reject) => {
    Hooks.once("closeCharacterCreationWizard", resolve);
    setTimeout(
      () => reject(new Error("closeCharacterCreationWizard n'a jamais été déclenché — soumission invalide ou hook renommé ?")),
      10000
    );
  });
  root.querySelector('button[type="submit"]').click();
  await closed;
}

Hooks.on("quenchReady", (quench) => {
  quench.registerBatch(
    "dndCustomAi.actorCreation",
    (context) => {
      const { describe, it, assert, after } = context;

      describe("Création d'un Actor character", () => {
        const createdActorIds = [];

        after(async () => {
          if (createdActorIds.length) {
            await Actor.deleteDocuments(createdActorIds);
            createdActorIds.length = 0;
          }
        });

        it("se crée sans erreur avec le système dnd-custom-ai actif", async () => {
          assert.equal(game.system.id, "dnd-custom-ai");

          const actor = await Actor.create({ name: "Quench Test Actor", type: "character" });
          createdActorIds.push(actor.id);

          assert.ok(actor, "L'Actor aurait dû être créé");
          assert.equal(actor.type, "character");
          // Personnage vierge, pris en charge par l'assistant (non testé ici).
          assert.equal(actor.system.class, "");
          assert.equal(actor.system.origin, "");
        });

        it("calcule les PV max dérivés via le vrai pipeline Document (classe + niveau + CON)", async () => {
          const actor = await Actor.create({ name: "Quench Test Actor - PV", type: "character" });
          createdActorIds.push(actor.id);

          // Valeurs arbitraires : seule la cohérence du calcul est vérifiée.
          await actor.update({
            "system.class": "guerrier",
            "system.attributes.level": 1,
            "system.abilities.con.value": 14
          });

          assert.isAbove(actor.system.attributes.hp.max, 0, "PV max doit être calculé (>0)");
          assert.isAtMost(
            actor.system.attributes.hp.value,
            actor.system.attributes.hp.max,
            "PV actuels ne doivent jamais dépasser le max (cf. clamp, retour testeur FIRST_FEEDBACK.md)"
          );
        });
      });
    },
    { displayName: "D&D Custom Ai — Actor" }
  );

  // Assistant de création : volet calcul (l'affichage est testé par wizard.cy.js), en session MJ.
  quench.registerBatch(
    "dndCustomAi.wizard",
    (context) => {
      const { describe, it, assert, after } = context;

      describe("Assistant de création — octroi d'équipement, capacités/sorts, langues", () => {
        const createdActorIds = [];

        after(async () => {
          if (createdActorIds.length) {
            await Actor.deleteDocuments(createdActorIds);
            createdActorIds.length = 0;
          }
        });

        it("attribue l'équipement de départ (arme + armure) au personnage (T-WIZ-014)", async () => {
          const weaponExists = game.items.getName("Épée longue");
          const armorExists = game.items.getName("Cotte de mailles");
          assert.ok(
            weaponExists && armorExists,
            "Prérequis : Items du monde 'Épée longue'/'Cotte de mailles' introuvables — " +
              "importés automatiquement au premier chargement du monde (cf. world-items/README.md)"
          );

          const actor = await Actor.create({ name: "Quench Wizard Fighter", type: "character" });
          createdActorIds.push(actor.id);

          await submitWizardForm(actor, {
            origin: "ravenmoor",
            classKey: "fighter",
            skills: ["athletics", "intimidation"]
          });

          const weapon = actor.items.find((item) => item.type === "weapon" && item.name === "Épée longue");
          const armor = actor.items.find((item) => item.type === "armor" && item.name === "Cotte de mailles");
          assert.ok(weapon, "L'arme de départ du fighter aurait dû être attribuée");
          assert.ok(armor, "L'armure de départ du fighter aurait dû être attribuée");
          assert.isTrue(weapon.system.equipped);
          assert.isTrue(armor.system.equipped);
        });

        it("avertit sans bloquer la création si l'équipement de départ est introuvable (T-WIZ-015)", async () => {
          const staffItem = game.items.getName("Bâton");
          assert.ok(
            staffItem,
            "Prérequis : Item du monde 'Bâton' introuvable — importé automatiquement au premier " +
              "chargement du monde (cf. world-items/README.md)"
          );
          const staffData = staffItem.toObject();
          delete staffData._id;
          await staffItem.delete();

          let warned = false;
          const originalWarn = ui.notifications.warn.bind(ui.notifications);
          ui.notifications.warn = (message) => {
            warned = true;
            return originalWarn(message);
          };

          try {
            // Moine : seule l'arme manque, pas d'armure de départ.
            const actor = await Actor.create({ name: "Quench Wizard Monk", type: "character" });
            createdActorIds.push(actor.id);

            await submitWizardForm(actor, {
              origin: "fleuraine",
              classKey: "monk",
              skills: ["acrobatics", "athletics"]
            });

            assert.isTrue(warned, "Avertissement StartingEquipmentMissing attendu");
            assert.equal(actor.system.class, "monk", "la création doit aboutir malgré l'équipement manquant");
            assert.equal(
              actor.items.filter((item) => item.type === "weapon").length,
              0,
              "aucune arme ne doit avoir été attribuée"
            );
          } finally {
            ui.notifications.warn = originalWarn;
            await Item.create(staffData);
          }
        });

        it("octroie les Capacités/Sorts de niveau 1 pour une classe lanceuse de sorts (T-WIZ-016)", async () => {
          const actor = await Actor.create({ name: "Quench Wizard Caster", type: "character" });
          createdActorIds.push(actor.id);
          await actor.update(
            { "system.class": "wizard", "system.attributes.level": 1 },
            { dndCustomWizard: true }
          );

          const grantedNames = await grantClassContent(actor, "wizard", 1);
          assert.isAbove(
            grantedNames.length,
            0,
            "Prérequis : compendiums Capacités/Sorts vides pour 'wizard' niveau 1 — importés " +
              "automatiquement au premier chargement du monde (cf. world-items/README.md)"
          );

          const features = actor.items.filter((item) => item.type === "feature");
          const spells = actor.items.filter((item) => item.type === "spell" && (item.system.level ?? 0) <= 1);
          assert.isAbove(features.length + spells.length, 0, "au moins une Capacité ou un Sort/tour de magie attendu");
          // Au moins une Capacité propre à la classe, pas seulement universelle.
          assert.ok(
            features.some((f) => !f.system.universal) || spells.length > 0,
            "au moins une Capacité/un Sort PROPRE à la classe (pas seulement universelle) attendu"
          );
        });

        it("octroie Commune et la langue propre à l'Origine choisie (T-WIZ-017)", async () => {
          const actor = await Actor.create({ name: "Quench Wizard Languages", type: "character" });
          createdActorIds.push(actor.id);

          const grantedNames = await grantLanguages(actor, "fleuraine");
          assert.includeMembers(grantedNames, ["Commune", "Fleurain"]);

          const ownedLanguages = actor.items.filter((item) => item.type === "language").map((item) => item.name);
          assert.include(ownedLanguages, "Commune");
          assert.include(ownedLanguages, "Fleurain");
        });
      });
    },
    { displayName: "D&D Custom Ai — Assistant de création" }
  );

  // T-ABIL-021 : changement de tour via l'API Combat.
  quench.registerBatch(
    "dndCustomAi.combatReaction",
    (context) => {
      const { describe, it, assert, after } = context;

      describe("Régénération de la réaction en début de tour (hook updateCombat)", () => {
        const createdActorIds = [];
        const createdCombatIds = [];

        after(async () => {
          if (createdCombatIds.length) await Combat.deleteDocuments(createdCombatIds);
          if (createdActorIds.length) await Actor.deleteDocuments(createdActorIds);
        });

        it("repasse à true dès que c'est le tour du personnage (T-ABIL-021)", async () => {
          assert.isTrue(game.user.isGM, "ce test doit tourner en session MJ (cf. cypress/e2e/quench.cy.js)");

          const actor = await Actor.create({ name: "Quench Reaction Actor", type: "character" });
          createdActorIds.push(actor.id);
          await actor.update({ "system.combat.reactionAvailable": false });

          const combat = await Combat.create({ scene: canvas.scene.id, active: true });
          createdCombatIds.push(combat.id);
          await combat.createEmbeddedDocuments("Combatant", [{ actorId: actor.id }]);

          // startCombat() déclenche le hook updateCombat.
          await combat.startCombat();

          // Laisse le hook asynchrone terminer sa mise à jour.
          await new Promise((resolve) => setTimeout(resolve, 500));

          assert.isTrue(
            actor.system.combat.reactionAvailable,
            "combat.reactionAvailable doit repasser à true au début du tour du personnage"
          );
        });
      });
    },
    { displayName: "D&D Custom Ai — Réaction (Combat Tracker)" }
  );
});
