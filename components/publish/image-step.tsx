"use client";

import { useId, useRef, useState, type DragEvent, type ReactNode } from "react";
import { useT } from "@/components/i18n/provider";
import { Button } from "@/components/ui/button";
import { PhotoIcon } from "@/components/ui/icons";
import { ImageConversionError, toWebp } from "@/lib/events/convert-image";
import {
  EVENT_IMAGE_BUCKET,
  EVENT_IMAGE_MAX_BYTES,
  EVENT_IMAGE_TYPE,
  eventImageUrl,
} from "@/lib/events/images";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/cn";

/**
 * An image field of the wizard: the cover, the route map and the medal.
 *
 * Picking a file converts it to a resized WebP — iPhone HEIC included — and
 * uploads it at once, from the browser, into the organizer's own folder of
 * the `event-images` bucket; the form then carries only its path in the field
 * named `name`, and the next save puts it on the event. An upload that is
 * replaced or removed before any save is deleted here, since nothing else
 * will ever point at it. The saved one is left for the server to delete
 * once a save actually swaps it out.
 */
export function ImageStep({
  name,
  messages,
  value,
  savedPath,
  onChange,
  preview,
  error,
  disabled = false,
}: {
  /** Form field that carries the path. */
  name: "image_path" | "route_image_path" | "medal_image_path";
  /** Dictionary section holding this field's labels. */
  messages: "publish.image" | "publish.routeImage" | "publish.medalImage";
  /** Current object path; empty for no image. */
  value: string;
  /** Path stored on the event as of the last save. */
  savedPath: string;
  onChange: (path: string) => void;
  /** Renders the uploaded image at its public URL. */
  preview: (url: string | undefined) => ReactNode;
  /** A server-side error, already translated. */
  error?: string;
  /**
   * While the wizard is saving. A swap mid-save would delete the file the
   * save is storing (it is not `savedPath` yet), leaving the event pointing
   * at nothing.
   */
  disabled?: boolean;
}) {
  const t = useT();
  const inputId = useId();
  const messageId = `${inputId}-message`;
  const inputRef = useRef<HTMLInputElement>(null);
  /** Converting, then uploading; null when idle. */
  const [phase, setPhase] = useState<"converting" | "uploading" | null>(null);
  const uploading = phase !== null;
  const busy = uploading || disabled;
  const [dragging, setDragging] = useState(false);
  const [uploadError, setUploadError] = useState<string>();

  const phaseLabel =
    phase === "converting"
      ? t(`${messages}.converting`)
      : t(`${messages}.uploading`);
  const shownError =
    uploadError ? t(`publish.errors.${uploadError}`) : error;

  /** Drop an upload no save has claimed. Best effort. */
  function discard(path: string) {
    if (path && path !== savedPath) {
      void createClient().storage.from(EVENT_IMAGE_BUCKET).remove([path]);
    }
  }

  async function upload(file: File) {
    setUploadError(undefined);
    setPhase("converting");
    try {
      const webp = await toWebp(file);
      if (webp.size > EVENT_IMAGE_MAX_BYTES) return setUploadError("imageTooLarge");

      setPhase("uploading");
      const supabase = createClient();
      const { data } = await supabase.auth.getUser();
      if (!data.user) return setUploadError("sessionExpired");

      const path = `${data.user.id}/${crypto.randomUUID()}.webp`;
      const { error: storageError } = await supabase.storage
        .from(EVENT_IMAGE_BUCKET)
        // Each upload gets a fresh name, so the file never changes in place.
        .upload(path, webp, { contentType: EVENT_IMAGE_TYPE, cacheControl: "31536000" });
      if (storageError) return setUploadError("imageUploadFailed");

      discard(value);
      onChange(path);
    } catch (e) {
      setUploadError(e instanceof ImageConversionError ? e.code : "imageUploadFailed");
    } finally {
      setPhase(null);
    }
  }

  function remove() {
    setUploadError(undefined);
    discard(value);
    onChange("");
  }

  function onDrop(e: DragEvent<HTMLElement>) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && !busy) void upload(file);
  }

  const dropHandlers = {
    onDragOver: (e: DragEvent<HTMLElement>) => {
      e.preventDefault();
      setDragging(true);
    },
    onDragLeave: () => setDragging(false),
    onDrop,
  };

  return (
    <div className="flex flex-col gap-5">
      <input type="hidden" name={name} value={value} />
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        // HEIC is listed by extension too: Windows and Android pickers hide
        // .heic files under image/* alone.
        accept="image/*,.heic,.heif"
        className="sr-only"
        disabled={busy}
        aria-describedby={messageId}
        aria-invalid={shownError ? true : undefined}
        onChange={(e) => {
          const file = e.target.files?.[0];
          // Cleared so picking the same file again still fires a change.
          e.target.value = "";
          if (file) void upload(file);
        }}
      />

      {value ? (
        <div
          {...dropHandlers}
          className={cn(
            "relative border-2",
            dragging ? "border-neon-lime" : "border-line",
          )}
        >
          {preview(eventImageUrl(value))}
          {phase ? <UploadingOverlay label={phaseLabel} /> : null}
        </div>
      ) : (
        <label
          htmlFor={inputId}
          {...dropHandlers}
          className={cn(
            "relative flex aspect-video cursor-pointer flex-col items-center justify-center gap-3 border-2 border-dashed bg-carbon px-6 text-center transition-colors",
            dragging || uploading
              ? "border-neon-lime"
              : "border-line-strong hover:border-neon-lime",
            uploading && "pointer-events-none",
          )}
        >
          <PhotoIcon size={36} aria-hidden className="text-neon-lime" />
          <span className="font-display text-lg font-black uppercase">
            {t(`${messages}.choose`)}
          </span>
          <span className="text-sm text-fg-dim">{t(`${messages}.drop`)}</span>
          {phase ? <UploadingOverlay label={phaseLabel} /> : null}
        </label>
      )}

      {shownError ? (
        <p
          id={messageId}
          role="alert"
          tabIndex={-1}
          className="flex items-center gap-2 text-[13px] font-semibold text-danger"
        >
          <span aria-hidden="true">▲</span>
          {shownError}
        </p>
      ) : (
        <p id={messageId} className="text-[13px] text-fg-dim">
          {t(`${messages}.hint`)}
        </p>
      )}

      {value ? (
        <div className="flex gap-3">
          <Button
            variant="outline"
            size="md"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            {t(`${messages}.replace`)}
          </Button>
          <Button
            variant="ghost"
            size="md"
            className="text-danger"
            disabled={busy}
            onClick={remove}
          >
            {t(`${messages}.remove`)}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function UploadingOverlay({ label }: { label: string }) {
  return (
    <span
      role="status"
      className="absolute inset-0 flex items-center justify-center bg-ink/80 font-mono text-[11px] tracking-[0.18em] text-neon-lime uppercase"
    >
      {label}
    </span>
  );
}
