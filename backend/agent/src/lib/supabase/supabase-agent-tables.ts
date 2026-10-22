import type { Json } from "./supabase-json";
import type { SupabaseTable } from "./supabase-table";

/**
 * The agent's chats, memory and usage
 * (supabase/migrations/20261004125016_agent_memory.sql).
 */
export interface SupabaseAgentTables {
  agent_chat_conversations: SupabaseTable<
    {
      active_stream_id: string | null;
      answering_until: string | null;
      created_at: string;
      id: string;
      name: string | null;
      pinned: boolean;
      updated_at: string;
      user_id: string;
    },
    {
      active_stream_id?: string | null;
      answering_until?: string | null;
      created_at?: string;
      id?: string;
      name?: string | null;
      pinned?: boolean;
      updated_at?: string;
      user_id?: string;
    },
    []
  >;
  agent_chat_stream_chunks: SupabaseTable<
    {
      chunk: string;
      conversation_id: string;
      created_at: string;
      seq: number;
      stream_id: string;
      user_id: string;
    },
    {
      chunk: string;
      conversation_id: string;
      created_at?: string;
      seq: number;
      stream_id: string;
      user_id?: string;
    },
    []
  >;
  agent_chat_steers: SupabaseTable<
    {
      conversation_id: string;
      created_at: string;
      id: string;
      stream_id: string;
      text: string;
      user_id: string;
    },
    {
      conversation_id: string;
      created_at?: string;
      id: string;
      stream_id: string;
      text: string;
      user_id?: string;
    },
    []
  >;
  agent_memories: SupabaseTable<
    {
      content: string;
      conversation_id: string | null;
      created_at: string;
      id: string;
      updated_at: string;
      user_id: string;
    },
    {
      content: string;
      conversation_id?: string | null;
      created_at?: string;
      id?: string;
      updated_at?: string;
      user_id?: string;
    },
    []
  >;
  agent_usage: SupabaseTable<
    {
      cached_input_tokens: number;
      conversation_id: string | null;
      created_at: string;
      id: string;
      input_tokens: number;
      kind: string;
      model: string;
      output_tokens: number;
      reasoning_tokens: number;
      steps: number;
      user_id: string;
    },
    {
      cached_input_tokens?: number;
      conversation_id?: string | null;
      created_at?: string;
      id?: string;
      input_tokens?: number;
      kind: string;
      model: string;
      output_tokens?: number;
      reasoning_tokens?: number;
      steps?: number;
      user_id?: string;
    },
    []
  >;
  // finished_at: supabase/migrations/20261013050000_agent_chat_message_finished_at.sql
  agent_chat_messages: SupabaseTable<
    {
      conversation_id: string;
      created_at: string;
      finished_at: string | null;
      id: string;
      parts: Json;
      role: string;
      user_id: string;
    },
    {
      conversation_id: string;
      created_at?: string;
      finished_at?: string | null;
      id?: string;
      parts: Json;
      role: string;
      user_id?: string;
    },
    [
      {
        foreignKeyName: "agent_chat_messages_conversation_id_fkey";
        columns: ["conversation_id"];
        isOneToOne: false;
        referencedRelation: "agent_chat_conversations";
        referencedColumns: ["id"];
      },
    ]
  >;
  // supabase/migrations/20261013040000_agent_chat_documents.sql
  agent_chat_documents: SupabaseTable<
    {
      content: string;
      conversation_id: string;
      created_at: string;
      filename: string;
      id: string;
      user_id: string;
    },
    {
      content: string;
      conversation_id: string;
      created_at?: string;
      filename: string;
      id?: string;
      user_id?: string;
    },
    [
      {
        foreignKeyName: "agent_chat_documents_conversation_id_fkey";
        columns: ["conversation_id"];
        isOneToOne: false;
        referencedRelation: "agent_chat_conversations";
        referencedColumns: ["id"];
      },
    ]
  >;
}
