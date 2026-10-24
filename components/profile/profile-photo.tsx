"use client";

import { useId, useRef, useState } from "react";
import { useT } from "@/components/i18n/provider";
import { PhotoIcon } from "@/components/ui/icons";
import { ConfirmDialog } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { ImageConversionError, toWebp } from "@/lib/events/convert-image";
import { AVATAR_BUCKET, AVATAR_EDGE, AVATAR_MAX_BYTES } from "@/lib/profile/avatars";
import { setAvatarAction } from "@/lib/profile/actions";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/cn";

/**
 * The square at the top of a runner's page: their photo, or their initials.
 *
 * On their own page it is also the control that changes it. Picking a file
 * crops it to a centred square, converts it to WebP — iPhone HEIC included —
 * and uploads it from the browser into the runner's folder of the `avatars`
 * bucket; only the path then goes to the server action, which swaps it in and
 * deletes the photo it replaces.
 */
export function ProfilePhoto({
  name,
  initials,
  url,
  editable,
}: {
  name: string;
  initials: string;
  url: string | null;
  /** The runner's own page. */
  editable: boolean;
}) {
  const t = useT();
  const { toast } = useToast();
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  /** Converting, uploading, then saving; null when idle. */
  const [phase, setPhase] = useState<"converting" | "uploading" | "saving" | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const busy = phase !== null;

  function fail(key: string) {
    toast({ title: t(`runner.photo.errors.${key}`), tone: "danger" });
  }

  async function upload(file: File) {
    setPhase("converting");
    try {
      const webp = await toWebp(file, { maxEdge: AVATAR_EDGE, square: true });
      if (webp.size > AVATAR_MAX_BYTES) return fail("imageTooLarge");

      setPhase("uploading");
      const supabase = createClient();
      const { data } = await supabase.auth.getUser();
      if (!data.user) return fail("sessionExpired");

      const path = `${data.user.id}/${crypto.randomUUID()}.webp`;
      const { error } = await supabase.storage
        .from(AVATAR_BUCKET)
        // Each upload gets a fresh name, so the file never changes in place.
        .upload(path, webp, { contentType: "image/webp", cacheControl: "31536000" });
      if (error) return fail("uploadFailed");

      setPhase("saving");
      // Thrown when the request never got an answer: the profile may or may
      // not point at the file, so leave it rather than risk deleting a photo
      // that was saved.
      const result = await setAvatarAction(path).catch(
        (): { error: string; unanswered: true } => ({ error: "saveFailed", unanswered: true }),
      );
      if (result.error) {
        // Refused by the server: nothing points at it now.
        if (!("unanswered" in result)) {
          void supabase.storage.from(AVATAR_BUCKET).remove([path]);
        }
        return fail(result.error);
      }
      toast({ title: t("runner.photo.saved") });
    } catch (e) {
      fail(e instanceof ImageConversionError ? e.code : "uploadFailed");
    } finally {
      setPhase(null);
    }
  }

  async function remove() {
    setConfirmRemove(false);
    setPhase("saving");
    try {
      const result = await setAvatarAction(null);
      if (result.error) return fail(result.error);
      toast({ title: t("runner.photo.removed") });
    } catch {
      // No answer from the server: say so rather than fail silently.
      fail("saveFailed");
    } finally {
      setPhase(null);
    }
  }

  const face = (
    <>
      <div className="bg-track-lanes absolute inset-0 opacity-40" />
      <span
        aria-hidden="true"
        className="absolute inset-0 flex items-center justify-center font-display text-4xl font-black text-ink/70 sm:text-6xl"
      >
        {initials}
      </span>
      {url ? (
        // A Supabase Storage URL; next/image would need the project's host
        // configured as a remote pattern.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={editable ? "" : t("runner.photo.alt", { name })}
          width={AVATAR_EDGE}
          height={AVATAR_EDGE}
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : null}
    </>
  );

  const frame =
    "relative h-28 w-28 shrink-0 overflow-hidden bg-linear-to-br from-[#123300] to-neon-lime sm:h-44 sm:w-44";

  if (!editable) {
    return (
      <div aria-hidden={url ? undefined : true} className={frame}>
        {face}
      </div>
    );
  }

  return (
    <div className="flex shrink-0 flex-col items-start gap-2">
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        // HEIC is listed by extension too: Windows and Android pickers hide
        // .heic files under image/* alone.
        accept="image/*,.heic,.heif"
        className="peer sr-only"
        disabled={busy}
        onChange={(e) => {
          const file = e.target.files?.[0];
          // Cleared so picking the same file again still fires a change.
          e.target.value = "";
          if (file) void upload(file);
        }}
      />
      <label
        htmlFor={inputId}
        className={cn(
          frame,
          "group cursor-pointer outline-offset-4 peer-focus-visible:outline-2 peer-focus-visible:outline-neon-lime",
          busy && "pointer-events-none",
        )}
      >
        {face}
        <span className="sr-only">
          {url ? t("runner.photo.change") : t("runner.photo.add")}
        </span>
        <span
          aria-hidden="true"
          className={cn(
            "absolute inset-x-0 bottom-0 flex items-center justify-center gap-1.5 bg-ink/80 py-1.5 font-mono text-[10px] tracking-[0.16em] text-neon-lime uppercase transition-opacity",
            // Always visible on touch screens, where there is no hover.
            "sm:opacity-0 sm:group-hover:opacity-100 sm:peer-focus-visible:opacity-100",
            busy && "hidden",
          )}
        >
          <PhotoIcon size={14} />
          {url ? t("runner.photo.change") : t("runner.photo.add")}
        </span>
        {phase ? (
          <span
            role="status"
            className="absolute inset-0 flex items-center justify-center bg-ink/80 px-2 text-center font-mono text-[11px] tracking-[0.18em] text-neon-lime uppercase"
          >
            {t(`runner.photo.${phase}`)}
          </span>
        ) : null}
      </label>
      {url ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => setConfirmRemove(true)}
          className="cursor-pointer py-1 font-mono text-[11px] tracking-[0.14em] text-fg-faint uppercase hover:text-danger focus-visible:text-danger disabled:cursor-default disabled:opacity-50"
        >
          {t("runner.photo.remove")}
        </button>
      ) : null}
      <ConfirmDialog
        open={confirmRemove}
        onClose={() => setConfirmRemove(false)}
        onConfirm={() => void remove()}
        title={t("runner.photo.removeTitle")}
        description={t("runner.photo.removeDescription")}
        confirmLabel={t("runner.photo.remove")}
        destructive
      />
    </div>
  );
}
