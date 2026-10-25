"use client";

import { Link } from "@/components/i18n/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Badge, Eyebrow } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { useFormat, useT } from "@/components/i18n/provider";
import type { Translate } from "@/lib/i18n/translate";
import { distanceLabel, genderLabel } from "@/lib/i18n/labels";
import { setCheckedInAction } from "@/lib/events/check-in";
import type { CheckInList, CheckInRunner } from "@/lib/events/organizer";

/**
 * Race-day check-in. Designed for one thumb, in sunlight, by a volunteer who
 * has never seen the app: oversized targets, very high contrast, one decision
 * per screen, and no destructive action without a visible undo.
 *
 * A tap shows at once and saves behind it; the list then refreshes from the
 * server, which also brings in runners checked in on another phone.
 */
export function CheckInStation({ list }: { list: CheckInList }) {
  const { event, runners: initial } = list;
  const router = useRouter();
  const { toast } = useToast();
  const t = useT();
  const fmt = useFormat();
  const [query, setQuery] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Taps not yet back from the server: registration id → checked-in time.
  const [pending, setPending] = useState<ReadonlyMap<string, string | null>>(new Map());

  // Refreshed rows already carry what was tapped here.
  const [prevInitial, setPrevInitial] = useState(initial);
  if (initial !== prevInitial) {
    setPrevInitial(initial);
    setPending(new Map());
  }

  const people = useMemo(
    () =>
      initial.map((p) =>
        pending.has(p.id) ? { ...p, checkedInAt: pending.get(p.id) ?? null } : p,
      ),
    [initial, pending],
  );

  const active = people.find((p) => p.id === activeId) ?? null;

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return people
      .filter((p) => `${p.name} ${p.bib ?? ""}`.toLowerCase().includes(q))
      .slice(0, 6);
  }, [people, query]);

  const checkedIn = people.filter((p) => p.checkedInAt).length;

  async function save(runner: CheckInRunner, checkIn: boolean) {
    const bib = runner.bib ?? "—";
    setBusy(true);
    setPending((prev) =>
      new Map(prev).set(runner.id, checkIn ? new Date().toISOString() : null),
    );
    const result = await setCheckedInAction(runner.id, checkIn);
    setBusy(false);

    if (!result.ok) {
      setPending((prev) => {
        const next = new Map(prev);
        next.delete(runner.id);
        return next;
      });
      toast({
        title: t("checkin.errors.title"),
        body: t(`checkin.errors.${result.error}`),
        tone: "danger",
      });
      return;
    }

    toast(
      checkIn
        ? { title: t("checkin.checkedInTitle"), body: t("checkin.checkedInBody", { bib }) }
        : { title: t("checkin.reversedTitle"), body: t("checkin.reversedBody", { bib }), tone: "info" },
    );
    router.refresh();
  }

  /* ---------------- Participant screen ---------------- */
  if (active) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-2xl flex-col">
        <header className="flex items-center gap-3 border-b-2 border-line px-4 py-4">
          <button
            type="button"
            onClick={() => setActiveId(null)}
            className="flex h-12 w-12 shrink-0 items-center justify-center border-2 border-line-strong text-lg"
            aria-label={t("checkin.backToSearch")}
          >
            ←
          </button>
          <Eyebrow className="min-w-0 truncate">
            {t("checkin.eventCheckin", { event: event.name })}
          </Eyebrow>
        </header>

        <div className="flex-1 px-4 py-8">
          <div className="text-center">
            <Eyebrow className="tracking-[0.2em]">
              {t("checkin.bibNumber")}
            </Eyebrow>
            <p className="mt-2 font-display text-8xl leading-none font-black tracking-[-0.04em]">
              {active.bib ?? "—"}
            </p>
            <h1 className="mt-5 font-display text-4xl font-black wrap-break-word uppercase">
              {active.name}
            </h1>
            <p className="mt-2 font-mono text-sm tracking-[0.14em] text-fg-dim uppercase">
              {t("checkin.runnerMeta", {
                distance: distanceLabel(t, active.distance),
                age: active.age,
                gender: genderLabel(t, active.gender),
              })}
            </p>
          </div>

          <ul className="mt-9 border-t-2 border-line">
            <CheckRow label={t("checkin.registration")} t={t} />
            <CheckRow label={t("checkin.payment")} t={t} />
            {active.shirtSize ? (
              <CheckRow
                label={t("checkin.shirtRow", { size: active.shirtSize })}
                t={t}
              />
            ) : null}
            {active.kitByMail ? (
              <CheckRow
                label={t("checkin.kitRow")}
                detail={t("checkin.kitMailed")}
                t={t}
              />
            ) : null}
          </ul>

          {active.checkedInAt ? (
            <div className="animate-pop-in mt-9 border-2 border-neon-lime bg-neon-lime/10 px-5 py-8 text-center">
              <p className="font-display text-5xl font-black text-neon-lime uppercase">
                {t("checkin.checkedIn")}
              </p>
              <p className="mt-3 text-sm text-fg-muted">
                {t("checkin.clearedForStart", { name: active.name })}
              </p>
              <div className="mt-6 flex flex-col gap-3">
                <Button size="lg" onClick={() => setActiveId(null)}>
                  {t("checkin.nextRunner")}
                </Button>
                <Button
                  variant="ghost"
                  size="md"
                  disabled={busy}
                  onClick={() => save(active, false)}
                >
                  {t("checkin.undoCheckin")}
                </Button>
              </div>
            </div>
          ) : (
            <div className="mt-9">
              <button
                type="button"
                disabled={busy}
                aria-busy={busy}
                onClick={() => save(active, true)}
                className="min-h-24 w-full border-2 border-neon-lime bg-neon-lime text-center font-display text-4xl font-black tracking-[0.06em] text-ink uppercase transition-colors active:translate-y-px disabled:opacity-60"
              >
                {t("checkin.checkIn")}
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  /* ---------------- Search screen ---------------- */
  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col">
      <header className="flex items-center gap-3 border-b-2 border-line px-4 py-4">
        <Link
          href={`/events/${event.slug}`}
          className="flex h-12 w-12 shrink-0 items-center justify-center border-2 border-line-strong text-lg"
          aria-label={t("checkin.backToEvent")}
        >
          ←
        </Link>
        <div className="min-w-0">
          <Eyebrow>{t("checkin.title")}</Eyebrow>
          <p className="mt-0.5 truncate text-[15px] font-extrabold uppercase">
            {event.name}
          </p>
        </div>
        <div className="flex-1" />
        <div className="text-right">
          <p className="font-display text-2xl leading-none font-black text-neon-lime">
            {fmt.number(checkedIn)}
          </p>
          <p className="font-mono text-[9px] tracking-[0.14em] text-fg-dim uppercase">
            {t("checkin.ofTotal", { total: fmt.number(people.length) })}
          </p>
        </div>
      </header>

      <div className="flex-1 px-4 py-6">
        {people.length === 0 ? (
          <p className="border-2 border-dashed border-line px-4 py-8 text-center text-sm text-fg-dim">
            {t("checkin.noRunners")}
          </p>
        ) : (
          <>
            <Input
              type="search"
              inputMode="search"
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("checkin.searchPlaceholder")}
              aria-label={t("checkin.searchAria")}
              className="min-h-14 text-lg"
            />

            {query.trim() && matches.length === 0 ? (
              <p className="mt-5 border-2 border-dashed border-line px-4 py-8 text-center text-sm text-fg-dim">
                {t("checkin.noRunner", { query })}
              </p>
            ) : null}

            <ul className="mt-4">
              {matches.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => setActiveId(p.id)}
                    className="flex min-h-16 w-full items-center gap-4 border-b-2 border-line px-2 py-3 text-left hover:bg-carbon"
                  >
                    <span className="font-mono text-lg tabular-nums text-fg-dim">
                      {p.bib ?? "—"}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-base font-bold">{p.name}</span>
                      <span className="block font-mono text-[11px] text-fg-dim">
                        {p.shirtSize
                          ? t("checkin.listMeta", {
                              distance: distanceLabel(t, p.distance),
                              shirt: p.shirtSize,
                            })
                          : distanceLabel(t, p.distance)}
                      </span>
                    </span>
                    {p.checkedInAt ? (
                      <Badge tone="green">{t("checkin.in")}</Badge>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}

function CheckRow({
  label,
  detail,
  t,
}: {
  label: string;
  detail?: string;
  t: Translate;
}) {
  return (
    <li className="flex items-center justify-between gap-4 border-b-2 border-line py-4">
      <span className="text-lg font-semibold">{label}</span>
      <span className="flex items-center gap-3">
        {detail ? (
          <span className="text-right text-sm text-fg-dim">{detail}</span>
        ) : null}
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center border-2 border-neon-lime text-lg font-black text-neon-lime"
          aria-label={t("checkin.complete")}
        >
          ✓
        </span>
      </span>
    </li>
  );
}
