import type { Metadata } from "next";
import { cache } from "react";
import { Link } from "@/components/i18n/link";
import { notFound } from "next/navigation";
import { Badge, Eyebrow } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/misc";
import { CopyTracking } from "@/components/profile/copy-tracking";
import { FollowButton } from "@/components/profile/follow-button";
import { MedalDelivery } from "@/components/profile/medal-delivery";
import { ProfilePhoto } from "@/components/profile/profile-photo";
import { SavedEventsPanel } from "@/components/profile/saved-panel";
import { EventCardCompact } from "@/components/events/event-card";
import { ShareRow } from "@/components/events/share-row";
import { cn } from "@/lib/cn";
import { daysUntil } from "@/lib/data";
import { puertoRicoDate } from "@/lib/dates";
import {
  getRegisteredEventIds,
  getMailItems,
  getSavedSlugs,
  getUpcomingRegistrations,
  listPublishedEvents,
  todayIso,
} from "@/lib/events/queries";
import { formatMailingAddress } from "@/lib/profile/address";
import { getProfileDetails } from "@/lib/profile/queries";
import { getRunnerView, type RunnerView } from "@/lib/profile/view";
import { formatFinishTime } from "@/lib/results/evidence";
import { listRunnerResults } from "@/lib/results/queries";
import { getUser, requireUser } from "@/lib/auth/session";
import { SELF_ID, SELF_PROFILE_PATH } from "@/lib/auth/routes";
import { getLocale, getT } from "@/lib/i18n/server";
import { createFormatters, type Formatters } from "@/lib/i18n/format";
import type { Translate } from "@/lib/i18n/translate";
import {
  distanceLabel,
  startTimeLabel,
  waveLabel,
} from "@/lib/i18n/labels";
import type { RunningEvent } from "@/lib/types";
import { NOINDEX } from "@/lib/seo";

/**
 * A runner's page — public to a visitor, and the runner's own home when they
 * are the one looking at it.
 *
 * The URL is keyed by account id. `profiles.handle` still exists and is still
 * unique — it is the name a runner picks for themselves — but it is theirs to
 * change, and an id never moves. `/runners/me` resolves to whoever is signed
 * in: the one address that can be linked to before an id is known, which is
 * what the nav, the login redirect and the confirmation emails all need.
 *
 * Owning the profile adds to the page rather than replacing it — saved races
 * and recommendations mean nothing to anyone else, and everything above them
 * reads the same either way. Account settings live on their own page at
 * `/runners/me/settings`.
 *
 * No `generateStaticParams` here, deliberately. Ids resolve against
 * `profiles`, and reading that table means reading the caller's cookies:
 * row-level security decides what a given visitor may see, so the same URL
 * legitimately renders for one person and 404s for another. The page is
 * request-time by nature, and prerendering it would bake one visitor's answer
 * in for everybody.
 */

/**
 * The signed-in account id, or null. Cached for the render pass so the
 * metadata and the page share one call rather than each revalidating the
 * access token with Supabase.
 */
const getViewerId = cache(async function getViewerId(): Promise<string | null> {
  return (await getUser())?.id ?? null;
});

export async function generateMetadata(
  props: PageProps<"/[lang]/runners/[id]">,
): Promise<Metadata> {
  const { id } = await props.params;
  const locale = await getLocale();
  const t = await getT();

  // Signed out at `/runners/me`: the page redirects to login, so name the tab
  // for where the runner was headed rather than resolving a profile.
  const target = id === SELF_ID ? await getViewerId() : id;
  if (!target) return { title: t("account.profile"), robots: NOINDEX };

  const runner = await getRunnerView(target, locale);
  if (!runner) return { title: t("runner.notFound"), robots: NOINDEX };
  return {
    title: runner.name,
    description:
      runner.bio || t("runner.metaDescription", { name: runner.name }),
    // A public profile is public to people with the link; being listed in
    // search is a further step no runner has opted into.
    robots: NOINDEX,
  };
}

/**
 * The line above the name. City and club are both optional on a real profile,
 * so it falls back to whichever half exists, and to the join date for an
 * account that has filled in neither.
 */
function identityLine(
  runner: RunnerView,
  t: Translate,
  fmt: Formatters,
): string | null {
  const { city, club, joinedAt } = runner;

  if (city && club) return t("runner.clubLine", { city, club });
  if (city) return city;
  if (club) return t("runner.clubOnly", { club });
  if (joinedAt) {
    return t("runner.memberSince", { date: fmt.mediumDate(joinedAt) });
  }
  return null;
}

/**
 * Up to three races worth a look: still ahead, still taking sign-ups, and not
 * already on the runner's calendar or saved list. Races in the runner's city
 * come first, then ones at a distance they have raced, then the fullest by
 * share of places taken, then the soonest.
 */
function recommendedFor(
  runner: RunnerView,
  events: RunningEvent[],
  exclude: { slugs: Set<string>; ids: Set<string> },
): RunningEvent[] {
  const today = todayIso();
  const city = runner.city?.trim().toLowerCase();
  const raced = new Set([
    ...runner.personalBests.map((pb) => pb.distance),
    ...runner.results.map((r) => r.distance),
  ]);

  const score = (e: RunningEvent) =>
    (city && e.city.toLowerCase() === city ? 2 : 0) +
    (e.categories.some((c) => raced.has(c.name)) ? 1 : 0);
  const fill = (e: RunningEvent) =>
    e.capacity > 0 ? e.registered / e.capacity : 0;

  return events
    .filter(
      (e) =>
        e.date >= today &&
        e.registrationStatus !== "closed" &&
        !exclude.slugs.has(e.slug) &&
        !exclude.ids.has(e.id),
    )
    .sort(
      (a, b) =>
        score(b) - score(a) ||
        fill(b) - fill(a) ||
        a.date.localeCompare(b.date),
    )
    .slice(0, 3);
}

export default async function RunnerProfilePage(
  props: PageProps<"/[lang]/runners/[id]">,
) {
  const { id } = await props.params;
  const locale = await getLocale();
  const t = await getT();
  const fmt = createFormatters(locale);

  const viewerId = await getViewerId();

  // `/runners/me` renders in place rather than bouncing to the id, so the nav
  // can still tell which page it is on. `requireUser` only runs when there is
  // no session to resolve it against, and redirects to login from there.
  const targetId =
    id === SELF_ID
      ? (viewerId ?? (await requireUser(SELF_PROFILE_PATH)).id)
      : id;

  // Null is "no such account" and "private profile" alike — a stranger gets
  // the same answer either way, which is what keeps a hidden profile hidden.
  const runner = await getRunnerView(targetId, locale);
  if (!runner) notFound();

  const isSelf = viewerId !== null && viewerId === runner.id;

  // The runner's own sign-ups are private to them, so only their own view of
  // the page reads them. A race leaves the list once its last day has passed.
  const [events, ownUpcoming] = await Promise.all([
    // The calendar, saved and recommended panels all read the published
    // races; a stranger's view of a profile with nothing on its calendar
    // skips them.
    isSelf || runner.upcoming.length > 0
      ? listPublishedEvents(locale)
      : Promise.resolve([]),
    isSelf ? getUpcomingRegistrations(runner.id) : Promise.resolve([]),
  ]);
  const bySlug = new Map(events.map((e) => [e.slug, e]));

  const calendar = [...runner.upcoming, ...ownUpcoming]
    .map((u) => ({ ...u, event: bySlug.get(u.eventSlug) }))
    .filter((u): u is typeof u & { event: NonNullable<typeof u.event> } =>
      Boolean(u.event),
    );

  const next = calendar[0];
  const nextEvent = next?.event;
  const laterRaces = calendar.slice(1);

  // The saved, recommended and pending panels belong to the runner alone,
  // so nobody else pays for the lookups behind them.
  const [savedSlugs, registeredIds, ownResults, mail] = isSelf
    ? await Promise.all([
        getSavedSlugs(runner.id),
        getRegisteredEventIds(runner.id),
        listRunnerResults(runner.id, { includeUnreviewed: true }),
        getMailItems(runner.id),
      ])
    : [[], [], [], []];
  // A medal with no address yet — picked up, or mailed but missing one — opens
  // the form on the one saved in settings; nobody else needs the lookup.
  const details = mail.some(
    (m) => m.kind === "medal" && !m.medalAddress && !m.shippedAt && !m.pickedUpAt,
  )
    ? await getProfileDetails(runner.id)
    : null;
  const settingsAddress = details?.mailingAddress
    ? formatMailingAddress(details.mailingAddress)
    : "";
  // Accepted ones are already in the race history.
  const pendingResults = ownResults.filter((r) => r.status !== "accepted");
  const recommended = isSelf
    ? recommendedFor(runner, events, {
        slugs: new Set([
          ...savedSlugs,
          ...calendar.map((u) => u.eventSlug),
        ]),
        ids: new Set(registeredIds),
      })
    : [];

  // An account with no racing data behind it would otherwise render three
  // empty panels down the side. Drop the column and let the page run full
  // width instead.
  const hasAside =
    Boolean(nextEvent) ||
    laterRaces.length > 0 ||
    runner.personalBests.length > 0;

  const subtitle = identityLine(runner, t, fmt);

  return (
    <div>
      {/* Profile header -------------------------------------------------- */}
      <header className="relative overflow-hidden border-b-2 border-line">
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[repeating-linear-gradient(100deg,rgba(156,255,0,0.05)_0_2px,transparent_2px_40px)]"
        />
        <div className="relative mx-auto flex max-w-[1600px] flex-col gap-7 px-4 py-10 sm:px-6 lg:flex-row lg:items-start lg:gap-9 lg:px-10 lg:py-14">
          <ProfilePhoto
            name={runner.name}
            initials={runner.initials}
            url={runner.avatarUrl}
            editable={isSelf}
          />

          <div className="flex-1">
            {subtitle ? (
              <p className="font-mono text-[11px] tracking-[0.2em] text-neon-lime uppercase">
                {subtitle}
              </p>
            ) : null}
            <h1 className="mt-3 font-display text-4xl leading-[0.9] font-black tracking-[-0.04em] uppercase sm:text-6xl lg:text-7xl">
              {runner.name}
            </h1>
            {runner.bio ? (
              <p className="mt-5 max-w-[56ch] text-[15px] leading-relaxed text-fg-dim sm:text-base">
                {runner.bio}
              </p>
            ) : null}
            {isSelf && nextEvent ? (
              <p className="mt-5 text-[15px] text-fg-dim">
                {t("runner.daysToStart", {
                  days: fmt.number(daysUntil(nextEvent.date)),
                  count: calendar.length,
                })}
              </p>
            ) : null}
          </div>

          <div className="flex w-full flex-col gap-3 lg:w-56">
            {isSelf ? (
              <>
                <Button href="/events" size="md" block>
                  {t("runner.findRace")}
                </Button>
                <Button
                  href={`${SELF_PROFILE_PATH}/settings`}
                  variant="outline"
                  size="md"
                  block
                >
                  {t("account.settings")}
                </Button>
              </>
            ) : (
              <FollowButton name={runner.name} block />
            )}
            <ShareRow
              title={`${runner.name} on NEONS RUNNING`}
              path={`/runners/${runner.id}`}
            />
            {runner.social ? (
              <p className="font-mono text-[11px] tracking-[0.14em] text-fg-faint uppercase">
                {t("runner.followers", {
                  followers: fmt.number(runner.social.followers),
                  following: fmt.number(runner.social.following),
                })}
              </p>
            ) : null}
          </div>
        </div>
      </header>

      {/* Stats ------------------------------------------------------------ */}
      <section
        aria-label={t("runner.careerStats")}
        className="mx-auto grid max-w-[1600px] grid-cols-2 gap-0.5 border-b-2 border-line bg-line lg:grid-cols-4"
      >
        {/* Every race on the record, finished or still ahead; the finished
            ones get their own count below. */}
        <StatCard
          value={runner.stats.races + calendar.length}
          label={t("runner.races")}
          className="bg-ink"
        />
        <StatCard
          value={fmt.number(runner.stats.kmRaced)}
          suffix="km"
          label={t("runner.raced")}
          accent="lime"
          className="bg-ink"
        />
        <StatCard
          value={runner.stats.races}
          label={t("runner.completed")}
          className="bg-ink"
        />
        <StatCard
          value={runner.stats.personalBests}
          label={t("runner.personalBests")}
          accent="yellow"
          className="bg-ink"
        />
      </section>

      <div
        className={cn(
          "mx-auto grid max-w-[1600px]",
          hasAside && "lg:grid-cols-[1fr_400px]",
        )}
      >
        <main className={cn("border-line", hasAside && "lg:border-r-2")}>
          {/* Achievements ------------------------------------------------ */}
          <section className="border-b-2 border-line px-4 py-10 sm:px-8 lg:px-10">
            <h2 className="font-mono text-[13px] font-bold tracking-[0.14em] text-neon-lime uppercase">
              {t("runner.achievements")}
            </h2>
            {runner.achievements.length > 0 ? (
              <ul className="mt-6 grid gap-0.5 bg-line sm:grid-cols-2 lg:grid-cols-3">
                {runner.achievements.map((a) => (
                  <li
                    key={a.id}
                    className={cn(
                      "flex items-center gap-4 p-5",
                      a.isNew
                        ? "animate-pop-in bg-neon-yellow/8 shadow-[inset_0_0_0_2px_#FFF200]"
                        : a.earned
                          ? "bg-carbon"
                          : "bg-carbon opacity-45",
                    )}
                  >
                    {a.image ? (
                      // A Supabase Storage URL; next/image would need the
                      // project's host configured as a remote pattern.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={a.image}
                        alt={t("runner.medalAlt", { event: a.name })}
                        loading="lazy"
                        decoding="async"
                        className="h-14 w-14 shrink-0 object-contain"
                      />
                    ) : (
                      <span aria-hidden="true" className="text-2xl">
                        {a.emoji}
                      </span>
                    )}
                    <span className="min-w-0">
                      <span
                        className={cn(
                          "block text-[15px] font-extrabold uppercase",
                          a.isNew && "text-neon-yellow",
                        )}
                      >
                        {a.name}
                      </span>
                      <span className="mt-0.5 block text-xs text-fg-dim">
                        {a.earned
                          ? a.detail
                          : t("runner.locked", { detail: a.detail })}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                icon="🏅"
                title={t("runner.noAchievementsTitle")}
                body={t("runner.noAchievementsBody", { name: runner.name })}
                className="mt-6"
              />
            )}
          </section>

          {/* Pending results — the runner's own, and only when there are any */}
          {pendingResults.length > 0 ? (
            <section
              id="pending-results"
              className="scroll-mt-24 border-b-2 border-line px-4 py-10 sm:px-8 lg:px-10"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <h2 className="font-mono text-[13px] font-bold tracking-[0.14em] text-neon-lime uppercase">
                  {t("runner.pendingResults")}
                </h2>
                <span className="font-mono text-[11px] tracking-[0.14em] text-fg-faint uppercase">
                  {t("runner.pendingResultsMeta", {
                    count: fmt.number(
                      pendingResults.filter((r) => r.status === "pending").length,
                    ),
                  })}
                </span>
              </div>

              <ul className="mt-6 border-t-2 border-line">
                {pendingResults.map((r) => (
                  <li
                    key={r.id}
                    className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-line py-5"
                  >
                    <div className="min-w-0">
                      {r.eventRemoved ? (
                        <p className="font-display text-lg font-black uppercase">
                          {r.eventName}
                        </p>
                      ) : (
                        <Link
                          href={`/events/${r.eventSlug}`}
                          className="font-display text-lg font-black uppercase hover:text-neon-lime"
                        >
                          {r.eventName}
                        </Link>
                      )}
                      <p className="mt-1.5 font-mono text-[11px] tracking-[0.12em] text-fg-faint uppercase">
                        {fmt.mediumDate(r.eventDate)} ·{" "}
                        {distanceLabel(t, r.distance)} ·{" "}
                        {t("runner.submittedOn", {
                          date: fmt.mediumDate(puertoRicoDate(r.submittedAt)),
                        })}
                      </p>
                      {r.status === "rejected" ? (
                        <p className="mt-3 max-w-[60ch] text-[14px] text-fg-muted">
                          {r.reviewNote
                            ? t("runner.rejectedNote", { note: r.reviewNote })
                            : t("runner.rejectedBody")}
                        </p>
                      ) : r.status === "disqualified" ? (
                        <p className="mt-3 max-w-[60ch] text-[14px] text-fg-muted">
                          {r.disqualificationReason
                            ? t("runner.disqualifiedNote", {
                                reason: r.disqualificationReason,
                              })
                            : t("runner.disqualifiedBody")}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <span className="font-mono text-xl tabular-nums">
                        {formatFinishTime(r.finishSeconds)}
                      </span>
                      {r.status === "pending" ? (
                        <Badge tone="yellow">{t("runner.resultUnderReview")}</Badge>
                      ) : r.status === "disqualified" ? (
                        <Badge tone="danger">{t("runner.resultDisqualified")}</Badge>
                      ) : (
                        <>
                          <Badge tone="danger">{t("runner.resultRejected")}</Badge>
                          {/* A removed event takes no more evidence. */}
                          {r.eventRemoved ? null : (
                            <Link
                              href={`/events/${r.eventSlug}`}
                              className="text-[12px] font-extrabold tracking-[0.12em] text-neon-lime uppercase hover:text-neon-yellow"
                            >
                              {t("runner.resendEvidence")} →
                            </Link>
                          )}
                        </>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {/* Kits and medals by mail — the runner's own, and only when there
              are any. The "shipped" emails link here by its id. */}
          {mail.length > 0 ? (
            <section
              id="mail"
              className="scroll-mt-24 border-b-2 border-line px-4 py-10 sm:px-8 lg:px-10"
            >
              <h2 className="font-mono text-[13px] font-bold tracking-[0.14em] text-neon-lime uppercase">
                {t("runner.mail")}
              </h2>

              <ul className="mt-6 border-t-2 border-line">
                {mail.map((s) => (
                  <li
                    key={`${s.kind}-${s.registrationId}`}
                    className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-line py-5"
                  >
                    <div className="min-w-0">
                      <p className="mb-1 font-mono text-[10px] tracking-[0.16em] text-fg-faint uppercase">
                        {t(s.kind === "kit" ? "runner.mailKit" : "runner.mailMedal")}
                      </p>
                      {s.eventListed ? (
                        <Link
                          href={`/events/${s.eventSlug}`}
                          className="font-display text-lg font-black uppercase hover:text-neon-lime"
                        >
                          {s.eventName}
                        </Link>
                      ) : (
                        <p className="font-display text-lg font-black uppercase">
                          {s.eventName}
                        </p>
                      )}
                      <p className="mt-1.5 font-mono text-[11px] tracking-[0.12em] text-fg-faint uppercase">
                        {s.shippedAt
                          ? t("runner.kitShippedOn", {
                              date: fmt.mediumDate(puertoRicoDate(s.shippedAt)),
                            })
                          : s.pickedUpAt
                            ? t("runner.medalPickedUpOn", {
                                date: fmt.mediumDate(puertoRicoDate(s.pickedUpAt)),
                              })
                            : s.status === "pickup"
                              ? t("runner.medalPickupMeta")
                              : s.waitingFor === "result"
                                ? t("runner.medalWaitingResult")
                                : s.waitingFor === "raceDay"
                                  ? t("runner.medalWaitingRaceDay")
                                  : t("runner.kitPreparingBody")}
                      </p>
                      {s.kind === "medal" && !s.shippedAt && !s.pickedUpAt ? (
                        <MedalDelivery
                          registrationId={s.registrationId}
                          byMail={s.medalByMail}
                          address={s.medalAddress}
                          fallback={settingsAddress}
                        />
                      ) : null}
                      {s.shippedAt ? (
                        <div className="mt-3">
                          {s.tracking ? (
                            <>
                              <p className="font-mono text-[10px] tracking-[0.16em] text-fg-faint uppercase">
                                {t("runner.trackingNumber")}
                              </p>
                              <div className="mt-1.5">
                                <CopyTracking tracking={s.tracking} />
                              </div>
                            </>
                          ) : (
                            <p className="max-w-[60ch] text-[14px] text-fg-muted">
                              {t("runner.noTracking")}
                            </p>
                          )}
                        </div>
                      ) : null}
                    </div>
                    {s.status === "shipped" ? (
                      <Badge tone="lime">{t("runner.kitShipped")}</Badge>
                    ) : s.status === "pickedUp" ? (
                      <Badge tone="lime">{t("runner.medalPickedUp")}</Badge>
                    ) : s.status === "pickup" ? (
                      <Badge tone="outline">{t("runner.medalPickupBadge")}</Badge>
                    ) : s.status === "preparing" ? (
                      <Badge tone="outline">{t("runner.kitPreparing")}</Badge>
                    ) : (
                      <Badge tone="outline">{t("runner.medalWaiting")}</Badge>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {/* Race history ------------------------------------------------ */}
          <section className="px-4 py-10 sm:px-8 lg:px-10">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2 className="font-mono text-[13px] font-bold tracking-[0.14em] text-neon-lime uppercase">
                {t("runner.raceHistory")}
              </h2>
              {runner.results.length > 0 ? (
                <span className="font-mono text-[11px] tracking-[0.14em] text-fg-faint uppercase">
                  {t("runner.raceHistoryMeta", { count: runner.stats.races })}
                </span>
              ) : null}
            </div>

            {runner.results.length > 0 ? (
              <ul className="mt-6 border-t-2 border-line">
                {runner.results.map((r) => (
                  <li
                    key={r.eventName + r.date}
                    className="border-b-2 border-line py-6"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <h3 className="font-display text-xl font-black uppercase">
                          {r.eventName}
                        </h3>
                        <p className="mt-1.5 font-mono text-[11px] tracking-[0.12em] text-fg-faint uppercase">
                          {r.date} · {distanceLabel(t, r.distance)}
                          {r.selfReported
                            ? ` · ${t("runner.verifiedByOrganizer")}`
                            : null}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {r.personalBest ? (
                          <Badge tone="lime">{t("runner.pb")}</Badge>
                        ) : null}
                        {r.podium ? (
                          <Badge tone="yellow">{t("runner.podium")}</Badge>
                        ) : null}
                        {/* A reported result has no results table behind it,
                            and a removed event has no page at all. */}
                        {r.eventRemoved ? null : (
                          <Button
                            href={
                              r.selfReported
                                ? `/events/${r.eventSlug}`
                                : `/events/${r.eventSlug}/results`
                            }
                            variant="outline"
                            size="sm"
                          >
                            {r.selfReported
                              ? t("runner.viewEvent")
                              : t("runner.viewResults")}
                          </Button>
                        )}
                      </div>
                    </div>

                    <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
                      <div>
                        <dt className="font-mono text-[10px] tracking-[0.16em] text-fg-faint uppercase">
                          {t("runner.officialTime")}
                        </dt>
                        <dd
                          className={cn(
                            "mt-1.5 font-mono text-xl",
                            r.personalBest
                              ? "text-neon-lime"
                              : r.podium
                                ? "text-neon-yellow"
                                : "text-fg",
                          )}
                        >
                          {r.time}
                        </dd>
                      </div>
                      <div>
                        <dt className="font-mono text-[10px] tracking-[0.16em] text-fg-faint uppercase">
                          {t("runner.pace")}
                        </dt>
                        <dd className="mt-1.5 font-mono text-xl">{r.pace}</dd>
                      </div>
                      {r.placings ? (
                        <>
                          <div>
                            <dt className="font-mono text-[10px] tracking-[0.16em] text-fg-faint uppercase">
                              {t("runner.overall")}
                            </dt>
                            <dd className="mt-1.5 font-mono text-xl">
                              {r.placings.overallPlace} / {r.placings.overallField}
                            </dd>
                          </div>
                          <div>
                            <dt className="font-mono text-[10px] tracking-[0.16em] text-fg-faint uppercase">
                              {t("runner.ageGroup")}
                            </dt>
                            <dd className="mt-1.5 font-mono text-xl">
                              {r.placings.agePlace} / {r.placings.ageField}
                            </dd>
                          </div>
                        </>
                      ) : null}
                    </dl>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                title={t("runner.noResultsTitle")}
                body={t("runner.noResultsBody")}
                action={{ label: t("runner.noResultsAction"), href: "/events" }}
                className="mt-6"
              />
            )}
          </section>

          {/* Saved races — the runner's own ------------------------------ */}
          {isSelf ? (
            <section
              id="saved"
              className="scroll-mt-24 border-t-2 border-line px-4 py-10 sm:px-8 lg:px-10"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <h2 className="font-mono text-[13px] font-bold tracking-[0.14em] text-neon-lime uppercase">
                  {t("runner.savedEvents")}
                </h2>
                <Link
                  href="/events"
                  className="text-[13px] font-extrabold tracking-[0.12em] text-neon-lime uppercase hover:text-neon-yellow"
                >
                  {t("runner.findMore")} →
                </Link>
              </div>
              <div className="mt-6">
                <SavedEventsPanel events={events} />
              </div>
            </section>
          ) : null}

          {/* Recommended ------------------------------------------------- */}
          {isSelf && recommended.length > 0 ? (
            <section className="border-t-2 border-line px-4 py-10 sm:px-8 lg:px-10">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <h2 className="font-mono text-[13px] font-bold tracking-[0.14em] text-neon-lime uppercase">
                  {t("runner.recommended")}
                </h2>
                <span className="font-mono text-[11px] tracking-[0.14em] text-fg-faint uppercase">
                  {runner.city
                    ? t("runner.recommendedKicker", { city: runner.city })
                    : t("runner.recommendedKickerAny")}
                </span>
              </div>
              <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {recommended.map((event) => (
                  <EventCardCompact key={event.id} event={event} />
                ))}
              </div>
            </section>
          ) : null}
        </main>

        {hasAside ? (
          <aside className="border-t-2 border-line lg:border-t-0">
            {nextEvent && next ? (
              <div className="border-b-2 border-line px-5 py-7 sm:px-7">
                <Eyebrow>{t("runner.nextRace")}</Eyebrow>
                <div className="mt-4 border-2 border-neon-yellow bg-neon-yellow/6 p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-display text-[15px] font-black tracking-widest text-neon-yellow uppercase">
                      {t("runner.daysToRaceDay", {
                        days: fmt.number(daysUntil(nextEvent.date)),
                      })}
                    </p>
                    {next.pending ? (
                      <Badge tone="outline">{t("runner.pending")}</Badge>
                    ) : null}
                  </div>
                  <h3 className="mt-3.5 font-display text-2xl leading-tight font-black uppercase">
                    {nextEvent.name}
                  </h3>
                  <dl className="mt-4 flex flex-col gap-2 text-sm text-fg-muted">
                    <div className="flex justify-between">
                      <dt className="text-fg-dim">{t("runner.date")}</dt>
                      <dd>
                        {nextEvent.dow}, {nextEvent.month} {nextEvent.day}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-fg-dim">{t("runner.start")}</dt>
                      <dd>
                        {startTimeLabel(
                          t,
                          fmt,
                          nextEvent.startTime,
                          Boolean(nextEvent.endDate),
                        )}{" "}
                        ·{" "}
                        {waveLabel(t, next.wave)}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-fg-dim">{t("runner.category")}</dt>
                      <dd>{distanceLabel(t, next.category)}</dd>
                    </div>
                    {next.pending ? null : (
                      <div className="flex justify-between">
                        <dt className="text-fg-dim">{t("runner.bib")}</dt>
                        <dd className="font-mono">#{next.bib}</dd>
                      </div>
                    )}
                  </dl>
                  <div className="mt-5 flex flex-col gap-2.5">
                    <Button
                      href={`/events/${nextEvent.slug}/register`}
                      block
                      size="md"
                    >
                      {t("runner.viewRegistration")}
                    </Button>
                    <Button
                      href={`/events/${nextEvent.slug}`}
                      variant="outline"
                      block
                      size="md"
                    >
                      {t("runner.viewEvent")}
                    </Button>
                  </div>
                </div>
              </div>
            ) : null}

            {laterRaces.length > 0 ? (
              <div className="border-b-2 border-line px-5 py-7 sm:px-7">
                <Eyebrow>{t("runner.upcoming")}</Eyebrow>
                <ul className="mt-4">
                  {laterRaces.map((race) => (
                    <li
                      key={race.event.slug}
                      className="border-b-2 border-line py-3.5 last:border-b-0"
                    >
                      <div className="flex items-baseline justify-between gap-3">
                        <Link
                          href={`/events/${race.event.slug}`}
                          className="text-[15px] font-bold hover:text-neon-lime"
                        >
                          {race.event.name}
                        </Link>
                        <span className="shrink-0 font-mono text-xs text-fg-dim">
                          {race.event.day} {race.event.month}
                        </span>
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-2">
                        <p className="font-mono text-[11px] tracking-[0.12em] text-fg-faint uppercase">
                          {race.pending
                            ? t("runner.registrationMetaPending", {
                                category: distanceLabel(t, race.category),
                                wave: waveLabel(t, race.wave),
                              })
                            : t("runner.registrationMeta", {
                                category: distanceLabel(t, race.category),
                                wave: waveLabel(t, race.wave),
                                bib: race.bib,
                              })}
                        </p>
                        {race.pending ? (
                          <Badge tone="outline">{t("runner.pending")}</Badge>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {runner.personalBests.length > 0 ? (
              <div className="px-5 py-7 sm:px-7">
                <Eyebrow>{t("runner.personalBestsPanel")}</Eyebrow>
                <ul className="mt-4">
                  {runner.personalBests.map((pb) => (
                    <li
                      key={pb.distance}
                      className="flex justify-between border-b-2 border-line py-3.5 last:border-b-0"
                    >
                      <span className="text-[15px] font-bold">
                        {distanceLabel(t, pb.distance)}
                      </span>
                      <span
                        className={cn(
                          "font-mono text-[17px]",
                          pb.fresh ? "text-neon-lime" : "text-fg-dim",
                        )}
                      >
                        {pb.time}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </aside>
        ) : null}
      </div>

    </div>
  );
}
