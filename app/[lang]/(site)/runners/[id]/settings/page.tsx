import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Link } from "@/components/i18n/link";
import { SettingsPanel } from "@/components/settings/settings-panel";
import { requireUser } from "@/lib/auth/session";
import { SELF_ID, SELF_PROFILE_PATH } from "@/lib/auth/routes";
import { getUpcomingRegistrations } from "@/lib/events/queries";
import {
  getDeletionRequestedAt,
  getProfile,
  getProfileDetails,
} from "@/lib/profile/queries";
import { getT } from "@/lib/i18n/server";
import { NOINDEX } from "@/lib/seo";

/**
 * The runner's account settings. They used to sit at the foot of the profile,
 * which made a page about racing mostly a page of forms.
 *
 * Only `/runners/me/settings` exists: settings are never anyone else's to see,
 * so an id here would only ever name the viewer or 404. The `me` prefix also
 * puts the route under the protected `/runners/me` gate.
 */

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("settings.title"), robots: NOINDEX };
}

export default async function RunnerSettingsPage(
  props: PageProps<"/[lang]/runners/[id]/settings">,
) {
  const { id } = await props.params;
  if (id !== SELF_ID) notFound();

  const t = await getT();
  const user = await requireUser(`${SELF_PROFILE_PATH}/settings`);
  const [profile, details, deletionRequestedAt, upcoming] = await Promise.all([
    getProfile(user.id),
    getProfileDetails(user.id),
    getDeletionRequestedAt(user.id),
    getUpcomingRegistrations(user.id),
  ]);

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-10 sm:px-8 lg:px-10 lg:py-14">
      <Link
        href={SELF_PROFILE_PATH}
        className="font-mono text-[11px] tracking-[0.14em] text-fg-faint uppercase hover:text-neon-lime"
      >
        ← {t("account.profile")}
      </Link>
      <h1 className="mt-4 font-display text-4xl leading-[0.9] font-black tracking-[-0.04em] uppercase sm:text-5xl">
        {t("settings.title")}
      </h1>
      <SettingsPanel
        profile={profile}
        details={details}
        deletion={{ requestedAt: deletionRequestedAt, upcoming: upcoming.length }}
      />
    </div>
  );
}
