import "server-only";
import { DEFAULT_LOCALE, isLocale, type Locale } from "@/lib/i18n/config";
import { createAdminClient } from "@/lib/supabase/admin";
import { chunk, selectAll } from "@/lib/supabase/paginate";

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
  const settings = await getEmailSettingsOf(userIds);
  return new Map([...settings].map(([id, s]) => [id, s.locale]));
}

/**
 * The emails a runner can switch off in settings. Everything not listed here
 * — payments, refunds, removals, cancellations, kit shipping — always goes.
 */
export type EmailPreference = "reminders" | "results" | "updates";

export type EmailSettings = { locale: Locale } & Record<EmailPreference, boolean>;

const DEFAULT_SETTINGS: EmailSettings = {
  locale: DEFAULT_LOCALE,
  reminders: true,
  results: true,
  updates: true,
};

/**
 * Each account's language and email switches, keyed by id. An account with
 * no row gets the defaults: the default language, every email on.
 */
export async function getEmailSettingsOf(
  userIds: string[],
): Promise<Map<string, EmailSettings>> {
  const settings = new Map<string, EmailSettings>();
  if (!userIds.length) return settings;
  const admin = createAdminClient();
  // A few hundred ids per request: a whole race's runners in one `.in()`
  // would overflow the URL.
  const pages = await Promise.all(
    chunk([...new Set(userIds)]).map((ids) =>
      admin
        .from("profile_private")
        .select("id, locale, email_reminders, email_results, email_updates")
        .in("id", ids),
    ),
  );
  for (const row of pages.flatMap((p) => p.data ?? [])) {
    settings.set(row.id, {
      locale: isLocale(row.locale) ? row.locale : DEFAULT_LOCALE,
      reminders: row.email_reminders,
      results: row.email_results,
      updates: row.email_updates,
    });
  }
  for (const id of userIds) if (!settings.has(id)) settings.set(id, DEFAULT_SETTINGS);
  return settings;
}

/** One account's language and email switches. */
export async function getEmailSettingOf(userId: string): Promise<EmailSettings> {
  return (await getEmailSettingsOf([userId])).get(userId) ?? DEFAULT_SETTINGS;
}

export type ConfirmedRunner = {
  email: string;
  firstName: string;
  name: string;
  amount: number;
  locale: Locale;
};

/**
 * Everyone holding a confirmed spot at an event, in their own language. With
 * `only`, the runners who switched that email off are left out.
 */
export async function getConfirmedRunners(
  eventId: string,
  { only }: { only?: EmailPreference } = {},
): Promise<ConfirmedRunner[]> {
  const admin = createAdminClient();
  // Every page: a cancellation must reach all of a big race, not its first 1,000.
  const { data, error } = await selectAll((from, to) =>
    admin
      .from("registrations")
      .select("id, runner_id, email, first_name, last_name, amount")
      .eq("event_id", eventId)
      .eq("status", "confirmed")
      .order("id")
      .range(from, to),
  );
  if (error) throw new Error(error.message);
  if (!data.length) return [];

  const settings = await getEmailSettingsOf(data.map((r) => r.runner_id));
  return data
    .filter((r) => !only || (settings.get(r.runner_id) ?? DEFAULT_SETTINGS)[only])
    .map((r) => ({
      email: r.email,
      firstName: r.first_name,
      name: `${r.first_name} ${r.last_name}`,
      amount: Number(r.amount),
      locale: settings.get(r.runner_id)?.locale ?? DEFAULT_LOCALE,
    }));
}
