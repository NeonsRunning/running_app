import type { Metadata } from "next";
import { EventDiscovery } from "@/components/events/discovery";
import { listPublishedEvents } from "@/lib/events/queries";
import { getLocale, getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return {
    title: t("events.meta.title"),
    description: t("events.meta.description"),
  };
}

export default async function EventsPage(props: PageProps<"/[lang]/events">) {
  const locale = await getLocale();
  const params = await props.searchParams;
  const first = (v: string | string[] | undefined) =>
    Array.isArray(v) ? v[0] : v;

  return (
    <EventDiscovery
      events={await listPublishedEvents(locale)}
      initialQuery={first(params.q) ?? ""}
      initialDistance={first(params.distance)}
    />
  );
}
