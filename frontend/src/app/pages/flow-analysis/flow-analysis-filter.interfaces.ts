export interface FilterOption {
  id: string;
  label: string;
}

export interface FilterGroup {
  groupId: string;
  groupLabel: string;
  items: FilterOption[];
}
