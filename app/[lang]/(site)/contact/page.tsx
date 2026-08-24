import type { Metadata } from "next";
import { Eyebrow } from "@/components/ui/badge";
import { ContactForm } from "@/components/contact/contact-form";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return {
    title: t("contact.metaTitle"),
    description: t("contact.metaDescription"),
  };
}

type Channel = { label: string; value: string; note: string };

export default async function ContactPage() {
  const t = await getT();
  const channels = t.items<Channel>("contact.channels");

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-10 sm:px-6 lg:px-10 lg:py-14">
      <header className="border-b-2 border-line pb-8">
        <Eyebrow>{t("contact.eyebrow")}</Eyebrow>
        <h1 className="mt-3 font-display text-4xl leading-[0.9] font-black uppercase sm:text-5xl lg:text-6xl">
          {t("contact.title")}
        </h1>
        <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-fg-dim">
          {t("contact.body")}
        </p>
      </header>

      <div className="grid gap-12 py-12 lg:grid-cols-[1fr_1fr] lg:gap-16">
        <ContactForm />

        <div>
          <h2 className="font-mono text-[13px] font-bold tracking-[0.14em] text-neon-lime uppercase">
            {t("contact.directChannels")}
          </h2>
          <dl className="mt-6 border-t-2 border-line">
            {channels.map((c) => (
              <div key={c.label} className="border-b-2 border-line py-5">
                <dt className="font-mono text-[10px] tracking-[0.16em] text-fg-faint uppercase">
                  {c.label}
                </dt>
                <dd className="mt-2 text-base font-bold">{c.value}</dd>
                <dd className="mt-1.5 text-[13px] text-fg-dim">{c.note}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </div>
  );
}
