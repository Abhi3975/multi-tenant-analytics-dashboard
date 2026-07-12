import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Privileged Supabase client that uses the service role key and BYPASSES Row
 * Level Security. Never import this into client code. Use only in trusted
 * server contexts (e.g. webhooks, audit logging, admin tasks).
 */
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}
