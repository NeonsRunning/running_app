import { NeonsEmblem, NeonsWordmark } from "@/components/brand/logo";
import { Link } from "@/components/i18n/link";
import { LanguageSwitcher } from "@/components/i18n/language-switcher";
import { getT } from "@/lib/i18n/server";
import { SELF_PROFILE_PATH } from "@/lib/auth/routes";

/** Titles and labels are dictionary keys, resolved against the active locale. */
const COLUMNS = [
  {
    title: "footer.runners.title",
    links: [
      { href: "/events", key: "footer.runners.findRaces" },
      { href: SELF_PROFILE_PATH, key: "footer.runners.myRegistrations" },
      { href: "/results", key: "footer.runners.results" },
      { href: "/community", key: "footer.runners.clubs" },
    ],
  },
  {
    title: "footer.organizers.title",
    links: [
      { href: "/publish", key: "footer.organizers.publishEvent" },
      { href: "/organizer", key: "footer.organizers.dashboard" },
      { href: "/organizer/checkin", key: "footer.organizers.checkin" },
      { href: "/legal/organizer-terms", key: "footer.organizers.organizerTerms" },
    ],
  },
  {
    title: "footer.company.title",
    links: [
      { href: "/about", key: "footer.company.about" },
      { href: "/contact", key: "footer.company.contact" },
      { href: "/faq", key: "footer.company.faq" },
      { href: "/legal/privacy", key: "footer.company.privacy" },
    ],
  },
  {
    title: "footer.policies.title",
    links: [
      { href: "/legal/terms", key: "footer.policies.terms" },
      { href: "/legal/refunds", key: "footer.policies.refunds" },
      { href: "/legal/cancellation", key: "footer.policies.cancellation" },
      { href: "/legal/privacy", key: "footer.policies.privacy" },
    ],
  },
];

export async function SiteFooter() {
  const t = await getT();
  return (
    <footer className="border-t-2 border-line bg-ink">
      <div className="mx-auto max-w-[1600px] px-4 sm:px-6 lg:px-10">
        <div className="grid gap-10 border-b-2 border-line py-12 md:grid-cols-2 lg:grid-cols-[1.6fr_repeat(4,1fr)] lg:gap-8">
          <div className="max-w-xs">
            <div className="flex items-center gap-3">
              <NeonsEmblem height={29} />
              <NeonsWordmark />
            </div>
            <p className="mt-5 text-[13px] leading-relaxed text-fg-dim">
              {t("footer.blurb")}
            </p>
          </div>

          {COLUMNS.map((col) => (
            <div key={col.title}>
              <h2 className="font-mono text-[10px] tracking-[0.18em] uppercase">
                {t(col.title)}
              </h2>
              <ul className="mt-4 flex flex-col gap-2.5">
                {col.links.map((link) => (
                  <li key={link.href + link.key}>
                    <Link
                      href={link.href}
                      className="text-[13px] text-fg-dim hover:text-neon-lime"
                    >
                      {t(link.key)}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-3 py-7 sm:flex-row sm:items-center sm:justify-between">
          <p className="font-mono text-[11px] tracking-[0.14em] text-fg-faint uppercase">
            {t("footer.copyright")}
          </p>
          <div className="flex items-center gap-5">
            {/* The motto stays in Spanish in both languages — it is the brand. */}
            <p className="font-mono text-[11px] tracking-[0.2em] text-neon-lime uppercase">
              {t("footer.motto")}
            </p>
            <LanguageSwitcher />
          </div>
        </div>
      </div>
    </footer>
  );
}
