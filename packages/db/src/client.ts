import { createClient } from "@supabase/supabase-js"
import type { Database } from "./types.js"
import { resolvePublishableKey, resolveSecretKey } from "./env.js"

// Browser client (publishable key — RLS enforced)
export function createBrowserClient() {
  return createClient<Database>(
    process.env.VITE_EREGNA_SUPABASE_URL!,
    resolvePublishableKey()!,
  )
}

// Server / API client (secret key — RLS bypassed)
export function createServerClient() {
  return createClient<Database>(
    process.env.EREGNA_SUPABASE_URL!,
    resolveSecretKey()!,
    { auth: { persistSession: false } },
  )
}
