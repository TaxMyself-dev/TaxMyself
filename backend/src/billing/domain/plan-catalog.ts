import { SubscriptionPlan } from '../entities/subscription-plan.entity';

type CatalogPlan = Pick<SubscriptionPlan, 'id' | 'slug' | 'isPublic'>;

/** Plan visibility is based on the assigned catalog, never banking connection state. */
export function isPlanInCatalog(current: CatalogPlan | null, target: CatalogPlan): boolean {
  if (!current || current.isPublic !== false) return target.isPublic !== false;
  if (target.isPublic !== false) return false;
  if (current.slug?.startsWith('referral-')) return target.slug?.startsWith('referral-') === true;
  return target.id === current.id;
}
