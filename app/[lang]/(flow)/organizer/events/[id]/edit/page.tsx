import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PublishWizard } from "@/components/publish/publish-wizard";
import { OrganizerOnly } from "@/components/organizer/organizer-only";
import { listAthMovilAccounts } from "@/lib/ath-movil/queries";
import { isOrganizer, isPlatformAdmin, requireAccount } from "@/lib/auth/session";
import { getEventForm } from "@/lib/events/organizer";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("publish.editMetaTitle") };
}

export default async function EditEventPage(
  props: PageProps<"/[lang]/organizer/events/[id]/edit">,
) {
  const { id } = await props.params;
  const account = await requireAccount(`/organizer/events/${id}/edit`);
  const admin = await isPlatformAdmin();
  if (!admin && !isOrganizer(account.profile)) return <OrganizerOnly />;

  // A platform admin opens any organizer's event. For everyone else,
  // someone else's event reads the same as a missing one.
  const [initial, athMovilAccounts] = await Promise.all([
    getEventForm(admin ? null : account.user.id, id),
    // Retired ones too: the event may still be using one.
    listAthMovilAccounts({ includeRetired: true }),
  ]);
  if (!initial) notFound();

  // Keyed by id so moving between two events never reuses one's form state.
  return (
    <PublishWizard
      key={initial.id}
      initial={initial}
      athMovilAccounts={athMovilAccounts}
      asAdmin={initial.organizerId !== account.user.id}
    />
  );
}
