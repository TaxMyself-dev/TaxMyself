export interface FilterOption {
  id: string;
  label: string;
}

export interface FilterGroup {
  groupId: string;
  groupLabel: string;
  items: FilterOption[];
}

export type FlowFilterScreen =
  | 'main'
  | 'categories'
  | 'subCategories'
  | 'businesses'
  | 'paymentMethods';
