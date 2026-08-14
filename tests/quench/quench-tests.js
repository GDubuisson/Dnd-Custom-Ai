// Tests d'intégration Quench : s'exécutent DANS un vrai monde Foundry (vrai pipeline
// Document/DataModel, permissions, sockets...), contrairement à tests/unit et tests/dom qui
// appellent les fonctions/DataModels sur des fixtures isolées (cf. tests/README.md >
// "Limites connues"). Chargé uniquement si ce module (dnd-custom-ai-quench-tests) et le
// module "quench" sont tous les deux actifs dans le monde de test — jamais dans le système
// livré (cf. tests/quench/module.json, non référencé par system.json).
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
          // Vierge (pas de classe/origine) : cf. #onOpenCreationWizard/Hooks createActor,
          // scripts/dnd-custom-ai.js — l'assistant de création prend le relais, pas testé ici.
          assert.equal(actor.system.class, "");
          assert.equal(actor.system.origin, "");
        });

        it("calcule les PV max dérivés via le vrai pipeline Document (classe + niveau + CON)", async () => {
          const actor = await Actor.create({ name: "Quench Test Actor - PV", type: "character" });
          createdActorIds.push(actor.id);

          // Guerrier (d10), CON value 14 (mod +2, cf. helpers/rules.js#abilityModifier) :
          // valeurs choisies arbitrairement, seule la cohérence du calcul est vérifiée ici, pas
          // un nombre en dur qui casserait si la table de dés de vie change.
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
});
