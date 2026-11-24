"use client";

import { useId, useState } from "react";
import { useT } from "@/components/i18n/provider";
import { ImageStep } from "@/components/publish/image-step";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input } from "@/components/ui/field";
import {
  MAX_SHIRT_DESIGNS,
  SHIRT_DESIGN_NAME_MAX,
  type EventFormShirtDesign,
  type ReusableShirtDesign,
} from "@/lib/events/form";
import { EVENT_IMAGE_BUCKET, EVENT_IMAGE_TYPE, eventImageUrl } from "@/lib/events/images";
import { createClient } from "@/lib/supabase/client";

/** A form row: the stored design plus a key that survives removals. */
export type ShirtDesignRow = EventFormShirtDesign & { key: number };

/** The busy key of a copy in progress; row keys start at 1. */
const COPYING = 0;

/** Keys for design rows; only needs to be unique within a session. */
let nextDesignKey = 1;

export function toShirtDesignRows(designs: EventFormShirtDesign[]): ShirtDesignRow[] {
  return designs.map((d) => ({ ...d, key: nextDesignKey++ }));
}

/**
 * The shirts runners choose from, on the wizard's extras step: a picture and
 * a name each, all at the event's one shirt price and sizes.
 *
 * Every row posts four fields in step — `shirt_design_id`, `_name`, `_image`
 * and `_offered` — which `saveEventAction` reads back as a list. A design a
 * runner already chose (`locked`) cannot be removed, as `save_event()` would
 * refuse: it gets a switch to stop offering it instead.
 *
 * `reusable` lists the designs on the organizer's other events. Copying one
 * uploads its picture again under a new name, so the copy is this event's
 * own: replacing or removing it here never touches the event it came from.
 */
export function ShirtDesigns({
  designs,
  onChange,
  savedPaths,
  reusable = [],
  onBusyChange,
  busy,
  error,
  disabled = false,
}: {
  designs: ShirtDesignRow[];
  onChange: (update: (designs: ShirtDesignRow[]) => ShirtDesignRow[]) => void;
  /** Pictures stored on the event as of the last save; see `ImageStep`. */
  savedPaths: ReadonlySet<string>;
  /** Designs on the organizer's other events, offered to copy. */
  reusable?: ReusableShirtDesign[];
  /** A row's picture is converting or uploading; the wizard holds its save. */
  onBusyChange: (key: number, busy: boolean) => void;
  /** Rows whose picture is converting or uploading. */
  busy: (key: number) => boolean;
  /** A server-side error about the designs, already translated. */
  error?: string;
  /** While the wizard is saving. */
  disabled?: boolean;
}) {
  const t = useT();
  const full = designs.length >= MAX_SHIRT_DESIGNS;
  const copyPanelId = useId();
  const [copyOpen, setCopyOpen] = useState(false);
  /** The design being copied, by its id; null when idle. */
  const [copying, setCopying] = useState<string | null>(null);
  /** A key under `publish.errors`. */
  const [copyError, setCopyError] = useState<string>();

  /** Add one of the organizer's other designs, with a picture of its own. */
  async function copy(source: ReusableShirtDesign) {
    const url = eventImageUrl(source.imagePath);
    if (!url || copying) return;
    setCopyError(undefined);
    setCopying(source.id);
    onBusyChange(COPYING, true);
    try {
      const supabase = createClient();
      const { data } = await supabase.auth.getUser();
      if (!data.user) return setCopyError("sessionExpired");

      const response = await fetch(url);
      if (!response.ok) return setCopyError("shirtDesignCopyFailed");
      const path = `${data.user.id}/${crypto.randomUUID()}.webp`;
      const { error: storageError } = await supabase.storage
        .from(EVENT_IMAGE_BUCKET)
        .upload(path, await response.blob(), {
          contentType: EVENT_IMAGE_TYPE,
          cacheControl: "31536000",
        });
      if (storageError) return setCopyError("shirtDesignCopyFailed");

      onChange((list) =>
        // Checked again: the list may have filled up while this uploaded.
        list.length >= MAX_SHIRT_DESIGNS
          ? list
          : [
              ...list,
              {
                key: nextDesignKey++,
                id: null,
                name: source.name,
                imagePath: path,
                offered: true,
                locked: false,
              },
            ],
      );
    } catch {
      setCopyError("shirtDesignCopyFailed");
    } finally {
      setCopying(null);
      onBusyChange(COPYING, false);
    }
  }

  function update(key: number, patch: Partial<ShirtDesignRow>) {
    onChange((list) => list.map((d) => (d.key === key ? { ...d, ...patch } : d)));
  }

  function add() {
    onChange((list) => [
      ...list,
      { key: nextDesignKey++, id: null, name: "", imagePath: "", offered: true, locked: false },
    ]);
  }

  function remove(design: ShirtDesignRow) {
    // An upload no save has claimed is on no row: drop it. Best effort. The
    // saved one is left for the server to delete once a save removes the row.
    if (design.imagePath && !savedPaths.has(design.imagePath)) {
      void createClient().storage.from(EVENT_IMAGE_BUCKET).remove([design.imagePath]);
    }
    onChange((list) => list.filter((d) => d.key !== design.key));
  }

  return (
    <fieldset>
      <legend className="font-mono text-[10px] tracking-[0.18em] text-fg-faint uppercase">
        {t("publish.shirtDesigns.title")}
      </legend>
      <p className="mt-2 text-sm text-fg-dim">{t("publish.shirtDesigns.intro")}</p>

      {designs.length > 0 ? (
        <ul className="mt-4 grid gap-4 sm:grid-cols-2">
          {designs.map((design, i) => (
            <li
              key={design.key}
              className="flex flex-col gap-4 border-2 border-line bg-ink p-4"
            >
              <input type="hidden" name="shirt_design_id" value={design.id ?? ""} />
              <input
                type="hidden"
                name="shirt_design_offered"
                value={design.offered ? "true" : "false"}
              />
              <ImageStep
                name="shirt_design_image"
                messages="publish.shirtDesignImage"
                square
                value={design.imagePath}
                savedPath={savedPaths.has(design.imagePath) ? design.imagePath : ""}
                onChange={(path) => update(design.key, { imagePath: path })}
                onBusyChange={(uploading) => onBusyChange(design.key, uploading)}
                // Shown whole, as runners will see it.
                preview={(url) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={url}
                    alt=""
                    className="aspect-square w-full bg-carbon object-contain"
                  />
                )}
                disabled={disabled}
              />
              <Field label={t("publish.shirtDesigns.name", { n: i + 1 })}>
                {(p) => (
                  <Input
                    {...p}
                    name="shirt_design_name"
                    value={design.name}
                    onChange={(e) => update(design.key, { name: e.target.value })}
                    maxLength={SHIRT_DESIGN_NAME_MAX}
                    placeholder={t("publish.shirtDesigns.namePlaceholder")}
                    autoComplete="off"
                  />
                )}
              </Field>
              {design.locked ? (
                <div className="flex flex-col gap-2">
                  <Checkbox
                    checked={design.offered}
                    onChange={(e) => update(design.key, { offered: e.target.checked })}
                    label={t("publish.shirtDesigns.offered")}
                  />
                  <p className="text-[13px] text-fg-dim">
                    {t("publish.shirtDesigns.lockedHint")}
                  </p>
                </div>
              ) : (
                <div>
                  <Button
                    variant="ghost"
                    size="md"
                    className="text-danger"
                    disabled={disabled || busy(design.key)}
                    onClick={() => remove(design)}
                  >
                    {t("publish.shirtDesigns.remove")}
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : null}

      {error ? (
        <p
          role="alert"
          tabIndex={-1}
          className="mt-3 flex items-center gap-2 text-[13px] font-semibold text-danger"
        >
          <span aria-hidden="true">▲</span>
          {error}
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-4">
        <Button variant="outline" size="md" disabled={full || disabled} onClick={add}>
          {t("publish.shirtDesigns.add")}
        </Button>
        {reusable.length > 0 ? (
          <Button
            variant="ghost"
            size="md"
            aria-expanded={copyOpen}
            aria-controls={copyPanelId}
            onClick={() => setCopyOpen((open) => !open)}
          >
            {t("publish.shirtDesigns.copy")}
          </Button>
        ) : null}
        <p className="text-[13px] text-fg-dim">
          {t("publish.shirtDesigns.limit", { max: MAX_SHIRT_DESIGNS })}
        </p>
      </div>

      {reusable.length > 0 ? (
        <div id={copyPanelId} hidden={!copyOpen} className="mt-4 border-2 border-line p-4">
          <p className="text-sm text-fg-dim">{t("publish.shirtDesigns.copyIntro")}</p>
          {copyError ? (
            <p
              role="alert"
              className="mt-3 flex items-center gap-2 text-[13px] font-semibold text-danger"
            >
              <span aria-hidden="true">▲</span>
              {t(`publish.errors.${copyError}`)}
            </p>
          ) : null}
          <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {reusable.map((source) => (
              <li key={source.id} className="flex flex-col border-2 border-line bg-ink">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={eventImageUrl(source.imagePath)}
                  alt=""
                  loading="lazy"
                  className="aspect-square w-full bg-carbon object-contain"
                />
                <div className="flex flex-1 flex-col gap-2 p-3">
                  <p className="text-[13px] font-bold break-words">{source.name}</p>
                  <p className="text-[12px] break-words text-fg-dim">{source.eventName}</p>
                  <div className="mt-auto pt-1">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={full || disabled || copying !== null}
                      aria-label={t("publish.shirtDesigns.copyOneLabel", {
                        name: source.name,
                        event: source.eventName,
                      })}
                      onClick={() => void copy(source)}
                    >
                      {copying === source.id
                        ? t("publish.shirtDesigns.copying")
                        : t("publish.shirtDesigns.copyOne")}
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </fieldset>
  );
}
