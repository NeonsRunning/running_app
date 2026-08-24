"use client";

import { Link } from "@/components/i18n/link";
import { useMemo, useState } from "react";
import { Input, SegmentedControl } from "@/components/ui/field";
import { EmptyState } from "@/components/ui/misc";
import { useT } from "@/components/i18n/provider";
import { cn } from "@/lib/cn";
import type { LeaderboardRow } from "@/lib/types";

type Filter = "overall" | "M" | "F" | "age";

const MEDALS: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" };

export function Leaderboard({
  rows,
  slug,
  highlightBib,
}: {
  rows: LeaderboardRow[];
  slug: string;
  highlightBib?: string;
}) {
  const t = useT();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("overall");

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (q && !`${r.name} ${r.bib}`.toLowerCase().includes(q)) return false;
      if (filter === "M" || filter === "F") return r.gender === filter;
      // "My age group" is pinned to the demo runner's bracket; with real
      // accounts it would come from the signed-in runner's profile.
      if (filter === "age") return r.ageGroup === "30–34";
      return true;
    });
  }, [rows, query, filter]);

  return (
    <div>
      <div className="flex flex-col gap-4 border-b-2 border-line px-4 py-5 sm:px-6 lg:flex-row lg:items-center">
        <div className="lg:w-96">
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("leaderboard.searchPlaceholder")}
            aria-label={t("leaderboard.searchAria")}
          />
        </div>
        <div className="flex-1" />
        <SegmentedControl
          label={t("leaderboard.filter")}
          value={filter}
          onChange={setFilter}
          options={[
            { value: "overall", label: t("leaderboard.overall") },
            { value: "M", label: t("leaderboard.male") },
            { value: "F", label: t("leaderboard.female") },
            { value: "age", label: "30–34" },
          ]}
        />
      </div>

      {visible.length === 0 ? (
        <div className="p-6">
          <EmptyState
            icon="⏱"
            title={t("leaderboard.emptyTitle")}
            body={t("leaderboard.emptyBody")}
          />
        </div>
      ) : (
        <>
          {/* Table on tablet and up. */}
          <table className="hidden w-full border-collapse sm:table">
            <thead>
              <tr className="border-b-2 border-line text-left">
                {[
                  "leaderboard.place",
                  "leaderboard.runner",
                  "leaderboard.bib",
                  "leaderboard.time",
                  "leaderboard.pace",
                  "leaderboard.ageGroup",
                ].map((key) => (
                  <th
                    key={key}
                    scope="col"
                    className="px-5 py-3.5 font-mono text-[10px] tracking-[0.16em] text-fg-dim uppercase"
                  >
                    {t(key)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr
                  key={r.bib}
                  className={cn(
                    "border-b-2 border-line transition-colors hover:bg-carbon",
                    r.bib === highlightBib && "bg-neon-lime/6",
                  )}
                >
                  <td className="px-5 py-4">
                    <span
                      className={cn(
                        "font-display text-xl font-black",
                        r.place <= 3 ? "text-neon-yellow" : "text-fg",
                      )}
                    >
                      {MEDALS[r.place] ? (
                        <span aria-hidden="true" className="mr-1.5">
                          {MEDALS[r.place]}
                        </span>
                      ) : null}
                      {r.place}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <Link
                      href={`/events/${slug}/results/${r.bib}`}
                      className="text-[15px] font-bold hover:text-neon-lime"
                    >
                      {r.name}
                    </Link>
                  </td>
                  <td className="px-5 py-4 font-mono text-sm text-fg-dim">
                    {r.bib}
                  </td>
                  <td className="px-5 py-4 font-mono text-lg">{r.time}</td>
                  <td className="px-5 py-4 font-mono text-sm text-fg-muted">
                    {r.pace}
                  </td>
                  <td className="px-5 py-4 font-mono text-sm text-fg-dim">
                    {r.ageGroup}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Stacked cards on phones — a six-column table does not shrink. */}
          <ul className="sm:hidden">
            {visible.map((r) => (
              <li
                key={r.bib}
                className={cn(
                  "border-b-2 border-line px-4 py-4",
                  r.bib === highlightBib && "bg-neon-lime/6",
                )}
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <span
                      className={cn(
                        "font-display text-2xl font-black",
                        r.place <= 3 ? "text-neon-yellow" : "text-fg",
                      )}
                    >
                      {MEDALS[r.place] ?? r.place}
                    </span>
                    <div>
                      <Link
                        href={`/events/${slug}/results/${r.bib}`}
                        className="text-[15px] font-bold hover:text-neon-lime"
                      >
                        {r.name}
                      </Link>
                      <p className="font-mono text-[11px] text-fg-dim">
                        {t("leaderboard.bibInline", { bib: r.bib })} ·{" "}
                        {r.ageGroup}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-lg">{r.time}</p>
                    <p className="font-mono text-[11px] text-fg-dim">{r.pace}</p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
