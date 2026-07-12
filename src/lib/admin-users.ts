import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Helpers to bridge auth.users (not reachable via RLS/PostgREST) using the
 * service role. Used only by trusted server actions/pages for showing member
 * emails and resolving an invite email to a user id.
 *
 * For a real product you'd paginate / search server-side; the seeded dataset is
 * tiny, so a single page is fine here.
 */

export async function findUserIdByEmail(email: string): Promise<string | null> {
  const admin = createAdminClient();
  const target = email.trim().toLowerCase();
  const { data, error } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (error) throw new Error(error.message);
  const match = data.users.find((u) => u.email?.toLowerCase() === target);
  return match?.id ?? null;
}

/** Map of user id -> email for the given ids. */
export async function emailsByIds(
  ids: string[]
): Promise<Record<string, string>> {
  if (ids.length === 0) return {};
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (error) throw new Error(error.message);
  const wanted = new Set(ids);
  const out: Record<string, string> = {};
  for (const u of data.users) {
    if (wanted.has(u.id)) out[u.id] = u.email ?? u.id;
  }
  return out;
}
