import { DND_CUSTOM } from "./config.js";

const SYSTEM_ID = "dnd-custom-ai";

async function loadJson(relativePath) {
  const response = await fetch(`systems/${SYSTEM_ID}/${relativePath}`);
  return response.json();
}

function buildOverviewPage() {
  return `
    <p><strong>Ce Journal n'est visible que par toi (MJ)</strong> — les joueurs n'y ont pas accès,
    contrairement au Journal "Guide du Joueur" qui leur est destiné.</p>
    <h2>Ce que la fiche automatise déjà</h2>
    <ul>
      <li>PV max, CA, Initiative, bonus de maîtrise, DD/bonus d'attaque des sorts : recalculés en
      permanence à partir des caractéristiques, de la classe et du niveau.</li>
      <li>Défense sans armure du Barbare : bonus de Constitution ajouté automatiquement à la CA
      tant qu'aucune armure n'est équipée, sans rien à cocher.</li>
      <li>Aptitudes multiples (Barde) : pastille automatique sur une compétence non maîtrisée qui
      en bénéficierait, et moitié du bonus de maîtrise appliquée au jet.</li>
      <li>Incantation rituelle (Clerc, Druide) : un sort marqué Rituel se lance sans dépenser de
      charge dès que le personnage a la Capacité correspondante.</li>
      <li>Emplacements de sorts (1 à 9, SRD 5e) : calculés par classe et niveau, décomptés au
      lancer, restaurés au repos long — sauf Magie de Pacte (Occultiste, un seul palier actif),
      restaurée aussi au repos court. Si l'emplacement du niveau exact du sort est épuisé mais
      qu'un palier supérieur est disponible, le joueur peut choisir de surclasser (fenêtre de
      choix dédiée, aucune charge décomptée sans confirmation).</li>
      <li>Langues : Commune et langue d'Origine octroyées automatiquement à la création.</li>
      <li>Sorts/Capacités de classe : octroyés automatiquement à la création et à chaque montée
      de niveau (cf. page "Expérience et montée de niveau" ci-dessous).</li>
      <li>Réaction : une seule utilisable par round, régénérée automatiquement au début du tour
      du personnage tant qu'un combat est suivi (Suivi de combat de Foundry) — indicateur
      cliquable en en-tête de la fiche pour un rattrapage manuel si besoin (capacité qui rend une
      réaction bonus, correction d'un clic).</li>
      <li>Onglet Capacités/Sorts : en-tête visuel adapté à la classe du personnage (titre
      thématique, icône) — purement cosmétique, aucun effet sur les calculs.</li>
      <li>Attaque d'opportunité (règle universelle, octroyée à toute classe) : rappel automatique
      en chat quand un PNJ hostile quitte la portée de mêlée (1,50 m) d'un Combattant joueur avec
      réaction disponible. Le don Sentinelle, s'il est glissé sur la fiche, en modifie
      automatiquement le déclencheur affiché (fonctionne même contre le désengagement, se
      déclenche aussi pour une cible tierce à 1,50 m) — recalculé à chaque affichage, rien à
      retoucher si tu ajoutes/retires le don.</li>
      <li>Combat monté (don) : avantage automatique aux jets d'attaque contre une cible plus
      petite que la monture ; rappel textuel sur les sauvegardes de Dextérité montées (résultat
      pour la monture laissé à ton jugement).</li>
      <li>Suivi de l'Action/Action bonus du tour : rappel de chat non-bloquant (jamais de jet
      refusé) si un personnage utilise deux fois la même ressource dans le même tour — actif
      uniquement pendant un combat suivi, deux indicateurs cliquables en en-tête de fiche pour un
      rattrapage manuel si besoin.</li>
      <li>Forme sauvage (Druide) : "Prendre forme" cible une créature dédiée (2e réserve de PV
      propre, jamais cumulée à celle du personnage). Retour à la forme normale automatique à 0 PV
      de forme (dégâts excédentaires jamais reportés sur le personnage), ou volontaire à tout
      moment via un bouton dédié.</li>
      <li>Tactiques défensives (Hunter, Rôdeur) : les 3 options sont appliquées automatiquement
      selon le choix fait — avantage à la sauvegarde contre Effrayé ou contre un attaquant ayant
      déjà attaqué ce round, ou désavantage sur le prochain jet d'un PNJ hostile dont le Rôdeur
      s'éloigne.</li>
      <li>Mécaniques des 24 sous-classes supplémentaires (inspirées de Baldur's Gate 3, cf.
      compendium "Sous-classes") : bouton dédié selon la Capacité — tirage automatique de
      Surtenance sauvage posté en chat (Barbare/Ensorceleur), compagnon animal invocable (Maître
      des bêtes), choix d'esprit totem verrouillé (Voie du Cœur sauvage), critique automatique de
      l'Assassinat contre une cible portant l'état "Surpris", incantation mineure toujours prête
      sans emplacement dédié (Chevalier occulte)... Détail complet des mécaniques dans
      <code>world-items/README.md</code>.</li>
      <li>6 des 8 sous-classes SRD 5e d'origine ayant déjà une mécanique active en ont désormais
      une seconde : bonus de soin automatique (Disciple de la vie), résistance aux dégâts choisie
      (Résilience draconique), rappel de réaction contre les créatures Grandes+ (Tueur de géants),
      immunité Charmé/Effrayé (Rage sans esprit, Aura de dévotion), choix d'effet + sauvegarde
      (Technique de la Main Ouverte).</li>
      <li>Résistance/immunité/vulnérabilité aux dégâts : réglable librement (3 groupes de cases à
      cocher, 13 types SRD) sur toute fiche Personnage/PNJ, ET propre à chaque armure équipée
      (mêmes cases, indépendantes) — la meilleure protection l'emporte, résistance et
      vulnérabilité sur le même type s'annulent. Une case "Magique" sur une arme/le profil
      d'attaque d'un PNJ contourne UNIQUEMENT la résistance/l'immunité générique aux 3 types
      physiques (nuance SRD "contre les attaques non magiques") — jamais une résistance déjà
      propre à une Capacité (Rage...) ou à une armure. Une arme/attaque de PNJ peut aussi infliger
      un second type de dégâts bonus indépendant du premier (ex. épée de feu).</li>
      <li>Rage (Barbare) : avantage aux tests/sauvegardes de Force, +2 dégâts aux attaques de
      corps à corps à la Force, résistance aux dégâts contondants/perforants/tranchants — tant que
      l'état "En Rage" (onglet États) est actif, sans rien à recocher.</li>
      <li>Destruction des morts-vivants (Clerc 5) : "Repousser les morts-vivants" détruit
      directement un mort-vivant dont l'indice de dangerosité est sous le seuil de la table SRD
      pour ton niveau, au lieu de le repousser.</li>
      <li>Voile des anciens (Paladin, Serment des Anciens) : résistance aux dégâts de sorts en
      zone de 3 m autour du Paladin, tant que la bascule dédiée (onglet États) est active.</li>
      <li>Ennemi juré (Rôdeur 1) : choix ponctuel d'un type de créature favori (bouton "Choisir"),
      avantage automatique aux tests de Survie et d'Intelligence contre une cible ciblée de ce
      type.</li>
      <li>Traque implacable (Paladin, Serment de Vengeance 3) : bouton dédié qui désigne la cible
      actuellement ciblée comme proie ("Traqué") et consomme la réserve de Canalisation divine.
      Toute créature autre que ce Paladin subit alors un désavantage automatique à ses jets
      d'attaque contre elle — un état "Traqué" posé à la main depuis l'onglet États reste un
      simple marqueur, sans désavantage automatique associé.</li>
      <li>Application des dégâts d'un sort à sauvegarde : tient compte du résultat du jet de
      CHAQUE cible (réussite = moitié des dégâts si le sort le prévoit sinon aucun ; échec =
      dégâts pleins) — avec 2 exceptions automatisées, Évasion (Roublard 7 : réussite = aucun
      dégât, échec = moitié) et Tour de magie renforcé (Magicien Évocation 6 : réussite à un tour
      de magie = moitié au lieu d'aucun).</li>
      <li>Invisibilité/Invisibilité suprême et sorts similaires : basculent automatiquement leur
      état sur la cible au moment du lancer, sans jet associé.</li>
      <li>Agripper/Bousculer (règle universelle) : premier test opposé de ce système — bouton
      dédié qui lance l'Athlétisme de l'attaquant contre le meilleur des jets d'Athlétisme/
      Acrobaties de la cible. Agripper réussi pose l'état "Agrippé" ; Bousculer réussi propose de
      poser "À terre" (automatique) ou "Repoussé de 1,50 m" (simple rappel, aucun déplacement de
      token automatisé).</li>
      <li>Points d'inspiration (règle maison, distincte de l'Inspiration bardique) : compteur
      libre en en-tête de fiche, à accorder toi-même (champ verrouillé côté Joueur). Un Joueur en
      dépense un via un bouton sous un jet de caractéristique/compétence dans le chat : le jet
      d'origine disparaît, remplacé par un nouveau jet dont le résultat est toujours conservé.</li>
      <li>PNJ à plusieurs profils d'attaque : la fiche PNJ accepte désormais plusieurs attaques
      distinctes (ex. "Morsure" + "Griffe"), chacune avec son propre bouton Attaque/Dégâts, fidèle
      aux blocs de statistiques SRD 5e.</li>
    </ul>
    <h2>Compendium "Adversaires" — bestiaire prêt à l'emploi</h2>
    <p>15 PNJ déjà configurés (attaques + butin embarqué), visibles uniquement de toi : 7
    humanoïdes du FI 1/8 au FI 3 (Brigand, Maraudeur, Garde, Espion, Chef de brigands, Mercenaire
    vétéran, Chevalier) et 8 bêtes sauvages réelles du FI 0 au FI 1 (Rat, Corbeau, Loup, Sanglier,
    Serpent venimeux, Panthère, Crocodile, Ours brun) — aucune créature légendaire/mythique.
    Glisse-dépose directement depuis le compendium vers une scène, ou duplique le PNJ dans les
    Actors du monde pour le personnaliser avant de le déployer.</p>
    <h2>Ce qui reste à ton arbitrage</h2>
    <p>Certaines Capacités listent volontairement un effet à définir avec toi plutôt qu'une règle
    figée dans le code (cf. page "Capacités à arbitrer" ci-dessous) — ce système simplifie
    délibérément les mécaniques les plus lourdes du SRD 5e (cf. page "Simplifications
    assumées") pour rester fluide à table, quitte à te laisser trancher au cas par cas.</p>
  `;
}

async function buildAdjudicationPage() {
  const features = await loadJson("world-items/features.json");
  const flagged = features.filter((feature) => /\bMJ\b|Simplifié/.test(feature.system.description));
  const rows = flagged
    .map(
      (feature) =>
        `<dt><strong>${feature.name}</strong> <em>(${feature.system.class}, niveau ${feature.system.level ?? 1})</em></dt>
        <dd>${feature.system.description}</dd>`
    )
    .join("");
  return `
    <p>Ces Capacités mentionnent explicitement un effet à trancher avec toi (pas de liste
    d'options figée dans ce système) ou une simplification assumée par rapport au SRD 5e complet.
    Généré automatiquement depuis <code>world-items/features.json</code> : reste à jour si son
    contenu évolue.</p>
    <dl>${rows}</dl>
  `;
}

function buildSimplificationsPage() {
  return `
    <p>Ce système s'écarte volontairement du SRD 5e complet sur plusieurs points, pour rester
    simple à suivre en jeu :</p>
    <ul>
      <li><strong>Sorts connus</strong> : un lanceur a accès à toute la liste de sorts de sa classe
      jusqu'à son niveau maximum accessible (octroyés automatiquement), plutôt que les tables
      "sorts connus" propres à chaque classe (Barde/Ensorceleur/Occultiste/Magicien).</li>
      <li><strong>Multiclassage</strong> : non géré par ce système (un seul champ Classe par
      personnage).</li>
      <li><strong>Points de Ki / Sorcellerie innée</strong> : réserves fixes, ne progressent pas
      avec le niveau dans ce système (simplifié par rapport au SRD 5e).</li>
      <li><strong>Forme sauvage (Druide)</strong> : une créature dédiée sert de 2e réserve de PV
      (bouton "Prendre forme"), mais sa CA/ses attaques précises et la restriction "pas de sorts
      en Forme sauvage" restent à ton arbitrage — pas de fiche de créature figée par forme.</li>
      <li><strong>Domaines divins / Sous-classes / Voies / Cercles</strong> : les 12 sous-classes
      SRD 5e d'origine (une par classe) restent majoritairement génériques (Canalisation divine,
      Forme sauvage etc. non automatisées en détail) — à l'inverse, les 24 sous-classes
      supplémentaires (inspirées de Baldur's Gate 3, cf. compendium "Sous-classes") apportent
      chacune un bouton dédié sur la fiche avec un mécanisme actif propre (jet à charges limitées,
      réserve de Ki, état à activer ou à poser manuellement, tirage automatique de Surtenance
      sauvage...).</li>
      <li><strong>Réaction</strong> : le système suit uniquement l'économie d'action (1 par
      round, régénérée au bon moment) — il ne détecte jamais automatiquement le déclencheur d'une
      Capacité/d'un Sort "Réaction" (ex. "une créature quitte votre portée") : à toi de valider
      que la situation s'est bien produite avant que le joueur clique. Hors combat suivi par le
      Suivi de combat, rien ne régénère automatiquement une réaction consommée — seul un clic
      manuel sur l'indicateur de l'en-tête la rétablit. Le suivi de l'Action/Action bonus est
      volontairement **non-bloquant** (simple rappel, jamais un jet refusé), contrairement à la
      réaction.</li>
      <li><strong>Compendium Classes</strong> : les champs sauvegardes/compétences/maîtrises
      visibles sur chaque Item Classe sont informatifs — les modifier n'a aucun effet sur les
      calculs de la fiche de personnage (dé de vie, sauvegardes appliquées...), qui restent
      pilotés par <code>scripts/helpers/config.js</code>.</li>
    </ul>
  `;
}

async function buildProgressionPage() {
  const rows = DND_CUSTOM.xpThresholds
    .map((xp, index) => `<tr><td>${index + 1}</td><td>${xp.toLocaleString("fr-FR")}</td></tr>`)
    .join("");
  const crRows = DND_CUSTOM.challengeRatings
    .map((cr) => `<tr><td>${cr}</td><td>${DND_CUSTOM.challengeRatingXp[cr].toLocaleString("fr-FR")}</td></tr>`)
    .join("");
  return `
    <h2>Distribuer de l'XP</h2>
    <p>Via la macro monde "Attribuer de l'XP", ou le bouton "Distribuer l'XP" d'une fiche PNJ
    (montant pré-rempli depuis son indice de dangerosité). Réparti également entre les personnages
    cochés, jamais révélé aux joueurs dans le chat (chuchoté MJ uniquement).</p>
    <p>Le total d'XP de chaque personnage est visible en permanence dans l'en-tête de sa fiche,
    dans le champ "XP (MJ)" — réservé à ta vue, jamais affiché aux joueurs.</p>
    <h2>Table XP par niveau (SRD 5e)</h2>
    <table><thead><tr><th>Niveau</th><th>XP requis</th></tr></thead><tbody>${rows}</tbody></table>
    <h2>Indice de dangerosité (FI) → XP (PNJ)</h2>
    <p>Pré-remplit le champ XP rapporté d'une fiche PNJ selon sa FI (table SRD 5e) :</p>
    <table><thead><tr><th>FI</th><th>XP</th></tr></thead><tbody>${crRows}</tbody></table>
    <h2>Montée de niveau</h2>
    <p>Le bouton "Monter de niveau" n'apparaît sur la fiche que si l'XP accumulé atteint le seuil
    du niveau suivant. À l'usage, il octroie automatiquement les nouvelles Capacités/nouveaux
    Sorts de la classe, puis propose deux petites fenêtres de choix, l'une après l'autre selon le
    niveau atteint :</p>
    <ul>
      <li><strong>Sous-classe</strong> (niveau propre à chaque classe, SRD 5e — 1 pour Clerc/
      Ensorceleur/Occultiste, 2 pour Druide/Magicien, 3 pour les 8 autres) : liste les sous-classes
      de la classe du personnage, description complète affichée. Ne se propose plus une fois le
      choix fait (verrouillé) ; tant qu'il n'a pas encore été fait, la fenêtre revient à chaque
      montée de niveau suivante, et le sélecteur permanent de l'en-tête reste aussi disponible en
      secours si elle est fermée sans choisir.</li>
      <li><strong>Amélioration de caractéristiques ou Don</strong> (niveaux 4, 8, 12, 16 et 19,
      SRD 5e) : +2 sur une caractéristique/+1 sur deux, ou un Don (règle optionnelle) parmi ceux
      du compendium "Dons" que le personnage ne possède pas déjà, description complète affichée
      pour décider.</li>
    </ul>
    <p>Le champ Niveau reste aussi éditable directement par toi (override manuel, ex. pour
    corriger une erreur) — dans ce cas, ni l'octroi automatique de contenu ni ces fenêtres de
    choix ne se déclenchent.</p>
  `;
}

/** Crée (une seule fois, si absent) le Journal "Guide du MJ" à plusieurs pages, visible
 *  uniquement du MJ (ownership.default: NONE, explicite — jamais de fuite vers les joueurs même
 *  si le comportement par défaut de Foundry venait à changer). N'écrase jamais un Journal
 *  existant du même nom, même principe que ensurePlayerGuideJournal/ensureOriginsJournal.
 *  Contenu partiellement dérivé de world-items/features.json et scripts/helpers/config.js :
 *  reste synchronisé si ces fichiers évoluent. */
export async function ensureGmGuideJournal() {
  if (!game.user.isGM) return;

  const title = game.i18n.localize("DND_CUSTOM.Journal.GmGuideTitle");
  if (game.journal.getName(title)) return;

  const pages = [
    { titleKey: "DND_CUSTOM.Journal.GmGuidePageOverview", content: buildOverviewPage() },
    { titleKey: "DND_CUSTOM.Journal.GmGuidePageAdjudication", content: await buildAdjudicationPage() },
    { titleKey: "DND_CUSTOM.Journal.GmGuidePageSimplifications", content: buildSimplificationsPage() },
    { titleKey: "DND_CUSTOM.Journal.GmGuidePageProgression", content: await buildProgressionPage() }
  ];

  await JournalEntry.create({
    name: title,
    ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE },
    pages: pages.map(({ titleKey, content }, index) => ({
      name: game.i18n.localize(titleKey),
      type: "text",
      sort: (index + 1) * 100,
      text: { format: 1, content }
    }))
  });
}
