import type { Metadata } from "next";
import { Link } from "@/components/i18n/link";
import { Eyebrow } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return {
    title: t("faq.metaTitle"),
    description: t("faq.metaDescription"),
  };
}

type FaqGroup = { title: string; items: { q: string; a: string }[] };

export default async function FaqPage() {
  const t = await getT();
  const groups = t.items<FaqGroup>("faq.groups");

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:py-14">
      <header className="border-b-2 border-line pb-8">
        <Eyebrow>{t("faq.eyebrow")}</Eyebrow>
        <h1 className="mt-3 font-display text-4xl leading-[0.9] font-black uppercase sm:text-5xl lg:text-6xl">
          {t("faq.title")}
        </h1>
        <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-fg-dim">
          {t("faq.introPre")}{" "}
          <Link href="/contact" className="text-neon-lime underline">
            {t("faq.introLink")}
          </Link>{" "}
          {t("faq.introPost")}
        </p>
      </header>

      {groups.map((group) => (
        <section key={group.title} className="py-10">
          <h2 className="font-mono text-[13px] font-bold tracking-[0.14em] text-neon-lime uppercase">
            {group.title}
          </h2>
          <div className="mt-6 border-t-2 border-line">
            {group.items.map((item) => (
              /* <details> gives keyboard support and works without JavaScript. */
              <details
                key={item.q}
                className="group border-b-2 border-line"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5 text-base font-extrabold marker:content-none sm:text-lg">
                  {item.q}
                  <span
                    aria-hidden="true"
                    className="shrink-0 text-neon-lime transition-transform group-open:rotate-45"
                  >
                    +
                  </span>
                </summary>
                <p className="max-w-[70ch] pb-6 text-[15px] leading-relaxed text-fg-dim">
                  {item.a}
                </p>
              </details>
            ))}
          </div>
        </section>
      ))}

      <section className="mt-4 border-2 border-line bg-carbon p-7">
        <h2 className="font-display text-2xl font-black uppercase">
          {t("faq.stillStuck")}
        </h2>
        <p className="mt-3 text-[15px] text-fg-dim">
          {t("faq.stillStuckBody")}
        </p>
        <Button href="/contact" size="lg" className="mt-6">
          {t("faq.contactSupport")}
        </Button>
      </section>
    </div>
  );
}
