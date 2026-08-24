import type { Metadata } from "next";
import { Link } from "@/components/i18n/link";
import { notFound } from "next/navigation";
import { Eyebrow } from "@/components/ui/badge";
import { getLegalDoc, getLegalDocs, getLegalSlugs } from "@/lib/legal";
import { getLocale, getT } from "@/lib/i18n/server";

export function generateStaticParams() {
  return getLegalSlugs().map((doc) => ({ doc }));
}

export async function generateMetadata(
  props: PageProps<"/[lang]/legal/[doc]">,
): Promise<Metadata> {
  const { doc } = await props.params;
  const locale = await getLocale();
  const t = await getT();

  const found = getLegalDoc(doc, locale);
  if (!found) return { title: t("legal.notFound") };
  return { title: found.title, description: found.summary };
}

/** Turn a heading into a stable anchor id for the table of contents. */
function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export default async function LegalPage(props: PageProps<"/[lang]/legal/[doc]">) {
  const { doc } = await props.params;
  const locale = await getLocale();
  const t = await getT();

  const legal = getLegalDoc(doc, locale);
  if (!legal) notFound();

  const otherDocs = getLegalDocs(locale).filter((d) => d.slug !== legal.slug);

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-10 sm:px-6 lg:px-10 lg:py-14">
      <header className="border-b-2 border-line pb-8">
        <Eyebrow>
          {t("legal.lastUpdated", { date: legal.updated })}
        </Eyebrow>
        <h1 className="mt-3 max-w-3xl font-display text-4xl leading-[0.9] font-black uppercase sm:text-5xl lg:text-6xl">
          {legal.title}
        </h1>
        <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-fg-dim">
          {legal.summary}
        </p>
      </header>

      <div className="grid gap-10 py-10 lg:grid-cols-[240px_1fr] lg:gap-16">
        {/* Contents ----------------------------------------------------- */}
        <nav
          aria-label={t("legal.onThisPage")}
          className="lg:sticky lg:top-24 lg:self-start"
        >
          <Eyebrow>{t("legal.onThisPage")}</Eyebrow>
          <ul className="mt-4 flex flex-col gap-2.5">
            {legal.sections.map((s) => (
              <li key={s.heading}>
                <a
                  href={`#${slugify(s.heading)}`}
                  className="text-[13px] text-fg-dim hover:text-neon-lime"
                >
                  {s.heading}
                </a>
              </li>
            ))}
          </ul>

          <Eyebrow className="mt-8">{t("legal.otherPolicies")}</Eyebrow>
          <ul className="mt-4 flex flex-col gap-2.5">
            {otherDocs.map((d) => (
              <li key={d.slug}>
                <Link
                  href={`/legal/${d.slug}`}
                  className="text-[13px] text-fg-dim hover:text-neon-lime"
                >
                  {d.title}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        {/* Body --------------------------------------------------------- */}
        <article className="max-w-[72ch]">
          {legal.sections.map((s) => (
            <section
              key={s.heading}
              id={slugify(s.heading)}
              className="scroll-mt-24 border-b-2 border-line py-8 first:pt-0 last:border-b-0"
            >
              <h2 className="font-display text-2xl font-black uppercase sm:text-3xl">
                {s.heading}
              </h2>
              {s.paragraphs.map((p, i) => (
                <p
                  key={i}
                  className="mt-4 text-[15px] leading-relaxed text-fg-muted sm:text-base"
                >
                  {p}
                </p>
              ))}
            </section>
          ))}

          <p className="mt-10 border-2 border-line bg-carbon p-5 text-[13px] leading-relaxed text-fg-dim">
            {t("legal.disclaimer")}
          </p>
        </article>
      </div>
    </div>
  );
}
