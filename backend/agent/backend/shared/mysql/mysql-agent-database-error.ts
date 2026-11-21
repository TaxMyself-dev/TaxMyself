import { Schema } from "effect";

/**
 * The agent's MySQL database was requested without its configuration
 * (mysql-agent-database.ts). Its message,
 * `DATABASE_NOT_CONFIGURED: Set <keys>.`, names the missing environment
 * variables.
 */
export class DatabaseNotConfiguredError extends Schema.TaggedError<
  DatabaseNotConfiguredError,
  { readonly brand: unique symbol }
>()("DatabaseNotConfiguredError", { keys: Schema.String }) {
  /**
   * The error as `DATABASE_NOT_CONFIGURED: Set <keys>.`, naming the missing
   * settings.
   *
   * @returns The message.
   */
  override get message() {
    return `DATABASE_NOT_CONFIGURED: Set ${this.keys}.`;
  }
}
