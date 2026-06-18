/** Supabase publishable key (browser). Falls back to legacy anon key names. */
export function resolvePublishableKey(): string | undefined {
  return (
    process.env.VITE_EREGNA_SUPABASE_PUBLISHABLE_KEY ??
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
    process.env.VITE_EREGNA_SUPABASE_ANON_KEY ??
    process.env.VITE_SUPABASE_ANON_KEY
  );
}

/** Supabase secret key (server). Falls back to legacy service_role key name. */
export function resolveSecretKey(): string | undefined {
  return (
    process.env.EREGNA_SUPABASE_SECRET_KEY ??
    process.env.EREGNA_SUPABASE_SERVICE_ROLE_KEY
  );
}
