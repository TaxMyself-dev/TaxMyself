import { Schema } from "effect";

/**
 * A Supabase client was requested without its configuration
 * (backend/shared/supabase/supabase-service-database.ts). Its message,
 * `SUPABASE_NOT_CONFIGURED: Set <keys>.`, names the missing environment
 * variables.
 */
export class SupabaseNotConfiguredError extends Schema.TaggedError<
  SupabaseNotConfiguredError,
  { readonly brand: unique symbol }
>()("SupabaseNotConfiguredError", { keys: Schema.String }) {
  /**
   * The error as `SUPABASE_NOT_CONFIGURED: Set <keys>.`, naming the missing
   * settings.
   *
   * @returns The message.
   */
  override get message() {
    return `SUPABASE_NOT_CONFIGURED: Set ${this.keys}.`;
  }
}
