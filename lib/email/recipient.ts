import "server-only";
import { DEFAULT_LOCALE, isLocale, type Locale } from "@/lib/i18n/config";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Who an account-holder is, for writing to them: their sign-in address, the
 * name on their profile and the language they last used. Read with the
 * service role, since an address lives on the auth record.
 */
export type Recipient = { email: string | null; name: string; locale: Locale };

export async function getRecipient(userId: string): Promise<Recipient> {
  const admin = createAdminClient();
  const [{ data: user }, { data: profile }, { data: prefs }] = await Promise.all([
    admin.auth.admin.getUserById(userId),
    admin.from("profiles").select("full_name").eq("id", userId).maybeSingle(),
    admin.from("profile_private").select("locale").eq("id", userId).maybeSingle(),
  ]);
  return {
    email: user?.user?.email ?? null,
    name: profile?.full_name ?? "",
    locale: prefs && isLocale(prefs.locale) ? prefs.locale : DEFAULT_LOCALE,
  };
}

/** Only the language: for a runner, whose registration carries their address. */
export async function getLocaleOf(userId: string): Promise<Locale> {
  const { data } = await createAdminClient()
    .from("profile_private")
    .select("locale")
    .eq("id", userId)
    .maybeSingle();
  return data && isLocale(data.locale) ? data.locale : DEFAULT_LOCALE;
}

/** The language of each of many accounts, keyed by id. */
export async function getLocalesOf(userIds: string[]): Promise<Map<string, Locale>> {
  const locales = new Map<string, Locale>();
  if (!userIds.length) return locales;
  const { data } = await createAdminClient()
    .from("profile_private")
    .select("id, locale")
    .in("id", [...new Set(userIds)]);
  for (const row of data ?? []) {
    if (isLocale(row.locale)) locales.set(row.id, row.locale);
  }
  return locales;
}

export type ConfirmedRunner = {
  email: string;
  firstName: string;
  name: string;
  amount: number;
  locale: Locale;
};

/** Everyone holding a confirmed spot at an event, in their own language. */
export async function getConfirmedRunners(eventId: string): Promise<ConfirmedRunner[]> {
  const { data, error } = await createAdminClient()
    .from("registrations")
    .select("runner_id, email, first_name, last_name, amount")
    .eq("event_id", eventId)
    .eq("status", "confirmed");
  if (error) throw new Error(error.message);
  if (!data?.length) return [];

  const locales = await getLocalesOf(data.map((r) => r.runner_id));
  return data.map((r) => ({
    email: r.email,
    firstName: r.first_name,
    name: `${r.first_name} ${r.last_name}`,
    amount: Number(r.amount),
    locale: locales.get(r.runner_id) ?? DEFAULT_LOCALE,
  }));
}
