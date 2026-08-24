"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Eyebrow } from "@/components/ui/badge";
import { useT } from "@/components/i18n/provider";
import { useLocalizedRouter } from "@/components/i18n/link";
import { distanceLabel } from "@/lib/i18n/labels";
import { cn } from "@/lib/cn";

/**
 * Canonical distance values. `any` and `other` are UI-only sentinels; the rest
 * match the `Distance` union the event list filters on, so the query param
 * this form produces means the same thing in both languages.
 */
const ANY_DISTANCE = "Any distance";

const DISTANCES = [
  ANY_DISTANCE,
  "1 Mile",
  "5K",
  "10K",
  "Half Marathon",
  "Marathon",
  "Ultra",
  "Other",
];

const LOCATIONS = [
  "Puerto Rico",
  "San Juan",
  "Condado",
  "Río Grande",
  "Luquillo",
  "Ponce",
  "Vieques",
];

/**
 * The hero race finder. Submitting hands the criteria to /events as query
 * params, so a search is shareable and survives a reload.
 */
export function RaceSearch({ className }: { className?: string }) {
  const t = useT();
  const router = useLocalizedRouter();
  const [location, setLocation] = useState("Puerto Rico");
  const [distance, setDistance] = useState(ANY_DISTANCE);
  const [date, setDate] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams();
    if (location) params.set("q", location);
    if (distance !== ANY_DISTANCE) params.set("distance", distance);
    if (date) params.set("from", date);
    router.push(`/events?${params.toString()}`);
  }

  const cellClass =
    "flex flex-col justify-center border-b-2 border-line px-5 py-4 last:border-b-0 lg:border-r-2 lg:border-b-0";

  return (
    <form
      onSubmit={submit}
      className={cn(
        "grid grid-cols-1 border-2 border-line bg-carbon lg:grid-cols-[1.3fr_1fr_1fr_auto]",
        className,
      )}
    >
      <div className={cellClass}>
        <Eyebrow>
          <label htmlFor="search-location">{t("search.location")}</label>
        </Eyebrow>
        <input
          id="search-location"
          list="search-location-options"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder={t("search.locationPlaceholder")}
          className="mt-1.5 w-full border-0 bg-transparent p-0 text-base font-semibold text-fg placeholder:text-fg-faint focus:outline-none"
        />
        <datalist id="search-location-options">
          {LOCATIONS.map((l) => (
            <option key={l} value={l} />
          ))}
        </datalist>
      </div>

      <div className={cellClass}>
        <Eyebrow>
          <label htmlFor="search-distance">{t("search.distance")}</label>
        </Eyebrow>
        <select
          id="search-distance"
          value={distance}
          onChange={(e) => setDistance(e.target.value)}
          className="mt-1.5 w-full cursor-pointer appearance-none border-0 bg-transparent p-0 text-base font-semibold text-fg focus:outline-none"
        >
          {DISTANCES.map((d) => (
            <option key={d} value={d} className="bg-charcoal">
              {d === ANY_DISTANCE
                ? t("search.anyDistance")
                : d === "Other"
                  ? t("search.other")
                  : distanceLabel(t, d)}
            </option>
          ))}
        </select>
      </div>

      <div className={cellClass}>
        <Eyebrow>
          <label htmlFor="search-date">{t("search.dateFrom")}</label>
        </Eyebrow>
        <input
          id="search-date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="mt-1.5 w-full border-0 bg-transparent p-0 text-base font-semibold text-fg focus:outline-none"
        />
      </div>

      <Button
        type="submit"
        variant="secondary"
        size="lg"
        className="rounded-none px-10 py-6 lg:py-0"
      >
        {t("search.findRaces")}
      </Button>
    </form>
  );
}
