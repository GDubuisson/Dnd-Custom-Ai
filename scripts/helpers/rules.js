import { DND_CUSTOM } from "./config.js";

/** Modificateur de caractéristique, SRD 5e : floor((score - 10) / 2). */
export function abilityModifier(score) {
  return Math.floor((score - 10) / 2);
}

/** Bonus de maîtrise selon le niveau, SRD 5e : ceil(niveau / 4) + 1 (2 aux niveaux 1-4). */
export function proficiencyBonus(level) {
  return Math.ceil(level / 4) + 1;
}

/** Capacité de charge, SRD 5e (règle "Détaillée") : Force x 15 lb (soit x 7,5 kg). */
export function carryingCapacity(strengthScore, unit = "lb") {
  return strengthScore * DND_CUSTOM.carryCapacityPerStrength[unit];
}

/** Poids total transporté : somme(quantité x poids unitaire) sur tous les objets physiques de l'Actor. */
export function carriedWeight(items) {
  return items.reduce((total, item) => {
    const weight = item.system?.weight ?? 0;
    const quantity = item.system?.quantity ?? 1;
    return total + weight * quantity;
  }, 0);
}

/** Richesse totale exprimée en équivalent Pièces de Cuivre. */
export function currencyTotalInCopper(currency) {
  return Object.entries(currency).reduce((total, [denomination, amount]) => {
    return total + amount * (DND_CUSTOM.currencyToCopper[denomination] ?? 0);
  }, 0);
}

export function formatModifier(mod) {
  return mod >= 0 ? `+${mod}` : `${mod}`;
}