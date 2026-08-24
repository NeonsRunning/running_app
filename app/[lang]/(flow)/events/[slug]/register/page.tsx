import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RegistrationFlow } from "@/components/register/registration-flow";
import { getEventBySlug, getEventSlugs } from "@/lib/data";
import { getLocale, getT } from "@/lib/i18n/server";

export function generateStaticParams() {
  return getEventSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata(
  props: PageProps<"/[lang]/events/[slug]/register">,
): Promise<Metadata> {
  const { slug } = await props.params;
  const locale = await getLocale();
  const t = await getT();

  const event = getEventBySlug(slug, locale);
  return {
    title: event
      ? t("register.metaTitle", { event: event.name })
      : t("register.metaTitleFallback"),
  };
}

export default async function RegisterPage(
  props: PageProps<"/[lang]/events/[slug]/register">,
) {
  const { slug } = await props.params;
  const locale = await getLocale();

  const event = getEventBySlug(slug, locale);
  if (!event) notFound();
  return <RegistrationFlow event={event} />;
}
