import type { Json } from "./supabase-json";

// The database functions the app and the worker call (supabase.rpc), as
// Supabase's generator writes them; supabase-database.ts names them under
// public.Functions.

/**
 * The public schema's functions: each one's arguments and what it returns.
 */
export interface SupabaseFunctions {
  arrange_tracking_tasks: {
    Args: { arranged: Json };
    Returns: undefined;
  };
  change_tracking_tasks: {
    Args: {
      task_ids: string[];
      new_status: string | null;
      new_priority: string | null;
    };
    Returns: undefined;
  };
  claim_due_tracking_tasks: {
    Args: { lease_seconds: number; claim_limit: number };
    Returns: {
      run_id: string;
      id: string;
      user_id: string;
      sentence: string;
      details: string;
      location: string;
      budget: string;
      sources: Json;
      alerts: boolean;
      last_scanned_at: string | null;
    }[];
  };
  finish_task_scan: {
    Args: { scan_run_id: string; scan_error: string | null };
    Returns: undefined;
  };
  record_task_source_scan: {
    Args: {
      scan_run_id: string;
      items: Json;
      scores: Json;
      opportunities: Json;
    };
    Returns: number;
  };
  renew_task_scan_claim: {
    Args: { scan_run_id: string; lease_seconds: number };
    Returns: undefined;
  };
  release_task_scan: {
    Args: { scan_run_id: string };
    Returns: undefined;
  };
  claim_agent_chat_answer: {
    Args: {
      chat_id: string;
      chat_name: string | null;
      chat_pinned: boolean;
      answer_stream_id: string;
      lease_seconds: number;
    };
    Returns: { status: string; answering_until: string | null }[];
  };
  list_agent_chat_conversations: {
    Args: Record<string, never>;
    Returns: {
      id: string;
      name: string | null;
      pinned: boolean;
      created_at: string;
      first_text: string | null;
      has_messages: boolean;
    }[];
  };
  search_agent_chat_conversations: {
    Args: { words: string };
    Returns: { conversation_id: string }[];
  };
}
