// Tracking tasks and what the monitor finds for them
// (supabase/agent-schema.sql, its tracking tasks half).
import type { Json } from "./supabase-json";
import type { SupabaseTable } from "./supabase-table";

/**
 * The Supabase tables of tracking tasks: the tasks, their scans, scored
 * items, the items themselves, opportunities and notifications.
 */
export interface SupabaseTaskTables {
  tracking_tasks: SupabaseTable<
    {
      alerts: boolean;
      budget: string;
      created_at: string;
      details: string;
      id: string;
      labels: string[];
      last_scan_error: string | null;
      last_scanned_at: string | null;
      location: string;
      position: number;
      priority: string;
      scan_claimed_until: string | null;
      scan_failures: number;
      scan_frequency: string;
      scan_retry_at: string | null;
      sentence: string;
      sources: Json;
      status: string;
      updated_at: string;
      user_id: string;
      version: number;
    },
    {
      alerts?: boolean;
      budget?: string;
      created_at?: string;
      details?: string;
      id?: string;
      labels?: string[];
      last_scan_error?: string | null;
      last_scanned_at?: string | null;
      location?: string;
      position?: number;
      priority?: string;
      scan_claimed_until?: string | null;
      scan_failures?: number;
      scan_frequency?: string;
      scan_retry_at?: string | null;
      sentence: string;
      sources?: Json;
      status?: string;
      updated_at?: string;
      user_id?: string;
      version?: number;
    },
    []
  >;
  // The items the sources returned, for their opportunities' cards; written
  // by record_task_source_scan only.
  task_items: SupabaseTable<
    {
      found_at: string;
      item_id: string;
      snapshot: Json;
      source: string;
      user_id: string;
    },
    {
      found_at?: string;
      item_id: string;
      snapshot: Json;
      source: string;
      user_id: string;
    },
    []
  >;
  task_scanned_items: SupabaseTable<
    {
      item_id: string;
      jev_answers: Json | null;
      scanned_at: string;
      score: number;
      source: string;
      task_id: string;
    },
    {
      item_id: string;
      jev_answers?: Json | null;
      scanned_at?: string;
      score: number;
      source: string;
      task_id: string;
    },
    []
  >;
  task_opportunities: SupabaseTable<
    {
      comment_id: string;
      found_at: string;
      id: string;
      intent: string;
      item_id: string;
      posted_at: string | null;
      reason: string;
      score: number;
      source: string;
      status: string;
      task_id: string;
      updated_at: string;
      user_id: string;
    },
    {
      comment_id?: string;
      found_at?: string;
      id?: string;
      intent: string;
      item_id: string;
      posted_at?: string | null;
      reason: string;
      score: number;
      source: string;
      status?: string;
      task_id: string;
      updated_at?: string;
      user_id: string;
    },
    [
      {
        foreignKeyName: "task_opportunities_task_id_fkey";
        columns: ["task_id"];
        isOneToOne: false;
        referencedRelation: "tracking_tasks";
        referencedColumns: ["id"];
      },
      {
        foreignKeyName: "task_opportunities_user_id_source_item_id_fkey";
        columns: ["user_id", "source", "item_id"];
        isOneToOne: false;
        referencedRelation: "task_items";
        referencedColumns: ["user_id", "source", "item_id"];
      },
    ]
  >;
  user_notifications: SupabaseTable<
    {
      body: string;
      created_at: string;
      id: string;
      kind: string;
      opportunity_id: string | null;
      read_at: string | null;
      task_id: string | null;
      title: string;
      user_id: string;
    },
    {
      body?: string;
      created_at?: string;
      id?: string;
      kind: string;
      opportunity_id?: string | null;
      read_at?: string | null;
      task_id?: string | null;
      title: string;
      user_id: string;
    },
    []
  >;
  task_scan_runs: SupabaseTable<
    {
      error: string | null;
      finished_at: string | null;
      id: string;
      items_scored: number;
      matches: number;
      sources_scanned: number;
      started_at: string;
      status: string;
      task_id: string;
      user_id: string;
    },
    {
      error?: string | null;
      finished_at?: string | null;
      id?: string;
      items_scored?: number;
      matches?: number;
      sources_scanned?: number;
      started_at?: string;
      status?: string;
      task_id: string;
      user_id: string;
    },
    []
  >;
}
