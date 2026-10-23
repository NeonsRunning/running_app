"use client";

import { Link, useLocalizedRouter } from "@/components/i18n/link";
import {
  useRef,
  useState,
  useTransition,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { BrandLock } from "@/components/brand/logo";
import { EventCover } from "@/components/events/event-card";
import { ImageStep } from "@/components/publish/image-step";
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
import { ArrowLeftIcon } from "@/components/ui/icons";
import { ConfirmDialog } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { useFormat, useLocale, useT } from "@/components/i18n/provider";
import {
  deleteEventAction,
  saveEventAction,
  type EventFormState,
} from "@/lib/events/actions";
import type { AthMovilAccountRow } from "@/lib/ath-movil/queries";
import { EMPTY_EVENT_FORM, type EventFormValues } from "@/lib/events/form";
import { eventImageUrl } from "@/lib/events/images";
import {
  COUNTRIES,
  DIFFICULTIES,
  DISTANCES,
  DISTANCE_KM,
  EVENT_TYPES,
  PR_MUNICIPALITIES,
  SHIRT_SIZES,
  isOneOf,
  type Country,
  type ShirtSize,
} from "@/lib/events/vocabulary";
import {
  difficultyLabel,
  distanceLabel,
  eventTypeLabel,
} from "@/lib/i18n/labels";
import { localizePath } from "@/lib/i18n/config";
import { cn } from "@/lib/cn";
import type { Distance, EventType } from "@/lib/types";

/**
 * Ten-step wizard for listing an event, and for editing one.
 *
 * One form spans every step. Inactive steps are hidden rather than unmounted,
 * so an uncontrolled input keeps its value while the organizer moves around,
 * and every save posts the lot to `saveEventAction`. Steps never block on
 * validation: Next always advances and the rail jumps back to any step already
 * visited. The server validates everything; its errors land beside their
 * fields, and the wizard opens the first step that has one.
 *
 * A new event starts from `EMPTY_EVENT_FORM`; an existing one from its saved
 * row. "Save draft" keeps a listing private, "Publish" makes it live, and a
 * live listing only ever saves as live.
 */

/** Step labels are dictionary keys, resolved at render. */
const STEPS = [
  "publish.steps.basic",
  "publish.steps.location",
  "publish.steps.categories",
  "publish.steps.registration",
  "publish.steps.extras",
  "publish.steps.details",
  "publish.steps.image",
  "publish.steps.route",
  "publish.steps.medal",
  "publish.steps.review",
] as const;

const REVIEW_STEP = STEPS.length - 1;

/** Which step each server-validated field lives on. */
const FIELD_STEP: Record<string, number> = {
  name: 0,
  description: 0,
  type: 0,
  event_date: 0,
  end_date: 0,
  start_time: 0,
  registration_opens: 0,
  registration_closes: 0,
  venue: 1,
  address: 1,
  city: 1,
  region: 1,
  postal_code: 1,
  country: 1,
  categories: 2,
  capacity: 3,
  minimum_age: 3,
  maximum_age: 3,
  ath_movil_account_id: 3,
  offers_shirt: 4,
  shirt_price: 4,
  shirt_sizes: 4,
  photo_price: 4,
  donation_recipient: 4,
  shipping_price: 4,
  terrain: 5,
  difficulty: 5,
  elevation_gain: 5,
  cutoff: 5,
  aid_stations: 5,
  schedule: 5,
  parking: 5,
  directions: 5,
  image_path: 6,
  route_image_path: 7,
  medal_image_path: 8,
};

/** A form row: the stored category plus a key that survives reordering. */
type Category = EventFormValues["categories"][number] & { key: number };

/** Keys for category rows; only needs to be unique within a session. */
let nextCategoryKey = 1;

export function PublishWizard({
  initial = EMPTY_EVENT_FORM,
  athMovilAccounts = [],
}: {
  initial?: EventFormValues;
  /** The ATH Móvil Business accounts admins listed, retired ones included. */
  athMovilAccounts?: AthMovilAccountRow[];
}) {
  const [step, setStep] = useState(0);
  // An existing event can be browsed in any order from the start.
  const [visited, setVisited] = useState(initial.id ? REVIEW_STEP : 0);
  const [eventId, setEventId] = useState(initial.id);
  const [status, setStatus] = useState(initial.status);
  const [slug, setSlug] = useState(initial.slug);
  const [justPublished, setJustPublished] = useState(false);
  const [name, setName] = useState(initial.name);
  const [type, setType] = useState<EventType>(initial.type);
  const [eventDate, setEventDate] = useState(initial.eventDate);
  const [endDate, setEndDate] = useState(initial.endDate);
  // Registration closes on the race's last day unless the organizer picks
  // another date: it follows the dates while it is empty or still on that day.
  // Opening does the same with the race's first day.
  const [opens, setOpens] = useState(initial.registrationOpens);
  const [closes, setCloses] = useState(initial.registrationCloses);
  const lastDay = endDate || eventDate;
  const followDates = (nextEventDate: string, nextEndDate: string) => {
    if (!opens || opens === eventDate) setOpens(nextEventDate);
    if (!closes || closes === lastDay) setCloses(nextEndDate || nextEventDate);
  };
  const [anywhere, setAnywhere] = useState(initial.anywhere);
  const [city, setCity] = useState(initial.city);
  const [country, setCountry] = useState<Country>(initial.country);
  const [categories, setCategories] = useState<Category[]>(() =>
    initial.categories.map((c) => ({ ...c, key: nextCategoryKey++ })),
  );
  const [minimumAge, setMinimumAge] = useState(initial.minimumAge);
  const [sizes, setSizes] = useState<ShirtSize[]>(initial.shirtSizes);
  const [offersShirt, setOffersShirt] = useState(initial.offersShirt);
  const [offersPhotos, setOffersPhotos] = useState(initial.offersPhotos);
  const [acceptsDonations, setAcceptsDonations] = useState(initial.acceptsDonations);
  const [offersMail, setOffersMail] = useState(initial.offersMail);
  const [imagePath, setImagePath] = useState(initial.imagePath);
  const [savedImagePath, setSavedImagePath] = useState(initial.imagePath);
  const [routeImagePath, setRouteImagePath] = useState(initial.routeImagePath);
  const [savedRouteImagePath, setSavedRouteImagePath] = useState(
    initial.routeImagePath,
  );
  const [medalImagePath, setMedalImagePath] = useState(initial.medalImagePath);
  const [savedMedalImagePath, setSavedMedalImagePath] = useState(
    initial.medalImagePath,
  );
  const [state, setState] = useState<EventFormState>();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, startTransition] = useTransition();
  const [deleting, startDelete] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const router = useLocalizedRouter();
  const locale = useLocale();
  const { toast } = useToast();
  const t = useT();
  const fmt = useFormat();
  const live = status === "published";

  const athOptions = athMovilAccounts.filter(
    (a) => a.active || a.id === initial.athMovilAccountId,
  );
  // A new event with only one account to pick from starts on it.
  const initialAthAccount =
    initial.id === null && !initial.athMovilAccountId && athOptions.length === 1
      ? athOptions[0].id
      : initial.athMovilAccountId;

  const eventName = name.trim() || t("publish.untitled");
  const errors = state?.fieldErrors ?? {};
  const fieldError = (field: string) =>
    errors[field] ? t(`publish.errors.${errors[field]}`) : undefined;

  function goTo(next: number) {
    setStep(next);
    setVisited((v) => Math.max(v, next));
  }

  /**
   * Posted through a transition rather than the form's `action` prop: React
   * resets a form after an action runs, which would wipe every uncontrolled
   * field the moment the server reported a single typo.
   */
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // The submitter carries `intent`: "draft" or "publish".
    const submitter = (e.nativeEvent as SubmitEvent).submitter;
    const data = new FormData(e.currentTarget, submitter);
    startTransition(async () => {
      const result = await saveEventAction(state, data);
      setState(result);

      if (result.saved) {
        const saved = result.saved;
        const wasLive = live;
        setEventId(saved.id);
        setSlug(saved.slug);
        setStatus(saved.status);
        // The images this save stored are now the event's; see `ImageStep`.
        setSavedImagePath(String(data.get("image_path") ?? ""));
        setSavedRouteImagePath(String(data.get("route_image_path") ?? ""));
        setSavedMedalImagePath(String(data.get("medal_image_path") ?? ""));
        // Rows inserted by this save now have ids; without them the next save
        // would delete and re-create them.
        setCategories((list) =>
          list.map((c) => ({ ...c, id: saved.categoryIds[c.distance] ?? c.id })),
        );
        // A new event now has an address of its own: put it in the URL, so a
        // reload or a later save edits this row instead of creating another.
        if (!initial.id) {
          window.history.replaceState(
            null,
            "",
            localizePath(`/organizer/events/${saved.id}/edit`, locale),
          );
        }
        if (saved.status === "published" && !wasLive) {
          setJustPublished(true);
        } else {
          toast({
            title: t(wasLive ? "publish.changesSavedTitle" : "publish.draftSavedTitle"),
            body: t(wasLive ? "publish.changesSavedBody" : "publish.draftSavedBody", {
              name: eventName,
            }),
          });
        }
        return;
      }

      // Open the first step with an error, then move focus to its first
      // invalid control so the message is read out where it applies.
      const failed = Object.keys(result.fieldErrors ?? {});
      if (failed.length === 0) return;
      const first = Math.min(...failed.map((f) => FIELD_STEP[f] ?? REVIEW_STEP));
      setStep(first);
      requestAnimationFrame(() => {
        formRef.current
          ?.querySelector<HTMLElement>(
            `[data-step="${first}"] [aria-invalid="true"], [data-step="${first}"] [role="alert"]`,
          )
          ?.focus();
      });
    });
  }

  function remove() {
    if (!eventId) return;
    startDelete(async () => {
      const unsaved = [
        imagePath !== savedImagePath && imagePath,
        routeImagePath !== savedRouteImagePath && routeImagePath,
        medalImagePath !== savedMedalImagePath && medalImagePath,
      ].filter((p): p is string => Boolean(p));
      const result = await deleteEventAction(eventId, unsaved);
      if (result.ok) {
        toast({
          title: t("publish.deletedTitle"),
          body: t("publish.deletedBody", { name: eventName }),
        });
        router.push("/organizer");
        return;
      }
      setConfirmDelete(false);
      toast({
        title: t("publish.deleteFailedTitle"),
        body: t(`publish.errors.${result.error ?? "deleteFailed"}`),
        tone: "danger",
      });
    });
  }

  /** Enter in a text field moves on a step instead of publishing early. */
  function onKeyDown(e: KeyboardEvent<HTMLFormElement>) {
    if (
      e.key === "Enter" &&
      e.target instanceof HTMLInputElement &&
      step < REVIEW_STEP
    ) {
      e.preventDefault();
      goTo(step + 1);
    }
  }

  function addCategory() {
    const used = new Set(categories.map((c) => c.distance));
    const distance = DISTANCES.find((d) => !used.has(d)) ?? "5K";
    setCategories((c) => [
      ...c,
      {
        key: nextCategoryKey++,
        id: null,
        distance,
        km: String(DISTANCE_KM[distance]),
        price: "",
        capacity: "",
        start: "",
        registered: 0,
      },
    ]);
  }

  function updateCategory(key: number, patch: Partial<Category>) {
    setCategories((c) => c.map((x) => (x.key === key ? { ...x, ...patch } : x)));
  }

  const checklist = [
    { key: "publish.checklist.info", done: name.trim().length > 0 && eventDate !== "" },
    {
      key: "publish.checklist.location",
      done: anywhere || city.trim().length > 0,
    },
    {
      key: "publish.checklist.categories",
      done: categories.some((c) => c.price && c.capacity),
    },
    // Extras are optional — an organizer may offer none.
    { key: "publish.checklist.registration", done: minimumAge.trim() !== "" },
  ];

  const prices = categories
    .filter((c) => c.price.trim() !== "")
    .map((c) => Number(c.price.replace(",", ".")))
    .filter((p) => Number.isFinite(p) && p >= 0);

  if (justPublished && slug) {
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
          <Button href={`/events/${slug}`} size="lg">
            {t("publish.viewListing")}
          </Button>
          <Button href="/organizer" variant="outline" size="lg">
            {t("publish.goToDashboard")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form
      ref={formRef}
      onSubmit={submit}
      onKeyDown={onKeyDown}
      noValidate
      className="pb-28 lg:pb-0"
    >
      <input type="hidden" name="id" value={eventId ?? ""} />

      {/* Header ---------------------------------------------------------- */}
      <header className="sticky top-0 z-60 border-b-2 border-line bg-ink">
        <div className="mx-auto flex max-w-[1600px] items-center gap-4 px-4 py-3.5 sm:px-6 lg:px-10">
          <Link
            href="/organizer"
            aria-label={t("publish.backToDashboard")}
            className="flex h-10 shrink-0 items-center gap-2 border-2 border-line-strong px-2.5 font-mono text-[11px] tracking-[0.14em] uppercase hover:border-neon-lime hover:text-neon-lime"
          >
            <ArrowLeftIcon size={18} aria-hidden />
            <span className="hidden xl:inline">{t("publish.backToDashboard")}</span>
          </Link>
          <BrandLock compact />
          <div className="hidden min-w-0 border-l-2 border-line pl-4 sm:block">
            <Eyebrow>
              {t(eventId ? "publish.editEvent" : "publish.createEvent")}
            </Eyebrow>
            <p className="mt-0.5 flex items-center gap-2 truncate text-[15px] font-extrabold uppercase">
              {eventName}
              <Badge tone={live ? "lime" : "outline"}>
                {t(live ? "labels.eventStatus.live" : "labels.eventStatus.draft")}
              </Badge>
            </p>
          </div>
          <div className="flex-1" />
          {live && slug ? (
            <Button href={`/events/${slug}`} variant="ghost" size="sm">
              {t("publish.viewListing")}
            </Button>
          ) : null}
          {eventId ? (
            <Button
              variant="ghost"
              size="sm"
              className="text-danger"
              disabled={deleting}
              aria-busy={deleting}
              onClick={() => setConfirmDelete(true)}
            >
              {deleting ? t("publish.deleting") : t("publish.delete")}
            </Button>
          ) : null}
          {!live ? (
            <Button
              type="submit"
              name="intent"
              value="draft"
              variant="outline"
              size="sm"
              disabled={pending}
            >
              {t("publish.saveDraft")}
            </Button>
          ) : null}
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
            {STEPS.map((s, i) => {
              const hasError = Object.keys(errors).some(
                (f) => (FIELD_STEP[f] ?? REVIEW_STEP) === i,
              );
              return (
                <li key={s}>
                  <button
                    type="button"
                    onClick={() => goTo(i)}
                    disabled={i > visited}
                    aria-current={i === step ? "step" : undefined}
                    className={cn(
                      "flex w-full items-center gap-3 border-b-2 border-line px-5 py-4 text-left",
                      i === step
                        ? "bg-neon-lime text-ink"
                        : i <= visited
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
                    {hasError ? (
                      <span
                        className={cn(
                          "ml-auto text-[11px] font-black",
                          i === step ? "text-ink" : "text-danger",
                        )}
                      >
                        ▲<span className="sr-only">{t("publish.stepHasErrors")}</span>
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })}
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
          <div
            data-step={0}
            hidden={step !== 0}
            className="mt-8 flex max-w-3xl flex-col gap-6"
          >
            <Field
              label={t("publish.eventName")}
              hint={t("publish.eventNameHint")}
              error={fieldError("name")}
            >
              {(p) => (
                <Input
                  {...p}
                  name="name"
                  value={name}
                  maxLength={120}
                  autoComplete="off"
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t("publish.eventNamePlaceholder")}
                />
              )}
            </Field>

            <Field
              label={t("publish.eventDescription")}
              hint={t("publish.eventDescriptionHint")}
              error={fieldError("description")}
              optional
            >
              {(p) => (
                <Textarea
                  {...p}
                  name="description"
                  defaultValue={initial.description}
                  maxLength={4000}
                  placeholder={t("publish.eventDescriptionPlaceholder")}
                />
              )}
            </Field>

            <fieldset>
              <legend className="font-mono text-[10px] tracking-[0.18em] text-fg-faint uppercase">
                {t("publish.eventType")}
              </legend>
              <input type="hidden" name="type" value={type} />
              <div className="mt-3 flex flex-wrap gap-2">
                {EVENT_TYPES.map((option) => (
                  <Chip
                    key={option}
                    active={type === option}
                    onClick={() => {
                      setType(option);
                      // A virtual race is run wherever the runner is.
                      if (option === "Virtual Race") setAnywhere(true);
                    }}
                  >
                    {eventTypeLabel(t, option)}
                  </Chip>
                ))}
              </div>
            </fieldset>

            <div className="grid gap-6 sm:grid-cols-2">
              <Field label={t("publish.eventDate")} error={fieldError("event_date")}>
                {(p) => (
                  <Input
                    {...p}
                    type="date"
                    name="event_date"
                    value={eventDate}
                    onChange={(e) => {
                      setEventDate(e.target.value);
                      followDates(e.target.value, endDate);
                    }}
                  />
                )}
              </Field>
              <Field
                label={t("publish.endDate")}
                hint={t("publish.endDateHint")}
                error={fieldError("end_date")}
                optional
              >
                {(p) => (
                  <Input
                    {...p}
                    type="date"
                    name="end_date"
                    value={endDate}
                    min={eventDate || undefined}
                    onChange={(e) => {
                      setEndDate(e.target.value);
                      followDates(eventDate, e.target.value);
                    }}
                  />
                )}
              </Field>
              <Field
                label={t("publish.startTime")}
                hint={t(
                  endDate
                    ? "publish.startTimeHintMultiDay"
                    : "publish.startTimeHint",
                )}
                error={fieldError("start_time")}
                optional
              >
                {(p) => (
                  <Input
                    {...p}
                    type="time"
                    name="start_time"
                    defaultValue={initial.startTime}
                  />
                )}
              </Field>
              {/* A row of its own, so the registration dates pair up. */}
              <Field
                label={t("publish.registrationOpens")}
                error={fieldError("registration_opens")}
                optional
                className="sm:col-start-1"
              >
                {(p) => (
                  <Input
                    {...p}
                    type="date"
                    name="registration_opens"
                    value={opens}
                    max={closes || undefined}
                    onChange={(e) => setOpens(e.target.value)}
                  />
                )}
              </Field>
              <Field
                label={t("publish.registrationCloses")}
                error={fieldError("registration_closes")}
              >
                {(p) => (
                  <Input
                    {...p}
                    type="date"
                    name="registration_closes"
                    value={closes}
                    max={lastDay || undefined}
                    onChange={(e) => setCloses(e.target.value)}
                  />
                )}
              </Field>
            </div>
          </div>

          {/* 2 — Location ---------------------------------------------- */}
          <div
            data-step={1}
            hidden={step !== 1}
            className="mt-8 flex max-w-3xl flex-col gap-6"
          >
            <fieldset>
              <legend className="font-mono text-[10px] tracking-[0.18em] text-fg-faint uppercase">
                {t("publish.locationKind")}
              </legend>
              {anywhere && <input type="hidden" name="anywhere" value="on" />}
              <div className="mt-3 flex flex-wrap gap-2">
                <Chip active={!anywhere} onClick={() => setAnywhere(false)}>
                  {t("publish.locationVenue")}
                </Chip>
                <Chip active={anywhere} onClick={() => setAnywhere(true)}>
                  {t("publish.locationAnywhere")}
                </Chip>
              </div>
              {anywhere && (
                <p className="mt-3 text-sm text-fg-muted">
                  {t("publish.locationAnywhereHint")}
                </p>
              )}
            </fieldset>

            {/* Hidden rather than removed, so switching back keeps what was typed. */}
            <div hidden={anywhere} className="flex flex-col gap-6">
              <Field label={t("publish.venueName")} error={fieldError("venue")}>
                {(p) => (
                  <Input
                    {...p}
                    name="venue"
                    defaultValue={initial.venue}
                    maxLength={120}
                    placeholder="Paseo de la Princesa…"
                  />
                )}
              </Field>
              <Field
                label={t("publish.streetAddress")}
                error={fieldError("address")}
                optional
              >
                {(p) => (
                  <Input
                    {...p}
                    name="address"
                    defaultValue={initial.address}
                    maxLength={200}
                    autoComplete="street-address"
                    placeholder={t("publish.streetPlaceholder")}
                  />
                )}
              </Field>
            </div>
            <div className="grid gap-6 sm:grid-cols-2">
              <div hidden={anywhere}>
                <Field label={t("publish.city")} error={fieldError("city")}>
                  {(p) =>
                    country === "PR" ? (
                      <Select
                        {...p}
                        name="city"
                        value={city}
                        autoComplete="address-level2"
                        onChange={(e) => setCity(e.target.value)}
                      >
                        <option value="" disabled>
                          {t("publish.chooseMunicipality")}
                        </option>
                        {/* Keep a city saved before the list existed selectable. */}
                        {city && !isOneOf(PR_MUNICIPALITIES, city) && (
                          <option value={city}>{city}</option>
                        )}
                        {PR_MUNICIPALITIES.map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </Select>
                    ) : (
                      <Input
                        {...p}
                        name="city"
                        value={city}
                        maxLength={80}
                        autoComplete="address-level2"
                        onChange={(e) => setCity(e.target.value)}
                        placeholder="San Juan…"
                      />
                    )
                  }
                </Field>
              </div>
              <Field label={t("publish.region")} error={fieldError("region")}>
                {(p) => (
                  <Input
                    {...p}
                    name="region"
                    maxLength={80}
                    defaultValue={initial.region}
                    autoComplete="address-level1"
                  />
                )}
              </Field>
              <div hidden={anywhere}>
                <Field
                  label={t("publish.postalCode")}
                  error={fieldError("postal_code")}
                  optional
                >
                  {(p) => (
                    <Input
                      {...p}
                      name="postal_code"
                      defaultValue={initial.postalCode}
                      maxLength={12}
                      inputMode="numeric"
                      autoComplete="postal-code"
                      placeholder="00901"
                    />
                  )}
                </Field>
              </div>
              <Field label={t("publish.country")} error={fieldError("country")}>
                {(p) => (
                  <Select
                    {...p}
                    name="country"
                    value={country}
                    onChange={(e) => setCountry(e.target.value as Country)}
                  >
                    {COUNTRIES.map((c) => (
                      <option key={c} value={c}>
                        {t(`publish.countries.${c}`)}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            </div>
          </div>

          {/* 3 — Race categories --------------------------------------- */}
          <div data-step={2} hidden={step !== 2} className="mt-8 max-w-5xl">
            <p className="text-[15px] text-fg-dim">
              {t("publish.categoriesIntro")}
            </p>

            {errors.categories ? (
              <p
                role="alert"
                tabIndex={-1}
                className="mt-5 flex items-center gap-2 text-[13px] font-semibold text-danger"
              >
                <span aria-hidden="true">▲</span>
                {fieldError("categories")}
              </p>
            ) : null}

            <ul className="mt-7 flex flex-col gap-4">
              {categories.map((c, i) => (
                <li key={c.key} className="border-2 border-line bg-carbon">
                  <input type="hidden" name="category_id" value={c.id ?? ""} />
                  <div className="flex items-center justify-between border-b-2 border-line px-5 py-3.5">
                    <Eyebrow>{t("publish.category", { n: i + 1 })}</Eyebrow>
                    {/* Runners already in a category hold it in place. */}
                    {c.registered > 0 ? (
                      <span className="font-mono text-[11px] tracking-wider text-fg-dim uppercase">
                        {t("publish.categoryRegistered", { count: c.registered })}
                      </span>
                    ) : categories.length > 1 ? (
                      <button
                        type="button"
                        onClick={() =>
                          setCategories((list) =>
                            list.filter((x) => x.key !== c.key),
                          )
                        }
                        className="text-[11px] font-bold tracking-wider text-danger uppercase hover:underline"
                      >
                        {t("publish.remove")}
                      </button>
                    ) : null}
                  </div>
                  <div className="grid items-end gap-5 p-5 sm:grid-cols-2 lg:grid-cols-[repeat(4,minmax(0,1fr))_minmax(0,1.5fr)]">
                    <Field label={t("publish.distance")}>
                      {(p) => (
                        <Select
                          {...p}
                          name="category_distance"
                          value={c.distance}
                          onChange={(e) => {
                            const distance = e.target.value as Distance;
                            updateCategory(c.key, {
                              distance,
                              km: String(DISTANCE_KM[distance]),
                            });
                          }}
                        >
                          {DISTANCES.map((d) => (
                            <option key={d} value={d}>
                              {distanceLabel(t, d)}
                            </option>
                          ))}
                        </Select>
                      )}
                    </Field>
                    <Field label={t("publish.distanceKm")}>
                      {(p) => (
                        <Input
                          {...p}
                          name="category_km"
                          value={c.km}
                          inputMode="decimal"
                          onChange={(e) => updateCategory(c.key, { km: e.target.value })}
                        />
                      )}
                    </Field>
                    <Field label={t("publish.priceUsd")}>
                      {(p) => (
                        <Input
                          {...p}
                          name="category_price"
                          value={c.price}
                          inputMode="decimal"
                          placeholder="45"
                          onChange={(e) =>
                            updateCategory(c.key, { price: e.target.value })
                          }
                        />
                      )}
                    </Field>
                    <Field label={t("publish.maxParticipants")}>
                      {(p) => (
                        <Input
                          {...p}
                          name="category_capacity"
                          value={c.capacity}
                          inputMode="numeric"
                          placeholder="500"
                          onChange={(e) =>
                            updateCategory(c.key, { capacity: e.target.value })
                          }
                        />
                      )}
                    </Field>
                    <Field label={t("publish.startTime")} optional>
                      {(p) => (
                        <Input
                          {...p}
                          type="time"
                          name="category_start"
                          value={c.start}
                          onChange={(e) =>
                            updateCategory(c.key, { start: e.target.value })
                          }
                        />
                      )}
                    </Field>
                  </div>
                </li>
              ))}
            </ul>

            {categories.length < DISTANCES.length ? (
              <Button
                variant="outline"
                size="lg"
                className="mt-5"
                onClick={addCategory}
              >
                {t("publish.addCategory")}
              </Button>
            ) : null}
          </div>

          {/* 4 — Registration settings --------------------------------- */}
          <div
            data-step={3}
            hidden={step !== 3}
            className="mt-8 flex max-w-4xl flex-col gap-8"
          >
            {/* Each field spans the grid's three rows (label, input, hint) via
                subgrid, so inputs stay level when a label wraps. */}
            <div className="grid gap-6 sm:grid-cols-3">
              <Field
                label={t("publish.participantLimit")}
                className="sm:row-span-3 sm:grid sm:grid-rows-subgrid sm:gap-0 sm:[&>label]:self-end"
                hint={t("publish.participantLimitHint")}
                error={fieldError("capacity")}
                optional
              >
                {(p) => (
                  <Input
                    {...p}
                    name="capacity"
                    defaultValue={initial.capacity}
                    inputMode="numeric"
                  />
                )}
              </Field>
              <Field
                label={t("publish.minimumAge")}
                error={fieldError("minimum_age")}
                className="sm:row-span-3 sm:grid sm:grid-rows-subgrid sm:gap-0 sm:[&>label]:self-end"
              >
                {(p) => (
                  <Input
                    {...p}
                    name="minimum_age"
                    value={minimumAge}
                    onChange={(e) => setMinimumAge(e.target.value)}
                    inputMode="numeric"
                  />
                )}
              </Field>
              <Field
                label={t("publish.maximumAge")}
                className="sm:row-span-3 sm:grid sm:grid-rows-subgrid sm:gap-0 sm:[&>label]:self-end"
                error={fieldError("maximum_age")}
                optional
              >
                {(p) => (
                  <Input
                    {...p}
                    name="maximum_age"
                    defaultValue={initial.maximumAge}
                    placeholder={t("publish.noLimit")}
                    inputMode="numeric"
                  />
                )}
              </Field>
            </div>

            {/* Where ATH Móvil payments go. A retired account stays listed
                only on the event that already uses it. */}
            <Field
              label={t("publish.athMovilAccount")}
              hint={t(
                athOptions.length
                  ? "publish.athMovilAccountHint"
                  : "publish.athMovilAccountNone",
              )}
              error={fieldError("ath_movil_account_id")}
              className="max-w-md"
              optional
            >
              {(p) => (
                <Select
                  {...p}
                  name="ath_movil_account_id"
                  defaultValue={initialAthAccount}
                  disabled={athOptions.length === 0}
                >
                  <option value="">{t("publish.athMovilAccountOff")}</option>
                  {athOptions.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.label} · {a.path}
                      {a.active ? "" : ` (${t("publish.athMovilAccountRetired")})`}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>

          {/* 5 — Extras ------------------------------------------------- */}
          {/* A switched-off extra still posts its price and sizes, so turning
              it back on restores them; runners just stop seeing it. */}
          <div
            data-step={4}
            hidden={step !== 4}
            className="mt-8 flex max-w-3xl flex-col gap-6"
          >
            <p className="text-[15px] text-fg-dim">{t("publish.extrasIntro")}</p>

            <ul className="flex flex-col gap-4">
              <li className="border-2 border-line bg-carbon p-5">
                <ExtraToggle
                  name="offers_shirt"
                  checked={offersShirt}
                  onChange={setOffersShirt}
                  title={t("publish.extras.shirt")}
                  detail={t("publish.extras.shirtDetail")}
                />
                {sizes.map((s) => (
                  <input key={s} type="hidden" name="shirt_sizes" value={s} />
                ))}
                <div hidden={!offersShirt} className="mt-5 flex flex-col gap-6">
                  <div className="max-w-56">
                    <Field
                      label={t("publish.priceUsd")}
                      hint={t("publish.extras.freeHint")}
                      error={fieldError("shirt_price")}
                    >
                      {(p) => (
                        <Input
                          {...p}
                          name="shirt_price"
                          defaultValue={initial.shirtPrice}
                          inputMode="decimal"
                        />
                      )}
                    </Field>
                  </div>
                  <fieldset>
                    <legend className="font-mono text-[10px] tracking-[0.18em] text-fg-faint uppercase">
                      {t("publish.shirtSizes")}
                    </legend>
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
                    {errors.shirt_sizes ? (
                      <p
                        role="alert"
                        tabIndex={-1}
                        className="mt-3 flex items-center gap-2 text-[13px] font-semibold text-danger"
                      >
                        <span aria-hidden="true">▲</span>
                        {fieldError("shirt_sizes")}
                      </p>
                    ) : null}
                  </fieldset>
                </div>
              </li>

              <li className="border-2 border-line bg-carbon p-5">
                <ExtraToggle
                  name="offers_photos"
                  checked={offersPhotos}
                  onChange={setOffersPhotos}
                  title={t("publish.extras.photos")}
                  detail={t("publish.extras.photosDetail")}
                />
                <div hidden={!offersPhotos} className="mt-5 max-w-56">
                  <Field
                    label={t("publish.priceUsd")}
                    hint={t("publish.extras.freeHint")}
                    error={fieldError("photo_price")}
                  >
                    {(p) => (
                      <Input
                        {...p}
                        name="photo_price"
                        defaultValue={initial.photoPrice}
                        inputMode="decimal"
                      />
                    )}
                  </Field>
                </div>
              </li>

              <li className="border-2 border-line bg-carbon p-5">
                <ExtraToggle
                  name="accepts_donations"
                  checked={acceptsDonations}
                  onChange={setAcceptsDonations}
                  title={t("publish.extras.donations")}
                  detail={t("publish.extras.donationsDetail")}
                />
                <div hidden={!acceptsDonations} className="mt-5">
                  <Field
                    label={t("publish.extras.donationRecipient")}
                    hint={t("publish.extras.donationRecipientHint")}
                    error={fieldError("donation_recipient")}
                  >
                    {(p) => (
                      <Input
                        {...p}
                        name="donation_recipient"
                        defaultValue={initial.donationRecipient}
                        maxLength={120}
                        placeholder={t("publish.extras.donationRecipientPlaceholder")}
                      />
                    )}
                  </Field>
                </div>
              </li>

              <li className="border-2 border-line bg-carbon p-5">
                <ExtraToggle
                  name="offers_mail"
                  checked={offersMail}
                  onChange={setOffersMail}
                  title={t("publish.extras.mail")}
                  detail={t("publish.extras.mailDetail")}
                />
                <div hidden={!offersMail} className="mt-5 max-w-56">
                  <Field
                    label={t("publish.extras.shippingPrice")}
                    hint={t("publish.extras.shippingPriceHint")}
                    error={fieldError("shipping_price")}
                  >
                    {(p) => (
                      <Input
                        {...p}
                        name="shipping_price"
                        defaultValue={initial.shippingPrice}
                        inputMode="decimal"
                      />
                    )}
                  </Field>
                </div>
              </li>
            </ul>
          </div>

          {/* 6 — Event details ----------------------------------------- */}
          <div
            data-step={5}
            hidden={step !== 5}
            className="mt-8 flex max-w-3xl flex-col gap-6"
          >
            <div className="grid gap-6 sm:grid-cols-2">
              <Field label={t("publish.terrain")} error={fieldError("terrain")} optional>
                {(p) => (
                  <Input
                    {...p}
                    name="terrain"
                    defaultValue={initial.terrain}
                    maxLength={80}
                    placeholder={t("publish.terrainPlaceholder")}
                  />
                )}
              </Field>
              <Field label={t("publish.difficulty")} error={fieldError("difficulty")}>
                {(p) => (
                  <Select {...p} name="difficulty" defaultValue={initial.difficulty}>
                    {DIFFICULTIES.map((level) => (
                      <option key={level} value={level}>
                        {difficultyLabel(t, level)}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field
                label={t("publish.elevationGain")}
                error={fieldError("elevation_gain")}
                optional
              >
                {(p) => (
                  <Input
                    {...p}
                    name="elevation_gain"
                    defaultValue={initial.elevationGain}
                    placeholder="42"
                    inputMode="numeric"
                  />
                )}
              </Field>
              <Field label={t("publish.cutoffTime")} error={fieldError("cutoff")} optional>
                {(p) => (
                  <Input
                    {...p}
                    name="cutoff"
                    maxLength={20}
                    defaultValue={initial.cutoff}
                    placeholder="1:45:00"
                  />
                )}
              </Field>
            </div>

            <Field
              label={t("publish.aidStations")}
              hint={t("publish.aidStationsHint")}
              error={fieldError("aid_stations")}
              optional
            >
              {(p) => (
                <Textarea
                  {...p}
                  name="aid_stations"
                  defaultValue={initial.aidStations}
                  placeholder={t("publish.aidStationsPlaceholder")}
                />
              )}
            </Field>

            <Field
              label={t("publish.daySchedule")}
              hint={t("publish.dayScheduleHint")}
              error={fieldError("schedule")}
              optional
            >
              {(p) => (
                <Textarea
                  {...p}
                  name="schedule"
                  defaultValue={initial.schedule}
                  placeholder={t("publish.daySchedulePlaceholder")}
                />
              )}
            </Field>

            <Field label={t("publish.parking")} error={fieldError("parking")} optional>
              {(p) => (
                <Textarea
                  {...p}
                  name="parking"
                  defaultValue={initial.parking}
                  maxLength={1000}
                  placeholder={t("publish.parkingPlaceholder")}
                />
              )}
            </Field>

            <Field
              label={t("publish.directions")}
              error={fieldError("directions")}
              optional
            >
              {(p) => (
                <Textarea
                  {...p}
                  name="directions"
                  defaultValue={initial.directions}
                  maxLength={1000}
                  placeholder={t("publish.directionsPlaceholder")}
                />
              )}
            </Field>
          </div>

          {/* 7 — Cover image ------------------------------------------- */}
          <div
            data-step={6}
            hidden={step !== 6}
            className="mt-8 flex max-w-2xl flex-col gap-6"
          >
            <p className="text-[15px] text-fg-dim">{t("publish.image.intro")}</p>
            <ImageStep
              name="image_path"
              messages="publish.image"
              value={imagePath}
              savedPath={savedImagePath}
              onChange={setImagePath}
              preview={(url) => (
                <EventCover event={{ type, image: url }} className="aspect-video" />
              )}
              error={fieldError("image_path")}
            />
          </div>

          {/* 8 — Route map ---------------------------------------------- */}
          <div
            data-step={7}
            hidden={step !== 7}
            className="mt-8 flex max-w-2xl flex-col gap-6"
          >
            <p className="text-[15px] text-fg-dim">{t("publish.routeImage.intro")}</p>
            <ImageStep
              name="route_image_path"
              messages="publish.routeImage"
              value={routeImagePath}
              savedPath={savedRouteImagePath}
              onChange={setRouteImagePath}
              // A map is shown whole on the Route tab, so it is not cropped here.
              preview={(url) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={url}
                  alt=""
                  className="aspect-video w-full bg-carbon object-contain"
                />
              )}
              error={fieldError("route_image_path")}
            />
          </div>

          {/* 9 — Finisher medal ----------------------------------------- */}
          <div
            data-step={8}
            hidden={step !== 8}
            className="mt-8 flex max-w-2xl flex-col gap-6"
          >
            <p className="text-[15px] text-fg-dim">{t("publish.medalImage.intro")}</p>
            <ImageStep
              name="medal_image_path"
              messages="publish.medalImage"
              value={medalImagePath}
              savedPath={savedMedalImagePath}
              onChange={setMedalImagePath}
              // Shown whole, as on the event page: a medal is rarely landscape.
              preview={(url) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={url}
                  alt=""
                  className="aspect-video w-full bg-carbon object-contain"
                />
              )}
              error={fieldError("medal_image_path")}
            />
          </div>

          {/* 10 — Review ------------------------------------------------- */}
          <div
            data-step={9}
            hidden={step !== 9}
            className="mt-8 grid max-w-5xl gap-8 lg:grid-cols-[1fr_320px]"
          >
            {/* Listing preview */}
            <div>
              <Eyebrow>{t("publish.listingPreview")}</Eyebrow>
              <article className="mt-3 border-2 border-line bg-carbon">
                <EventCover
                  event={{ type, image: eventImageUrl(imagePath) }}
                  className="h-40"
                />
                <div className="p-5">
                  <Badge tone="lime">{t("publish.registrationOpen")}</Badge>
                  <h2 className="mt-3 font-display text-3xl font-black wrap-break-word uppercase">
                    {eventName}
                  </h2>
                  <p className="mt-2 font-mono text-[11px] tracking-[0.12em] text-fg-faint uppercase">
                    {[
                      eventDate
                        ? endDate && endDate > eventDate
                          ? `${fmt.mediumDate(eventDate)} – ${fmt.mediumDate(endDate)}`
                          : fmt.mediumDate(eventDate)
                        : null,
                      anywhere
                        ? t("events.anywhere.short")
                        : city.trim() || null,
                    ]
                      .filter(Boolean)
                      .join(" · ") || t("publish.previewDatePending")}
                  </p>
                  <div className="mt-5 flex items-baseline gap-2 border-t-2 border-line pt-4">
                    <span className="font-mono text-[11px] text-fg-dim">
                      {t("publish.from")}
                    </span>
                    <span className="font-display text-2xl font-black text-neon-yellow">
                      {prices.length ? fmt.moneyWhole(Math.min(...prices)) : "—"}
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
                    <span className={cn("text-sm", c.done ? "text-fg" : "text-fg-dim")}>
                      {t(c.key)}
                      <span className="sr-only">
                        {" "}
                        — {c.done ? t("publish.checkDone") : t("publish.checkPending")}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>

              {state?.error ? (
                <p
                  role="alert"
                  className="mt-4 flex items-start gap-2 text-[13px] leading-relaxed font-semibold text-danger"
                >
                  <span aria-hidden="true">▲</span>
                  {t(`publish.errors.${state.error}`)}
                </p>
              ) : null}

              <div className="mt-6 flex flex-col gap-3">
                <Button
                  type="submit"
                  name="intent"
                  value="publish"
                  block
                  size="xl"
                  disabled={pending}
                  aria-busy={pending}
                >
                  {pending
                    ? t("common.saving")
                    : t(live ? "publish.saveChanges" : "publish.publishEvent")}
                </Button>
                {!live ? (
                  <Button
                    type="submit"
                    name="intent"
                    value="draft"
                    block
                    variant="outline"
                    size="lg"
                    disabled={pending}
                  >
                    {t("publish.saveDraft")}
                  </Button>
                ) : null}
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
        </main>
      </div>

      {/* Step controls --------------------------------------------------- */}
      <div className="fixed inset-x-0 bottom-0 z-60 flex items-center gap-3 border-t-2 border-line bg-ink px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:static lg:mx-auto lg:max-w-[1600px] lg:justify-end lg:border-t-2 lg:px-10 lg:py-6">
        <Button
          variant="outline"
          size="lg"
          disabled={step === 0}
          onClick={() => goTo(Math.max(0, step - 1))}
        >
          {t("publish.back")}
        </Button>
        <Button
          size="lg"
          className="flex-1 lg:flex-none"
          disabled={step === REVIEW_STEP}
          onClick={() => goTo(Math.min(REVIEW_STEP, step + 1))}
        >
          {t("publish.continue")}
        </Button>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={remove}
        title={t("publish.deleteTitle", { name: eventName })}
        description={t(live ? "publish.deleteLiveDescription" : "publish.deleteDescription")}
        confirmLabel={t("publish.delete")}
        destructive
      />
    </form>
  );
}

/** One extra's on/off switch, with what a runner gets from it. */
function ExtraToggle({
  name,
  checked,
  onChange,
  title,
  detail,
}: {
  name: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  title: string;
  detail: string;
}) {
  return (
    <Checkbox
      name={name}
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      label={
        <span className="flex flex-col gap-1">
          <span className="font-display text-lg font-black text-fg uppercase">
            {title}
          </span>
          <span className="text-sm text-fg-dim">{detail}</span>
        </span>
      }
    />
  );
}
