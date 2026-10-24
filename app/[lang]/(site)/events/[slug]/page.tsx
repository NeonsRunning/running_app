import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Badge, Eyebrow } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SpecCell } from "@/components/ui/card";
import { Progress } from "@/components/ui/misc";
import { EventDetailTabs } from "@/components/events/event-detail-tabs";
import { EventPayments } from "@/components/organizer/event-payments";
import { CancelledRegistrations } from "@/components/organizer/cancelled-registrations";
import { EventRegistrations } from "@/components/organizer/event-registrations";
import { EventFinishers } from "@/components/organizer/event-finishers";
import { EventResults } from "@/components/organizer/event-results";
import { ResultSubmission } from "@/components/results/result-submission";
import { SaveButton } from "@/components/events/saved-events";
import { ShareRow } from "@/components/events/share-row";
import { listEventAthMovilSubmissions } from "@/lib/ath-movil/queries";
import { getUser, isPlatformAdmin } from "@/lib/auth/session";
import { daysUntil } from "@/lib/data";
import { getCancelledRegistrations, getEventRegistrations } from "@/lib/events/organizer";
import { findEvent, getOwnRegistration } from "@/lib/events/queries";
import { puertoRicoToday } from "@/lib/results/evidence";
import {
  getOwnResult,
  listEventFinishers,
  listEventResultSubmissions,
} from "@/lib/results/queries";
import { getLocale, getT } from "@/lib/i18n/server";
import { createFormatters } from "@/lib/i18n/format";
import {
  distanceLabel,
  eventTypeLabel,
  startTimeLabel,
} from "@/lib/i18n/labels";

export async function generateMetadata(
  props: PageProps<"/[lang]/events/[slug]">,
): Promise<Metadata> {
  const { slug } = await props.params;
  const locale = await getLocale();
  const t = await getT();

  const found = await findEvent(slug, locale);
  if (!found) return { title: t("events.detail.notFound") };

  return {
    title: found.event.name,
    description: found.event.tagline,
  };
}

export default async function EventDetailPage(
  props: PageProps<"/[lang]/events/[slug]">,
) {
  const { slug } = await props.params;
  const locale = await getLocale();
  const t = await getT();
  const fmt = createFormatters(locale);

  const found = await findEvent(slug, locale);
  if (!found) notFound();

  const { event, organizer } = found;

  // The event's organizer confirms ATH Móvil payments right here. Card
  // payments confirm themselves, so only ATH Móvil ever waits. RLS keeps the
  // rows to the organizer and platform admins either way; the check spares
  // everyone else the query.
  // Completed registrations ride along on the same check.
  const user = await getUser();
  const isAdmin = Boolean(user) && (await isPlatformAdmin());
  const canManage = Boolean(user) && (user?.id === organizer.id || isAdmin);
  const [pendingPayments, registrations, pendingResults, cancelled, finishers] =
    canManage
      ? await Promise.all([
          listEventAthMovilSubmissions(event.id),
          getEventRegistrations(event.id, event.date, {
          mailsMedals: Boolean(event.mailsMedals),
          acceptsResults: Boolean(event.acceptsResults),
          firstDay: event.date || null,
          lastDay: (event.endDate ?? event.date) || null,
        }),
          listEventResultSubmissions(event.id),
          getCancelledRegistrations(event.id),
          listEventFinishers(event.id),
        ])
      : [null, null, null, null, null];
  // Shown while the event takes results, and after it stops for as long as
  // anything is left to review.
  const showResults =
    pendingResults !== null &&
    (Boolean(event.acceptsResults) || pendingResults.length > 0);

  // Anyone with a paid sign-up sends their finish evidence from here — the
  // event's own organizer included, when they ran it too.
  const [ownRegistration, ownResult] =
    user && event.acceptsResults
      ? await Promise.all([
          getOwnRegistration(user.id, event.id),
          getOwnResult(user.id, event.id),
        ])
      : [null, null];
  const raceDay = event.date <= puertoRicoToday();
  const showPayments =
    pendingPayments !== null &&
    (Boolean(event.athMovil) || pendingPayments.length > 0);
  const days = daysUntil(event.date);
  const spotsLeft = event.capacity - event.registered;
  const categoryNames = Object.fromEntries(
    event.categories.map((c) => [c.id, c.name]),
  );
  const featured =
    event.categories.find((c) => c.name === event.featuredDistance) ??
    event.categories[0];

  // Before registration opens or after it closes there is nothing to sign up
  // for, so the button gives way to a notice saying why.
  const canRegister =
    event.registrationStatus !== "opening-soon" &&
    event.registrationStatus !== "closed";
  const unavailable =
    event.registrationStatus === "closed"
      ? t("events.detail.registrationClosed")
      : event.registrationOpens
        ? t("events.detail.registrationOpensOn", {
            date: event.registrationOpens,
          })
        : t("events.detail.registrationOpensSoon");

  return (
    <article className="pb-24 lg:pb-0">
      {/* ---------------------------------------------------------------- */}
      {/* Banner                                                           */}
      {/* ---------------------------------------------------------------- */}
      <header className="relative overflow-hidden border-b-2 border-line">
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[linear-gradient(120deg,#050505_0%,#050505_46%,#0e2605_72%,#2c6600_96%,#57ad00_118%)]"
        />
        <div aria-hidden="true" className="bg-road-lines absolute inset-0" />

        <div className="relative mx-auto max-w-[1600px] px-4 pt-14 pb-10 sm:px-6 lg:px-10 lg:pt-24 lg:pb-14">
          <div className="flex flex-wrap gap-2.5">
            <Badge tone="yellow">{event.statusLabel}</Badge>
            <Badge tone="outline" className="bg-ink/60 text-fg">
              {eventTypeLabel(t, event.type)}
            </Badge>
          </div>

          <h1 className="mt-5 max-w-4xl font-display text-[2.75rem] leading-[0.88] font-black tracking-[-0.038em] uppercase sm:text-6xl lg:text-[5.5rem]">
            {event.name}
          </h1>

          <div className="mt-6 flex flex-wrap gap-x-7 gap-y-2 font-mono text-[13px] tracking-[0.1em] text-fg-muted uppercase">
            <span>{event.place}</span>
            <span className="text-neon-yellow">
              {fmt.longDate(event.date)}
            </span>
            <span>
              {event.startTime
                ? t("events.detail.startSuffix", {
                    time: fmt.clock(event.startTime),
                  })
                : startTimeLabel(t, fmt, undefined, Boolean(event.endDate))}
            </span>
          </div>
        </div>
      </header>

      {/* ---------------------------------------------------------------- */}
      {/* Key facts                                                        */}
      {/* ---------------------------------------------------------------- */}
      <section
        aria-label={t("events.detail.glance")}
        className="mx-auto grid max-w-[1600px] grid-cols-2 gap-0.5 border-b-2 border-line bg-line sm:grid-cols-3 lg:grid-cols-6"
      >
        <SpecCell
          label={t("events.detail.specDistance")}
          value={distanceLabel(t, event.featuredDistance)}
          className="bg-ink"
        />
        <SpecCell
          label={t("events.detail.specStartTime")}
          value={startTimeLabel(
            t,
            fmt,
            event.startTime,
            Boolean(event.endDate),
          )}
          className="bg-ink"
        />
        <SpecCell
          label={t("events.detail.specTerrain")}
          value={event.terrain}
          className="bg-ink"
        />
        <SpecCell
          label={t("events.detail.specRegCloses")}
          value={event.registrationCloses}
          className="bg-ink"
        />
        <SpecCell
          label={t("events.detail.specSpotsLeft")}
          value={fmt.number(spotsLeft)}
          accent="lime"
          className="bg-ink"
        />
        <SpecCell
          label={t("events.detail.specFrom")}
          value={fmt.moneyWhole(event.fromPrice)}
          accent="yellow"
          className="bg-ink"
        />
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* Pending ATH Móvil payments — organizer and admins only           */}
      {/* ---------------------------------------------------------------- */}
      {showPayments ? (
        <div className="mx-auto max-w-[1600px] border-b-2 border-line px-4 py-10 sm:px-6 lg:px-10 lg:py-12">
          <EventPayments initial={pendingPayments} categories={categoryNames} />
        </div>
      ) : null}

      {/* ---------------------------------------------------------------- */}
      {/* Finish evidence to review — organizer and admins only            */}
      {/* ---------------------------------------------------------------- */}
      {showResults ? (
        <div className="mx-auto max-w-[1600px] border-b-2 border-line px-4 py-10 sm:px-6 lg:px-10 lg:py-12">
          <EventResults initial={pendingResults} />
        </div>
      ) : null}

      {/* ---------------------------------------------------------------- */}
      {/* Reviewed results, to disqualify — organizer and admins only      */}
      {/* ---------------------------------------------------------------- */}
      {finishers && (showResults || finishers.length > 0) ? (
        <div className="mx-auto max-w-[1600px] border-b-2 border-line px-4 py-10 sm:px-6 lg:px-10 lg:py-12">
          <EventFinishers initial={finishers} isAdmin={isAdmin} />
        </div>
      ) : null}

      {/* ---------------------------------------------------------------- */}
      {/* Completed registrations — organizer and admins only              */}
      {/* ---------------------------------------------------------------- */}
      {registrations ? (
        <div className="mx-auto max-w-[1600px] border-b-2 border-line px-4 py-10 sm:px-6 lg:px-10 lg:py-12">
          <EventRegistrations
            rows={registrations}
            categories={categoryNames}
            slug={event.slug}
          />
          {/* Runners taken off the event, kept for their refunds. */}
          <CancelledRegistrations
            rows={cancelled ?? []}
            categories={categoryNames}
            t={t}
            fmt={fmt}
          />
        </div>
      ) : null}

      {/* ---------------------------------------------------------------- */}
      {/* Body + booking rail                                              */}
      {/* ---------------------------------------------------------------- */}
      {/* minmax(0, …) columns and min-w-0 keep the scrolling tab strip from
          stretching the page past a phone's width. */}
      <div className="mx-auto grid max-w-[1600px] grid-cols-1 lg:grid-cols-[minmax(0,1fr)_400px]">
        <main className="min-w-0 border-line lg:border-r-2">
          <EventDetailTabs event={event} organizer={organizer} />
        </main>

        <aside className="border-t-2 border-line lg:border-t-0">
          {/* On desktop the booking card follows the reader down the page. */}
          <div className="lg:sticky lg:top-20">
            {ownRegistration ? (
              <ResultSubmission
                eventId={event.id}
                raceDay={raceDay}
                own={ownResult}
              />
            ) : null}

            <div className="border-b-2 border-line px-5 py-7 sm:px-7">
              <div className="flex items-baseline gap-3">
                <span className="font-display text-5xl font-black tracking-[-0.03em] text-neon-yellow">
                  {fmt.moneyWhole(featured.price)}
                </span>
                <span className="font-mono text-[12px] tracking-[0.1em] text-fg-dim uppercase">
                  {t("events.detail.entry", {
                    category: distanceLabel(t, featured.name),
                  })}
                </span>
              </div>

              {canRegister ? (
                <Button
                  href={`/events/${event.slug}/register`}
                  block
                  size="xl"
                  className="mt-6"
                >
                  {t("events.detail.registerNow")}
                </Button>
              ) : (
                <p className="mt-6 flex min-h-16 items-center justify-center border-2 border-line px-4 text-center font-display text-[15px] font-black tracking-[0.12em] text-fg-muted uppercase">
                  {unavailable}
                </p>
              )}

              <SaveButton
                slug={event.slug}
                name={event.name}
                labelled
                className="mt-3"
              />

              <ShareRow
                title={`${event.name} — NEONS RUNNING`}
                path={`/events/${event.slug}`}
                className="mt-3"
              />
            </div>

            <div className="border-b-2 border-line px-5 py-6 sm:px-7">
              <Progress
                value={event.registered}
                max={event.capacity}
                label={t("events.detail.capacity")}
              />
              <p className="mt-3 font-mono text-[11px] tracking-[0.1em] text-neon-lime uppercase">
                {t("events.detail.capacityFull", {
                  percent: Math.round(
                    (event.registered / event.capacity) * 100,
                  ),
                  spots: fmt.number(spotsLeft),
                })}
              </p>
            </div>

            <div className="border-b-2 border-line px-5 py-6 sm:px-7">
              <Eyebrow>{t("events.detail.raceCategories")}</Eyebrow>
              <ul className="mt-4">
                {event.categories.map((c) => {
                  const isFeatured = c.name === event.featuredDistance;
                  return (
                    <li
                      key={c.id}
                      className="flex justify-between border-b-2 border-line py-3 text-[15px] last:border-b-0"
                    >
                      <span
                        className={
                          isFeatured
                            ? "font-black text-neon-lime"
                            : "font-bold"
                        }
                      >
                        {distanceLabel(t, c.name)}
                      </span>
                      <span
                        className={isFeatured ? "text-neon-lime" : "text-fg-muted"}
                      >
                        {fmt.moneyWhole(c.price)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>

            <div className="px-5 py-7 sm:px-7">
              <Eyebrow>{t("events.detail.countdown")}</Eyebrow>
              <p className="mt-3 font-display text-5xl leading-none font-black tracking-[-0.03em]">
                {fmt.number(days)}
                <span className="ml-2 align-middle text-lg font-bold tracking-[0.1em] text-fg-dim">
                  {t("events.detail.days")}
                </span>
              </p>
              <p className="mt-3 text-[13px] text-fg-dim">
                {t("events.detail.registrationCloses", {
                  date: event.registrationCloses,
                })}
              </p>
            </div>
          </div>
        </aside>
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* Sticky mobile registration bar                                   */}
      {/* ---------------------------------------------------------------- */}
      <div className="fixed inset-x-0 bottom-14 z-60 grid grid-cols-[auto_1fr] items-center border-t-2 border-line bg-ink lg:hidden">
        <div className="px-4 py-3">
          <span className="font-display text-xl font-black text-neon-yellow">
            {fmt.moneyWhole(featured.price)}
          </span>
        </div>
        {canRegister ? (
          <Button
            href={`/events/${event.slug}/register`}
            size="lg"
            className="h-full min-h-14 rounded-none"
          >
            {t("events.detail.registerNow")}
          </Button>
        ) : (
          <p className="flex h-full min-h-14 items-center justify-center px-4 text-center font-display text-[13px] font-black tracking-[0.12em] text-fg-muted uppercase">
            {unavailable}
          </p>
        )}
      </div>
    </article>
  );
}
