"use client";

import { Link } from "@/components/i18n/link";
import { useState } from "react";
import { BrandLock } from "@/components/brand/logo";
import { Badge, Eyebrow } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Checkbox,
  Chip,
  Field,
  Input,
  Select,
  Textarea,
} from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { useT } from "@/components/i18n/provider";
import { difficultyLabel, eventTypeLabel } from "@/lib/i18n/labels";
import { cn } from "@/lib/cn";
import type { EventType } from "@/lib/types";

/**
 * Seven-step wizard for listing an event.
 *
 * Like the registration flow this is a single client component holding the
 * draft in memory — the last step shows a confirmation rather than writing
 * anywhere. Steps never block on validation: Next always advances and the
 * rail jumps back to any step already visited, so a draft can be filled in
 * whatever order suits. Only Publish is gated, on the review checklist.
 */

/** Step labels are dictionary keys, resolved at render. */
const STEPS = [
  "publish.steps.basic",
  "publish.steps.location",
  "publish.steps.categories",
  "publish.steps.registration",
  "publish.steps.details",
  "publish.steps.media",
  "publish.steps.review",
] as const;

const EVENT_TYPES: EventType[] = [
  "Road Race",
  "Trail",
  "Track",
  "Virtual Race",
  "Charity Run",
  "Fun Run",
  "Relay",
  "Kids Race",
];

const SHIRT_SIZES = ["XS", "S", "M", "L", "XL", "XXL"];

type Category = {
  id: number;
  name: string;
  distance: string;
  price: string;
  capacity: string;
  start: string;
};

/** Ids for categories added during a session; the two seeded rows take 1 and 2. */
let nextCategoryId = 3;

export function PublishWizard() {
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [type, setType] = useState<EventType>("Road Race");
  const [categories, setCategories] = useState<Category[]>([
    { id: 1, name: "5K", distance: "5", price: "35", capacity: "500", start: "06:00" },
    { id: 2, name: "10K", distance: "10", price: "45", capacity: "300", start: "06:15" },
  ]);
  const [sizes, setSizes] = useState<string[]>(["S", "M", "L", "XL"]);
  const [cover, setCover] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [published, setPublished] = useState(false);
  const { toast } = useToast();
  const t = useT();

  const eventName = name.trim() || t("publish.untitled");

  function addCategory() {
    setCategories((c) => [
      ...c,
      {
        id: nextCategoryId++,
        name: "",
        distance: "",
        price: "",
        capacity: "",
        start: "06:00",
      },
    ]);
  }

  function updateCategory(id: number, patch: Partial<Category>) {
    setCategories((c) => c.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  }

  const checklist = [
    { key: "publish.checklist.info", done: name.trim().length > 0 },
    { key: "publish.checklist.location", done: true },
    {
      key: "publish.checklist.categories",
      done: categories.some((c) => c.name && c.price),
    },
    { key: "publish.checklist.registration", done: sizes.length > 0 },
    { key: "publish.checklist.images", done: cover !== null },
  ];
  const ready = checklist.every((c) => c.done);

  if (published) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-2xl flex-col items-center justify-center px-4 py-16 text-center">
        <div className="animate-pop-in flex h-24 w-24 items-center justify-center bg-neon-lime text-5xl">
          🏁
        </div>
        <h1 className="animate-rise-in mt-8 font-display text-5xl leading-[0.9] font-black uppercase sm:text-6xl">
          {t("publish.publishedTitle")}
        </h1>
        <p className="mt-5 max-w-md text-[15px] leading-relaxed text-fg-dim">
          {t("publish.publishedBody", { name: eventName })}
        </p>
        <div className="mt-9 flex flex-col gap-3 sm:flex-row">
          <Button href="/organizer" size="lg">
            {t("publish.goToDashboard")}
          </Button>
          <Button href="/events" variant="outline" size="lg">
            {t("publish.viewListing")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="pb-28 lg:pb-0">
      {/* Header ---------------------------------------------------------- */}
      <header className="sticky top-0 z-60 border-b-2 border-line bg-ink">
        <div className="mx-auto flex max-w-[1600px] items-center gap-4 px-4 py-3.5 sm:px-6 lg:px-10">
          <BrandLock size={32} compact />
          <div className="hidden min-w-0 border-l-2 border-line pl-4 sm:block">
            <Eyebrow>{t("publish.createEvent")}</Eyebrow>
            <p className="mt-0.5 truncate text-[15px] font-extrabold uppercase">
              {eventName}
            </p>
          </div>
          <div className="flex-1" />
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              toast({
                title: t("publish.draftSavedTitle"),
                body: t("publish.draftSavedBody"),
              })
            }
          >
            {t("publish.saveDraft")}
          </Button>
        </div>

        <div className="flex gap-1 px-4 pb-3 sm:px-6 lg:hidden">
          {STEPS.map((s, i) => (
            <span
              key={s}
              className={cn("h-1.5 flex-1", i <= step ? "bg-neon-lime" : "bg-line")}
            />
          ))}
        </div>
      </header>

      <div className="mx-auto grid max-w-[1600px] lg:grid-cols-[260px_1fr]">
        {/* Step rail ---------------------------------------------------- */}
        <nav
          aria-label={t("publish.stepNav")}
          className="hidden border-r-2 border-line lg:block"
        >
          <ol className="sticky top-24">
            {STEPS.map((s, i) => (
              <li key={s}>
                <button
                  type="button"
                  onClick={() => i <= step && setStep(i)}
                  disabled={i > step}
                  aria-current={i === step ? "step" : undefined}
                  className={cn(
                    "flex w-full items-center gap-3 border-b-2 border-line px-5 py-4 text-left",
                    i === step
                      ? "bg-neon-lime text-ink"
                      : i < step
                        ? "text-fg hover:bg-carbon"
                        : "text-fg-faint",
                  )}
                >
                  <span className="font-mono text-[11px] tracking-[0.18em] opacity-75">
                    0{i + 1}
                  </span>
                  <span className="text-[13px] font-extrabold tracking-[0.08em] uppercase">
                    {t(s)}
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </nav>

        <main className="px-4 py-8 sm:px-8 lg:min-h-[46rem] lg:px-12 lg:py-12">
          <p className="font-mono text-[11px] tracking-[0.18em] text-neon-lime uppercase">
            {t("publish.stepOf", {
              current: step + 1,
              total: STEPS.length,
            })}
          </p>
          <h1 className="mt-3 font-display text-3xl font-black uppercase sm:text-4xl">
            {t(STEPS[step])}
          </h1>

          {/* 1 — Basic info -------------------------------------------- */}
          {step === 0 ? (
            <div className="mt-8 flex max-w-3xl flex-col gap-6">
              <Field
                label={t("publish.eventName")}
                hint={t("publish.eventNameHint")}
              >
                {(p) => (
                  <Input
                    {...p}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={t("publish.eventNamePlaceholder")}
                  />
                )}
              </Field>

              <Field
                label={t("publish.eventDescription")}
                hint={t("publish.eventDescriptionHint")}
              >
                {(p) => (
                  <Textarea
                    {...p}
                    placeholder={t("publish.eventDescriptionPlaceholder")}
                  />
                )}
              </Field>

              <div>
                <Eyebrow>{t("publish.eventType")}</Eyebrow>
                <div className="mt-3 flex flex-wrap gap-2">
                  {EVENT_TYPES.map((option) => (
                    <Chip
                      key={option}
                      active={type === option}
                      onClick={() => setType(option)}
                    >
                      {eventTypeLabel(t, option)}
                    </Chip>
                  ))}
                </div>
              </div>

              <div className="grid gap-6 sm:grid-cols-2">
                <Field label={t("publish.eventDate")}>
                  {(p) => <Input {...p} type="date" defaultValue="2026-09-12" />}
                </Field>
                <Field label={t("publish.startTime")}>
                  {(p) => <Input {...p} type="time" defaultValue="18:00" />}
                </Field>
                <Field label={t("publish.registrationOpens")}>
                  {(p) => <Input {...p} type="date" defaultValue="2026-06-01" />}
                </Field>
                <Field label={t("publish.registrationCloses")}>
                  {(p) => <Input {...p} type="date" defaultValue="2026-09-09" />}
                </Field>
              </div>
            </div>
          ) : null}

          {/* 2 — Location ---------------------------------------------- */}
          {step === 1 ? (
            <div className="mt-8 grid max-w-5xl gap-8 lg:grid-cols-[1fr_1fr]">
              <div className="flex flex-col gap-6">
                <Field label={t("publish.venueName")}>
                  {(p) => <Input {...p} placeholder="Paseo de la Princesa" />}
                </Field>
                <Field label={t("publish.streetAddress")}>
                  {(p) => (
                    <Input {...p} placeholder={t("publish.streetPlaceholder")} />
                  )}
                </Field>
                <div className="grid gap-6 sm:grid-cols-2">
                  <Field label={t("publish.city")}>
                    {(p) => <Input {...p} placeholder="San Juan" />}
                  </Field>
                  <Field label={t("publish.region")}>
                    {(p) => <Input {...p} placeholder="Puerto Rico" />}
                  </Field>
                  <Field label={t("publish.postalCode")}>
                    {(p) => <Input {...p} placeholder="00901" inputMode="numeric" />}
                  </Field>
                  <Field label={t("publish.country")}>
                    {(p) => (
                      <Select {...p} defaultValue="PR">
                        <option value="PR">Puerto Rico</option>
                        <option value="US">
                          {t("publish.countryUS")}
                        </option>
                        <option value="DO">
                          {t("publish.countryDO")}
                        </option>
                        <option value="other">
                          {t("publish.countryOther")}
                        </option>
                      </Select>
                    )}
                  </Field>
                </div>
              </div>

              <div>
                <Eyebrow>{t("publish.positionMarkers")}</Eyebrow>
                <div className="bg-grid-map relative mt-3 h-80 border-2 border-line bg-carbon">
                  <button
                    type="button"
                    className="absolute top-[58%] left-[24%] -translate-x-1/2 -translate-y-1/2 cursor-move bg-neon-green px-2.5 py-1.5 text-[11px] font-black text-ink"
                  >
                    {t("publish.start")}
                  </button>
                  <button
                    type="button"
                    className="absolute top-[38%] left-[68%] -translate-x-1/2 -translate-y-1/2 cursor-move bg-neon-yellow px-2.5 py-1.5 text-[11px] font-black text-ink"
                  >
                    {t("publish.finish")}
                  </button>
                  <p className="absolute bottom-4 left-4 font-mono text-[10px] tracking-[0.14em] text-fg-faint uppercase">
                    {t("publish.dragMarkers")}
                  </p>
                </div>
              </div>
            </div>
          ) : null}

          {/* 3 — Race categories --------------------------------------- */}
          {step === 2 ? (
            <div className="mt-8 max-w-4xl">
              <p className="text-[15px] text-fg-dim">
                {t("publish.categoriesIntro")}
              </p>

              <ul className="mt-7 flex flex-col gap-4">
                {categories.map((c, i) => (
                  <li key={c.id} className="border-2 border-line bg-carbon">
                    <div className="flex items-center justify-between border-b-2 border-line px-5 py-3.5">
                      <Eyebrow>
                        {t("publish.category", { n: i + 1 })}
                      </Eyebrow>
                      {categories.length > 1 ? (
                        <button
                          type="button"
                          onClick={() =>
                            setCategories((list) =>
                              list.filter((x) => x.id !== c.id),
                            )
                          }
                          className="text-[11px] font-bold tracking-wider text-danger uppercase hover:underline"
                        >
                          {t("publish.remove")}
                        </button>
                      ) : null}
                    </div>
                    <div className="grid gap-5 p-5 sm:grid-cols-2 lg:grid-cols-5">
                      <Field label={t("publish.name")}>
                        {(p) => (
                          <Input
                            {...p}
                            value={c.name}
                            placeholder="10K"
                            onChange={(e) =>
                              updateCategory(c.id, { name: e.target.value })
                            }
                          />
                        )}
                      </Field>
                      <Field label={t("publish.distanceKm")}>
                        {(p) => (
                          <Input
                            {...p}
                            value={c.distance}
                            inputMode="decimal"
                            placeholder="10"
                            onChange={(e) =>
                              updateCategory(c.id, { distance: e.target.value })
                            }
                          />
                        )}
                      </Field>
                      <Field label={t("publish.priceUsd")}>
                        {(p) => (
                          <Input
                            {...p}
                            value={c.price}
                            inputMode="numeric"
                            placeholder="45"
                            onChange={(e) =>
                              updateCategory(c.id, { price: e.target.value })
                            }
                          />
                        )}
                      </Field>
                      <Field label={t("publish.maxParticipants")}>
                        {(p) => (
                          <Input
                            {...p}
                            value={c.capacity}
                            inputMode="numeric"
                            placeholder="500"
                            onChange={(e) =>
                              updateCategory(c.id, { capacity: e.target.value })
                            }
                          />
                        )}
                      </Field>
                      <Field label={t("publish.startTime")}>
                        {(p) => (
                          <Input
                            {...p}
                            type="time"
                            value={c.start}
                            onChange={(e) =>
                              updateCategory(c.id, { start: e.target.value })
                            }
                          />
                        )}
                      </Field>
                    </div>
                  </li>
                ))}
              </ul>

              <Button
                variant="outline"
                size="lg"
                className="mt-5"
                onClick={addCategory}
              >
                {t("publish.addCategory")}
              </Button>
            </div>
          ) : null}

          {/* 4 — Registration settings --------------------------------- */}
          {step === 3 ? (
            <div className="mt-8 flex max-w-3xl flex-col gap-8">
              <div className="grid gap-6 sm:grid-cols-3">
                <Field label={t("publish.participantLimit")}>
                  {(p) => <Input {...p} defaultValue="800" inputMode="numeric" />}
                </Field>
                <Field label={t("publish.minimumAge")}>
                  {(p) => <Input {...p} defaultValue="14" inputMode="numeric" />}
                </Field>
                <Field label={t("publish.maximumAge")} optional>
                  {(p) => (
                    <Input
                      {...p}
                      placeholder={t("publish.noLimit")}
                      inputMode="numeric"
                    />
                  )}
                </Field>
              </div>

              <div>
                <Eyebrow>{t("publish.shirtSizes")}</Eyebrow>
                <div className="mt-3 flex flex-wrap gap-2">
                  {SHIRT_SIZES.map((s) => (
                    <Chip
                      key={s}
                      active={sizes.includes(s)}
                      onClick={() =>
                        setSizes((v) =>
                          v.includes(s) ? v.filter((x) => x !== s) : [...v, s],
                        )
                      }
                    >
                      {s}
                    </Chip>
                  ))}
                </div>
              </div>

              <fieldset className="flex flex-col gap-4 border-2 border-line p-5">
                <legend className="px-2 font-mono text-[10px] tracking-[0.18em] text-fg-faint uppercase">
                  {t("publish.collectAtRegistration")}
                </legend>
                <Checkbox defaultChecked label={t("publish.collectEmergency")} />
                <Checkbox defaultChecked label={t("publish.collectWaiver")} />
                <Checkbox defaultChecked label={t("publish.collectEstimate")} />
                <Checkbox label={t("publish.collectClub")} />
                <Checkbox label={t("publish.collectMedical")} />
              </fieldset>

              <Field
                label={t("publish.customQuestion")}
                optional
                hint={t("publish.customQuestionHint")}
              >
                {(p) => (
                  <Input
                    {...p}
                    placeholder={t("publish.customQuestionPlaceholder")}
                  />
                )}
              </Field>

              <div className="grid gap-6 sm:grid-cols-2">
                <Field label={t("publish.promoCode")} optional>
                  {(p) => <Input {...p} placeholder="CLUB25" />}
                </Field>
                <Field label={t("publish.discount")} optional>
                  {(p) => <Input {...p} placeholder="25" inputMode="numeric" />}
                </Field>
              </div>
            </div>
          ) : null}

          {/* 5 — Event details ----------------------------------------- */}
          {step === 4 ? (
            <div className="mt-8 flex max-w-3xl flex-col gap-6">
              <div className="grid gap-6 sm:grid-cols-2">
                <Field label={t("publish.terrain")}>
                  {(p) => (
                    <Input {...p} placeholder={t("publish.terrainPlaceholder")} />
                  )}
                </Field>
                <Field label={t("publish.difficulty")}>
                  {(p) => (
                    <Select {...p} defaultValue="Moderate">
                      {(["Easy", "Moderate", "Hard"] as const).map((level) => (
                        <option key={level} value={level}>
                          {difficultyLabel(t, level)}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
                <Field label={t("publish.elevationGain")}>
                  {(p) => <Input {...p} placeholder="42" inputMode="numeric" />}
                </Field>
                <Field label={t("publish.cutoffTime")}>
                  {(p) => <Input {...p} placeholder="1:45:00" />}
                </Field>
              </div>

              <Field
                label={t("publish.aidStations")}
                hint={t("publish.aidStationsHint")}
              >
                {(p) => (
                  <Textarea
                    {...p}
                    defaultValue={t("publish.aidStationsDefault")}
                  />
                )}
              </Field>

              <Field
                label={t("publish.daySchedule")}
                hint={t("publish.dayScheduleHint")}
              >
                {(p) => (
                  <Textarea
                    {...p}
                    defaultValue={t("publish.dayScheduleDefault")}
                  />
                )}
              </Field>

              <Field label={t("publish.parkingDirections")}>
                {(p) => (
                  <Textarea {...p} placeholder={t("publish.parkingPlaceholder")} />
                )}
              </Field>
            </div>
          ) : null}

          {/* 6 — Media --------------------------------------------------- */}
          {step === 5 ? (
            <div className="mt-8 max-w-3xl">
              <Eyebrow>{t("publish.coverImage")}</Eyebrow>
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  setCover(e.dataTransfer.files[0]?.name ?? "cover.jpg");
                }}
                className={cn(
                  "mt-3 border-2 border-dashed px-6 py-14 text-center transition-colors",
                  dragging
                    ? "border-neon-lime bg-neon-lime/6"
                    : cover
                      ? "border-neon-lime"
                      : "border-line",
                )}
              >
                {cover ? (
                  <>
                    <div className="bg-cover-wash mx-auto h-32 w-full max-w-md border-2 border-line" />
                    <p className="mt-4 font-mono text-[12px] text-neon-lime">
                      {cover}
                    </p>
                    <button
                      type="button"
                      onClick={() => setCover(null)}
                      className="mt-3 text-[11px] font-bold tracking-wider text-fg-dim uppercase hover:text-danger"
                    >
                      {t("publish.remove")}
                    </button>
                  </>
                ) : (
                  <>
                    <p className="font-display text-2xl font-black uppercase">
                      {t("publish.dropCover")}
                    </p>
                    <p className="mt-2 text-sm text-fg-dim">
                      {t("publish.coverSpec")}
                    </p>
                    <label className="mt-6 inline-flex cursor-pointer border-2 border-line-strong px-5 py-3 text-xs font-black tracking-[0.12em] uppercase hover:border-neon-lime hover:text-neon-lime">
                      {t("publish.chooseFile")}
                      <input
                        type="file"
                        accept="image/*"
                        className="sr-only"
                        onChange={(e) =>
                          setCover(e.target.files?.[0]?.name ?? null)
                        }
                      />
                    </label>
                  </>
                )}
              </div>

              <Eyebrow className="mt-9">{t("publish.gallery")}</Eyebrow>
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div
                    key={i}
                    className="flex aspect-4/3 items-center justify-center border-2 border-dashed border-line text-2xl text-fg-faint"
                  >
                    +
                  </div>
                ))}
              </div>

              <Eyebrow className="mt-9">{t("publish.sponsorLogos")}</Eyebrow>
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div
                    key={i}
                    className="flex h-20 items-center justify-center border-2 border-dashed border-line text-xs text-fg-faint"
                  >
                    {t("publish.uploadLogo")}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {/* 7 — Review -------------------------------------------------- */}
          {step === 6 ? (
            <div className="mt-8 grid max-w-5xl gap-8 lg:grid-cols-[1fr_320px]">
              {/* Listing preview */}
              <div>
                <Eyebrow>{t("publish.listingPreview")}</Eyebrow>
                <article className="mt-3 border-2 border-line bg-carbon">
                  <div className="bg-cover-wash relative h-40">
                    <div className="bg-track-lanes absolute inset-0" />
                    <Badge
                      tone="neutral"
                      className="absolute top-0 left-0 bg-ink font-mono text-[10px] font-normal text-neon-lime"
                    >
                      {eventTypeLabel(t, type)}
                    </Badge>
                  </div>
                  <div className="p-5">
                    <Badge tone="lime">
                      {t("publish.registrationOpen")}
                    </Badge>
                    <h2 className="mt-3 font-display text-3xl font-black uppercase">
                      {eventName}
                    </h2>
                    <p className="mt-2 font-mono text-[11px] tracking-[0.12em] text-fg-faint uppercase">
                      {t("publish.previewDate")}
                    </p>
                    <div className="mt-5 flex items-baseline gap-2 border-t-2 border-line pt-4">
                      <span className="font-mono text-[11px] text-fg-dim">
                        {t("publish.from")}
                      </span>
                      <span className="font-display text-2xl font-black text-neon-yellow">
                        $
                        {categories.reduce(
                          (min, c) =>
                            c.price ? Math.min(min, Number(c.price)) : min,
                          Infinity,
                        ) === Infinity
                          ? "—"
                          : Math.min(
                              ...categories
                                .filter((c) => c.price)
                                .map((c) => Number(c.price)),
                            )}
                      </span>
                    </div>
                  </div>
                </article>
              </div>

              {/* Checklist */}
              <div>
                <Eyebrow>{t("publish.beforePublishing")}</Eyebrow>
                <ul className="mt-3 border-2 border-line">
                  {checklist.map((c) => (
                    <li
                      key={c.key}
                      className="flex items-center gap-3 border-b-2 border-line px-4 py-3.5 last:border-b-0"
                    >
                      <span
                        aria-hidden="true"
                        className={cn(
                          "flex h-6 w-6 shrink-0 items-center justify-center border-2 text-xs font-black",
                          c.done
                            ? "border-neon-lime text-neon-lime"
                            : "border-line-bright text-fg-faint",
                        )}
                      >
                        {c.done ? "✓" : "—"}
                      </span>
                      <span
                        className={cn(
                          "text-sm",
                          c.done ? "text-fg" : "text-fg-dim",
                        )}
                      >
                        {t(c.key)}
                      </span>
                    </li>
                  ))}
                </ul>

                {!ready ? (
                  <p className="mt-4 text-[13px] leading-relaxed text-neon-yellow">
                    {t("publish.finishItems")}
                  </p>
                ) : null}

                <div className="mt-6 flex flex-col gap-3">
                  <Button
                    block
                    size="xl"
                    disabled={!ready}
                    onClick={() => setPublished(true)}
                  >
                    {t("publish.publishEvent")}
                  </Button>
                  <Button
                    block
                    variant="outline"
                    size="lg"
                    onClick={() =>
                      toast({
                        title: t("publish.draftSavedTitle"),
                        body: t("publish.draftSavedBodyNamed", {
                          name: eventName,
                        }),
                      })
                    }
                  >
                    {t("publish.saveDraft")}
                  </Button>
                </div>

                <p className="mt-5 text-xs leading-relaxed text-fg-faint">
                  {t("publish.termsPre")}{" "}
                  <Link href="/legal/organizer-terms" className="text-neon-lime underline">
                    {t("publish.termsLink")}
                  </Link>
                  .
                </p>
              </div>
            </div>
          ) : null}
        </main>
      </div>

      {/* Step controls --------------------------------------------------- */}
      <div className="fixed inset-x-0 bottom-0 z-60 flex items-center gap-3 border-t-2 border-line bg-ink px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:static lg:mx-auto lg:max-w-[1600px] lg:justify-end lg:border-t-2 lg:px-10 lg:py-6">
        <Button
          variant="outline"
          size="lg"
          disabled={step === 0}
          onClick={() => setStep((s) => Math.max(0, s - 1))}
        >
          {t("publish.back")}
        </Button>
        <Button
          size="lg"
          className="flex-1 lg:flex-none"
          disabled={step === STEPS.length - 1}
          onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}
        >
          {t("publish.continue")}
        </Button>
      </div>
    </div>
  );
}
