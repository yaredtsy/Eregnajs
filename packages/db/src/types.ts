export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          email: string
          full_name: string | null
          avatar_url: string | null
          plan: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          email: string
          full_name?: string | null
          avatar_url?: string | null
          plan?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          email?: string
          full_name?: string | null
          avatar_url?: string | null
          plan?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      agents: {
        Row: {
          id: string
          owner_id: string
          name: string
          description: string | null
          website_url: string
          public_id: string
          secret_key: string
          model: string
          system_prompt: string | null
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          owner_id: string
          name: string
          description?: string | null
          website_url: string
          public_id: string
          secret_key: string
          model?: string
          system_prompt?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          owner_id?: string
          name?: string
          description?: string | null
          website_url?: string
          public_id?: string
          secret_key?: string
          model?: string
          system_prompt?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agents_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pages: {
        Row: {
          id: string
          agent_id: string
          path: string
          parent_id: string | null
          title: string
          url_pattern: string | null
          description: string | null
          sort_order: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          agent_id: string
          path: string
          parent_id?: string | null
          title: string
          url_pattern?: string | null
          description?: string | null
          sort_order?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          agent_id?: string
          path?: string
          parent_id?: string | null
          title?: string
          url_pattern?: string | null
          description?: string | null
          sort_order?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pages_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pages_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "pages"
            referencedColumns: ["id"]
          },
        ]
      }
      elements: {
        Row: {
          id: string
          page_id: string
          path: string
          parent_id: string | null
          label: string
          dom_id: string | null
          css_selector: string | null
          xpath: string | null
          description: string | null
          notes: string | null
          embedding: string | null
          sort_order: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          page_id: string
          path: string
          parent_id?: string | null
          label: string
          dom_id?: string | null
          css_selector?: string | null
          xpath?: string | null
          description?: string | null
          notes?: string | null
          embedding?: string | null
          sort_order?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          page_id?: string
          path?: string
          parent_id?: string | null
          label?: string
          dom_id?: string | null
          css_selector?: string | null
          xpath?: string | null
          description?: string | null
          notes?: string | null
          embedding?: string | null
          sort_order?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "elements_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "pages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "elements_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "elements"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          id: string
          agent_id: string
          visitor_id: string | null
          visitor_meta: Json | null
          page_url: string | null
          page_title: string | null
          created_at: string
          last_active_at: string
        }
        Insert: {
          id?: string
          agent_id: string
          visitor_id?: string | null
          visitor_meta?: Json | null
          page_url?: string | null
          page_title?: string | null
          created_at?: string
          last_active_at?: string
        }
        Update: {
          id?: string
          agent_id?: string
          visitor_id?: string | null
          visitor_meta?: Json | null
          page_url?: string | null
          page_title?: string | null
          created_at?: string
          last_active_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          id: string
          conversation_id: string
          role: string
          content: string
          retrieved_elements: string[] | null
          model: string | null
          token_usage: Json | null
          latency_ms: number | null
          created_at: string
        }
        Insert: {
          id?: string
          conversation_id: string
          role: string
          content: string
          retrieved_elements?: string[] | null
          model?: string | null
          token_usage?: Json | null
          latency_ms?: number | null
          created_at?: string
        }
        Update: {
          id?: string
          conversation_id?: string
          role?: string
          content?: string
          retrieved_elements?: string[] | null
          model?: string | null
          token_usage?: Json | null
          latency_ms?: number | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      walkthrough_sessions: {
        Row: {
          id: string
          agent_id: string
          visitor_id: string | null
          visitor_meta: Json | null
          page_url: string | null
          created_at: string
          last_active_at: string
        }
        Insert: {
          id?: string
          agent_id: string
          visitor_id?: string | null
          visitor_meta?: Json | null
          page_url?: string | null
          created_at?: string
          last_active_at?: string
        }
        Update: {
          id?: string
          agent_id?: string
          visitor_id?: string | null
          visitor_meta?: Json | null
          page_url?: string | null
          created_at?: string
          last_active_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "walkthrough_sessions_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
        ]
      }
      session_messages: {
        Row: {
          id: string
          session_id: string
          role: string
          created_at: string
        }
        Insert: {
          id?: string
          session_id: string
          role: string
          created_at?: string
        }
        Update: {
          id?: string
          session_id?: string
          role?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_messages_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "walkthrough_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      message_text_parts: {
        Row: {
          id: string
          message_id: string
          part_index: number
          text: string
          created_at: string
        }
        Insert: {
          id?: string
          message_id: string
          part_index?: number
          text: string
          created_at?: string
        }
        Update: {
          id?: string
          message_id?: string
          part_index?: number
          text?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_text_parts_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "session_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      walkthroughs: {
        Row: {
          id: string
          message_id: string
          plan_goal: string
          plan_rationale: string | null
          stream_status: string
          parent_context: Json | null
          created_at: string
        }
        Insert: {
          id?: string
          message_id: string
          plan_goal: string
          plan_rationale?: string | null
          stream_status?: string
          parent_context?: Json | null
          created_at?: string
        }
        Update: {
          id?: string
          message_id?: string
          plan_goal?: string
          plan_rationale?: string | null
          stream_status?: string
          parent_context?: Json | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "walkthroughs_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "session_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      walkthrough_steps: {
        Row: {
          id: string
          walkthrough_id: string
          step_index: number
          actions: Json
          popover: Json | null
          cumulative_ms: number
          created_at: string
        }
        Insert: {
          id?: string
          walkthrough_id: string
          step_index: number
          actions?: Json
          popover?: Json | null
          cumulative_ms?: number
          created_at?: string
        }
        Update: {
          id?: string
          walkthrough_id?: string
          step_index?: number
          actions?: Json
          popover?: Json | null
          cumulative_ms?: number
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "walkthrough_steps_walkthrough_id_fkey"
            columns: ["walkthrough_id"]
            isOneToOne: false
            referencedRelation: "walkthroughs"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: Record<string, never>
    Functions: {
      match_elements: {
        Args: {
          query_embedding: string
          agent_id_filter: string
          match_count?: number
          match_threshold?: number
        }
        Returns: {
          id: string
          page_id: string
          label: string
          description: string | null
          css_selector: string | null
          dom_id: string | null
          similarity: number
        }[]
      }
    }
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}

export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"]
export type TablesInsert<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Insert"]
export type TablesUpdate<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Update"]
