/**
 * Arrays are readonly so decoded (readonly) schema values can be written as
 * they are; Supabase only serializes them.
 */
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | readonly Json[];
