"use client";

import { Link } from "@/components/i18n/link";
import { useMemo, useState } from "react";
import { Badge, Eyebrow } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { useFormat, useT } from "@/components/i18n/provider";
import type { Translate } from "@/lib/i18n/translate";
import { distanceLabel, genderLabel } from "@/lib/i18n/labels";
import { cn } from "@/lib/cn";
import type { Participant } from "@/lib/types";

/**
 * Race-day check-in. Designed for one thumb, in sunlight, by a volunteer who
 * has never seen the app: oversized targets, very high contrast, one decision
 * per screen, and no destructive action without a visible undo.
 */
export function CheckInStation({ initial }: { initial: Participant[] }) {
  const [people, setPeople] = useState(initial);
  const [query, setQuery] = useState("");
  const [activeBib, setActiveBib] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const { toast } = useToast();
  const t = useT();
  const fmt = useFormat();

  const active = people.find((p) => p.bib === activeBib) ?? null;

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return people
      .filter((p) => `${p.name} ${p.bib}`.toLowerCase().includes(q))
      .slice(0, 6);
  }, [people, query]);

  const checkedIn = people.filter((p) => p.checkedIn).length;

  function simulateScan() {
    setScanning(true);
    window.setTimeout(() => {
      setScanning(false);
      const next = people.find((p) => !p.checkedIn);
      if (next) {
        setActiveBib(next.bib);
        setQuery("");
      }
    }, 1100);
  }

  function confirm(bib: string) {
    setPeople((prev) =>
      prev.map((p) => (p.bib === bib ? { ...p, checkedIn: true } : p)),
    );
    toast({
      title: t("checkin.checkedInTitle"),
      body: t("checkin.checkedInBody", { bib }),
    });
  }

  function undo(bib: string) {
    setPeople((prev) =>
      prev.map((p) => (p.bib === bib ? { ...p, checkedIn: false } : p)),
    );
    toast({
      title: t("checkin.reversedTitle"),
      body: t("checkin.reversedBody", { bib }),
      tone: "info",
    });
  }

  /* ---------------- Participant screen ---------------- */
  if (active) {
    const ready = active.paid;
    return (
      <div className="mx-auto flex min-h-dvh max-w-2xl flex-col">
        <header className="flex items-center gap-3 border-b-2 border-line px-4 py-4">
          <button
            type="button"
            onClick={() => setActiveBib(null)}
            className="flex h-12 w-12 shrink-0 items-center justify-center border-2 border-line-strong text-lg"
            aria-label={t("checkin.backToSearch")}
          >
            ←
          </button>
          <Eyebrow>{t("checkin.eventCheckin")}</Eyebrow>
        </header>

        <div className="flex-1 px-4 py-8">
          <div className="text-center">
            <Eyebrow className="tracking-[0.2em]">
              {t("checkin.bibNumber")}
            </Eyebrow>
            <p className="mt-2 font-display text-8xl leading-none font-black tracking-[-0.04em]">
              {active.bib}
            </p>
            <h1 className="mt-5 font-display text-4xl font-black uppercase">
              {active.name}
            </h1>
            <p className="mt-2 font-mono text-sm tracking-[0.14em] text-fg-dim uppercase">
              {t("checkin.runnerMeta", {
                distance: distanceLabel(t, active.distance),
                age: active.age,
                gender: genderLabel(t, active.gender),
                shirt: active.shirt,
              })}
            </p>
          </div>

          <ul className="mt-9 border-t-2 border-line">
            <CheckRow label={t("checkin.registration")} ok t={t} />
            <CheckRow
              label={t("checkin.payment")}
              ok={active.paid}
              detail={
                active.paid
                  ? undefined
                  : t("checkin.collectAtDesk", { amount: fmt.moneyWhole(40) })
              }
              t={t}
            />
            <CheckRow
              label={t("checkin.shirtRow", { size: active.shirt })}
              ok
              t={t}
            />
          </ul>

          {active.checkedIn ? (
            <div className="animate-pop-in mt-9 border-2 border-neon-lime bg-neon-lime/10 px-5 py-8 text-center">
              <p className="font-display text-5xl font-black text-neon-lime uppercase">
                {t("checkin.checkedIn")}
              </p>
              <p className="mt-3 text-sm text-fg-muted">
                {t("checkin.clearedForStart", { name: active.name })}
              </p>
              <div className="mt-6 flex flex-col gap-3">
                <Button size="lg" onClick={() => setActiveBib(null)}>
                  {t("checkin.nextRunner")}
                </Button>
                <Button
                  variant="ghost"
                  size="md"
                  onClick={() => undo(active.bib)}
                >
                  {t("checkin.undoCheckin")}
                </Button>
              </div>
            </div>
          ) : (
            <div className="mt-9">
              <button
                type="button"
                onClick={() => confirm(active.bib)}
                className={cn(
                  "min-h-24 w-full border-2 text-center font-display text-4xl font-black tracking-[0.06em] uppercase transition-colors active:translate-y-px",
                  ready
                    ? "border-neon-lime bg-neon-lime text-ink"
                    : "border-neon-yellow bg-neon-yellow text-ink",
                )}
              >
                {t("checkin.checkIn")}
              </button>
              {!ready ? (
                <p className="mt-3 text-center text-sm font-semibold text-neon-yellow">
                  {t("checkin.paymentOutstanding")}
                </p>
              ) : null}
            </div>
          )}
        </div>
      </div>
    );
  }

  /* ---------------- Scan / search screen ---------------- */
  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col">
      <header className="flex items-center gap-3 border-b-2 border-line px-4 py-4">
        <Link
          href="/organizer"
          className="flex h-12 w-12 shrink-0 items-center justify-center border-2 border-line-strong text-lg"
          aria-label={t("checkin.backToDashboard")}
        >
          ←
        </Link>
        <div className="min-w-0">
          <Eyebrow>{t("checkin.title")}</Eyebrow>
          <p className="mt-0.5 truncate text-[15px] font-extrabold uppercase">
            Neon Night 10K
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
        <button
          type="button"
          onClick={simulateScan}
          disabled={scanning}
          aria-busy={scanning}
          className={cn(
            "relative flex min-h-56 w-full flex-col items-center justify-center gap-4 border-2 transition-colors",
            scanning
              ? "border-neon-lime bg-neon-lime/8"
              : "border-neon-lime bg-neon-lime text-ink",
          )}
        >
          {/* Viewfinder corners. */}
          <span
            aria-hidden="true"
            className={cn(
              "absolute inset-6 border-2 border-dashed",
              scanning ? "border-neon-lime" : "border-ink/30",
            )}
          />
          <span aria-hidden="true" className="relative text-5xl">
            {scanning ? "◌" : "⛶"}
          </span>
          <span
            className={cn(
              "relative font-display text-2xl font-black tracking-[0.08em] uppercase",
              scanning && "text-neon-lime",
            )}
          >
            {scanning ? t("checkin.scanning") : t("checkin.scanQr")}
          </span>
        </button>

        <div className="my-7 flex items-center gap-4">
          <span className="h-0.5 flex-1 bg-line" />
          <span className="font-mono text-[11px] tracking-[0.16em] text-fg-dim uppercase">
            {t("checkin.orSearch")}
          </span>
          <span className="h-0.5 flex-1 bg-line" />
        </div>

        <Input
          type="search"
          inputMode="search"
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
            <li key={p.bib}>
              <button
                type="button"
                onClick={() => setActiveBib(p.bib)}
                className="flex min-h-16 w-full items-center gap-4 border-b-2 border-line px-2 py-3 text-left hover:bg-carbon"
              >
                <span className="font-mono text-lg tabular-nums text-fg-dim">
                  {p.bib}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-base font-bold">{p.name}</span>
                  <span className="block font-mono text-[11px] text-fg-dim">
                    {t("checkin.listMeta", {
                      distance: distanceLabel(t, p.distance),
                      shirt: p.shirt,
                    })}
                  </span>
                </span>
                {p.checkedIn ? (
                  <Badge tone="green">{t("checkin.in")}</Badge>
                ) : p.paid ? null : (
                  <Badge tone="danger">{t("checkin.unpaid")}</Badge>
                )}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function CheckRow({
  label,
  ok,
  detail,
  t,
}: {
  label: string;
  ok: boolean;
  detail?: string;
  t: Translate;
}) {
  return (
    <li className="flex items-center justify-between gap-4 border-b-2 border-line py-4">
      <span className="text-lg font-semibold">{label}</span>
      <span className="flex items-center gap-3">
        {detail ? (
          <span className="text-sm text-neon-yellow">{detail}</span>
        ) : null}
        <span
          className={cn(
            "flex h-9 w-9 items-center justify-center border-2 text-lg font-black",
            ok
              ? "border-neon-lime text-neon-lime"
              : "border-neon-yellow text-neon-yellow",
          )}
          aria-label={ok ? t("checkin.complete") : t("checkin.outstanding")}
        >
          {ok ? "✓" : "!"}
        </span>
      </span>
    </li>
  );
}
