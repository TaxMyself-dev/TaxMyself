/**
 * One table of the Supabase Database type. Update defaults to every Insert
 * column made optional, as `supabase gen types` writes it; a table whose
 * update policy narrows the columns passes its own Update.
 */
export interface SupabaseTable<
  Row,
  Insert,
  Relationships,
  Update = Partial<Insert>,
> {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: Relationships;
}
