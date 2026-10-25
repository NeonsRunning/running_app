import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CheckInStation } from "@/components/organizer/checkin";
import { OrganizerOnly } from "@/components/organizer/organizer-only";
import { isOrganizer, isPlatformAdmin, requireAccount } from "@/lib/auth/session";
import { getCheckInList } from "@/lib/events/organizer";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return {
    title: t("checkin.metaTitle"),
    description: t("checkin.metaDescription"),
  };
}

export default async function CheckInPage(
  props: PageProps<"/[lang]/organizer/events/[id]/checkin">,
) {
  const { id } = await props.params;
  const account = await requireAccount(`/organizer/events/${id}/checkin`);
  const admin = await isPlatformAdmin();
  if (!admin && !isOrganizer(account.profile)) return <OrganizerOnly />;

  // A platform admin opens any organizer's event. For everyone else,
  // someone else's event reads the same as a missing one.
  const list = await getCheckInList(admin ? null : account.user.id, id);
  if (!list) notFound();

  return <CheckInStation list={list} />;
}
