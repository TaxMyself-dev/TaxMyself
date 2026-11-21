// EXAMPLE plans: the agent's readAppKnowledge reads them, so it quotes the
// same prices the pricing page shows. Load them from your pricing page's own
// source, never a copy.

/**
 * One plan as the pricing page sells it.
 */
export interface PricingPlan {
  name: string;
  price: number;
  audience: string;
  features: string[];
}

/**
 * The plans, in the pricing page's order.
 *
 * @returns The plans.
 */
export const getPricingPlans = (): PricingPlan[] => [
  {
    name: "Starter",
    price: 0,
    audience: "One person trying it",
    features: ["The agent", "Tasks"],
  },
];
