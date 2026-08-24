import type { Metadata } from "next";
import { Eyebrow } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ParticipantTable } from "@/components/organizer/participant-table";
import { getParticipants } from "@/lib/data";
import { getLocale, getT } from "@/lib/i18n/server";
import { requireUser } from "@/lib/auth/session";
import { createFormatters } from "@/lib/i18n/format";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return {
    title: t("participantsPage.metaTitle"),
    description: t("participantsPage.metaDescription"),
  };
}

export default async function ParticipantsPage() {
  await requireUser("/organizer/participants");

  const locale = await getLocale();
  const t = await getT();
  const fmt = createFormatters(locale);

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-10 sm:px-6 lg:px-10 lg:py-14">
      <header className="flex flex-wrap items-end justify-between gap-6 pb-6">
        <div>
          <Eyebrow>
            {t("participantsPage.eyebrow", {
              date: fmt.mediumDate("2026-09-12"),
            })}
          </Eyebrow>
          <h1 className="mt-3 font-display text-4xl font-black uppercase sm:text-5xl">
            {t("participantsPage.title")}
          </h1>
        </div>
        <div className="flex gap-3">
          <Button href="/organizer" variant="ghost" size="md">
            {t("participantsPage.backToDashboard")}
          </Button>
          <Button href="/organizer/checkin" size="md">
            {t("participantsPage.checkin")}
          </Button>
        </div>
      </header>

      <ParticipantTable initial={getParticipants(locale)} />
    </div>
  );
}
