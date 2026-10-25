import type { Metadata } from "next";
import { EventDiscovery } from "@/components/events/discovery";
import { searchEvents } from "@/lib/events/queries";
import { EMPTY_SEARCH, type EventSearch } from "@/lib/events/search";
import { DISTANCES, isOneOf } from "@/lib/events/vocabulary";
import { getLocale, getT } from "@/lib/i18n/server";
import { pageAlternates } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return {
    title: t("events.meta.title"),
    description: t("events.meta.description"),
    alternates: await pageAlternates("/events"),
  };
}

export default async function EventsPage(props: PageProps<"/[lang]/events">) {
  const locale = await getLocale();
  const params = await props.searchParams;
  const first = (v: string | string[] | undefined) =>
    Array.isArray(v) ? v[0] : v;
  const distance = first(params.distance);

  const search: EventSearch = {
    ...EMPTY_SEARCH,
    query: first(params.q) ?? "",
    distances: distance && isOneOf(DISTANCES, distance) ? [distance] : [],
  };

  // The first page renders with the HTML; the client fetches the rest.
  return (
    <EventDiscovery
      initialSearch={search}
      initialPage={await searchEvents(search, 0, locale)}
    />
  );
}
