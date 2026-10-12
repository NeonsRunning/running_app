import type { Metadata } from "next";
import { PublishWizard } from "@/components/publish/publish-wizard";
import { getT } from "@/lib/i18n/server";
import { requireOrganizer } from "@/lib/auth/session";
import { OrganizerOnly } from "@/components/organizer/organizer-only";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return {
    title: t("publish.metaTitle"),
    description: t("publish.metaDescription"),
  };
}

export default async function PublishPage() {
  if (!(await requireOrganizer("/publish"))) return <OrganizerOnly />;

  return <PublishWizard />;
}
