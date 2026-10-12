import type { Metadata } from "next";
import { CheckInStation } from "@/components/organizer/checkin";
import { getParticipants } from "@/lib/data";
import { getLocale, getT } from "@/lib/i18n/server";
import { requireOrganizer } from "@/lib/auth/session";
import { OrganizerOnly } from "@/components/organizer/organizer-only";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return {
    title: t("checkin.metaTitle"),
    description: t("checkin.metaDescription"),
  };
}

export default async function CheckInPage() {
  if (!(await requireOrganizer("/organizer/checkin"))) return <OrganizerOnly />;

  const locale = await getLocale();
  return <CheckInStation initial={getParticipants(locale)} />;
}
