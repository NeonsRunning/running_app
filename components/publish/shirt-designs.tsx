"use client";

import { useT } from "@/components/i18n/provider";
import { ImageStep } from "@/components/publish/image-step";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input } from "@/components/ui/field";
import {
  MAX_SHIRT_DESIGNS,
  SHIRT_DESIGN_NAME_MAX,
  type EventFormShirtDesign,
} from "@/lib/events/form";
import { EVENT_IMAGE_BUCKET } from "@/lib/events/images";
import { createClient } from "@/lib/supabase/client";

/** A form row: the stored design plus a key that survives removals. */
export type ShirtDesignRow = EventFormShirtDesign & { key: number };

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
 */
export function ShirtDesigns({
  designs,
  onChange,
  savedPaths,
  onBusyChange,
  busy,
  error,
  disabled = false,
}: {
  designs: ShirtDesignRow[];
  onChange: (update: (designs: ShirtDesignRow[]) => ShirtDesignRow[]) => void;
  /** Pictures stored on the event as of the last save; see `ImageStep`. */
  savedPaths: ReadonlySet<string>;
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
        <p className="text-[13px] text-fg-dim">
          {t("publish.shirtDesigns.limit", { max: MAX_SHIRT_DESIGNS })}
        </p>
      </div>
    </fieldset>
  );
}
