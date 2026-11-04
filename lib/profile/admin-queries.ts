import "server-only";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { avatarUrl } from "./avatars";
import { initialsOf, type AccountType } from "./queries";

/** How many accounts one page of `/admin/users` shows. */
export const ADMIN_USERS_PAGE_SIZE = 50;

export type AdminUserRow = {
  id: string;
  handle: string;
  name: string;
  initials: string;
  avatarUrl: string | null;
  email: string;
  phone: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  accountType: AccountType;
  isAdmin: boolean;
  city: string | null;
  club: string | null;
  isPublic: boolean;
  joinedAt: string;
  /** Null for an account that has never signed in. */
  lastSignInAt: string | null;
};

/**
 * One page of accounts, newest first, and how many match in all.
 *
 * Throws on a failed read, so the page shows its error screen rather than
 * reporting that there are no users. That includes a caller who is not a
 * platform admin: `admin_list_users()` checks the role.
 */
export async function listAdminUsers(
  query: string,
  page: number,
): Promise<{ rows: AdminUserRow[]; total: number }> {
  if (!hasSupabaseEnv()) return { rows: [], total: 0 };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_list_users", {
    p_query: query.trim() || undefined,
    p_limit: ADMIN_USERS_PAGE_SIZE,
    p_offset: (page - 1) * ADMIN_USERS_PAGE_SIZE,
  });
  if (error) throw new Error(`admin_list_users failed: ${error.message}`);

  return {
    rows: data.map((r) => ({
      id: r.id,
      handle: r.handle,
      name: r.full_name,
      initials: initialsOf(r.full_name),
      avatarUrl: avatarUrl(r.avatar_path),
      email: r.email,
      phone: r.phone,
      emergencyContactName: r.emergency_contact_name,
      emergencyContactPhone: r.emergency_contact_phone,
      accountType: r.account_type,
      isAdmin: r.is_admin,
      city: r.city,
      club: r.club,
      isPublic: r.is_public,
      joinedAt: r.created_at,
      lastSignInAt: r.last_sign_in_at,
    })),
    total: Number(data[0]?.total_count ?? 0),
  };
}
