import { createClient } from "@supabase/supabase-js"
import type { Database } from "./types.js"

// Browser client (uses anon key — RLS enforced)
export function createBrowserClient() {
  return createClient<Database>(
    process.env.VITE_EREGNA_SUPABASE_URL!,
    process.env.VITE_EREGNA_SUPABASE_ANON_KEY!,
  )
}

// Server / API client (uses service-role key — RLS bypassed)
export function createServerClient() {
  return createClient<Database>(
    process.env.EREGNA_SUPABASE_URL!,
    process.env.EREGNA_SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}
