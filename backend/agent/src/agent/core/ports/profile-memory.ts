/** Canonical owner-scoped profile shared by all agent interfaces. */
export interface UserProfileSnapshot {
  businessNumber: string;
  version: { person: number; business: number };
  story: { person: string; business: string; narrative?: string };
  fields: readonly {
    key: string;
    scope: string;
    label: string;
    question: string;
    value: string | null;
    state: string;
  }[];
  facts: readonly UserProfileFact[];
  missing: readonly string[];
}

/** A canonical fact with separately recorded validity and reporting time. */
export interface UserProfileFact {
  id: string;
  field_key: string | null;
  scope_kind: string;
  statement: string;
  value_text: string | null;
  status: string;
  effective_date: string | null;
  date_precision: string;
  valid_to_text: string | null;
  recorded_at: string;
}

/** The shared profile store supplied by the verified request's host. */
export interface UserProfileMemory {
  read: (businessNumber: string) => Promise<UserProfileSnapshot>;
  update: (input: {
    businessNumber: string;
    version: { person: number; business: number };
    message: string;
    extraction: unknown;
    operationId: string;
  }) => Promise<UserProfileSnapshot>;
}
