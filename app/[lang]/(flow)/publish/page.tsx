import type { Metadata } from "next";
import { PublishWizard } from "@/components/publish/publish-wizard";
import { listAthMovilAccounts } from "@/lib/ath-movil/queries";
import { getReusableShirtDesigns } from "@/lib/events/organizer";
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
  const account = await requireOrganizer("/publish");
  if (!account) return <OrganizerOnly />;

  const [athMovilAccounts, reusableShirtDesigns] = await Promise.all([
    listAthMovilAccounts(),
    getReusableShirtDesigns(account.user.id, null),
  ]);
  return (
    <PublishWizard
      athMovilAccounts={athMovilAccounts}
      reusableShirtDesigns={reusableShirtDesigns}
    />
  );
}
