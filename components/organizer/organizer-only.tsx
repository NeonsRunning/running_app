import { Eyebrow } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getT } from "@/lib/i18n/server";

/**
 * What a signed-in runner sees on an organizer page. Organizer access is
 * granted by the team rather than switched on in settings, so this points at
 * the contact page instead of offering a button.
 */
export async function OrganizerOnly() {
  const t = await getT();

  return (
    <div className="mx-auto flex min-h-[70dvh] max-w-2xl flex-col items-center justify-center px-4 py-16 text-center">
      <Eyebrow>{t("organizerOnly.eyebrow")}</Eyebrow>
      <h1 className="mt-4 font-display text-4xl leading-[0.9] font-black uppercase sm:text-5xl">
        {t("organizerOnly.title")}
      </h1>
      <p className="mt-5 max-w-md text-[15px] leading-relaxed text-fg-dim">
        {t("organizerOnly.body")}
      </p>
      <div className="mt-9 flex flex-col gap-3 sm:flex-row">
        <Button href="/contact" size="lg">
          {t("organizerOnly.contact")}
        </Button>
        <Button href="/events" variant="outline" size="lg">
          {t("organizerOnly.browseEvents")}
        </Button>
      </div>
    </div>
  );
}
