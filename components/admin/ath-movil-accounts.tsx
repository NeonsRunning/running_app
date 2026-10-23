"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { useT } from "@/components/i18n/provider";
import {
  saveAthMovilAccountAction,
  setAthMovilAccountActiveAction,
  type AccountResult,
} from "@/lib/ath-movil/accounts";
import {
  ATH_MOVIL_QR_BUCKET,
  ATH_MOVIL_QR_MAX_BYTES,
  ATH_MOVIL_QR_TYPES,
  MAX_LABEL_LENGTH,
  athMovilQrUrl,
} from "@/lib/ath-movil/config";
import type { AthMovilAccountRow } from "@/lib/ath-movil/queries";
import { createClient } from "@/lib/supabase/client";

/**
 * The admin's list of ATH Móvil Business accounts: what organizers pick from
 * in the publish wizard. Accounts are added and edited here, and retired
 * rather than deleted — registrations keep pointing at them.
 */
export function AthMovilAccounts({
  initial,
}: {
  initial: AthMovilAccountRow[];
}) {
  const t = useT();
  const { toast } = useToast();
  const [accounts, setAccounts] = useState(initial);
  /** The account being edited, "new" for the add form, null for neither. */
  const [editing, setEditing] = useState<string | null>(
    initial.length === 0 ? "new" : null,
  );
  const [busy, setBusy] = useState<string | null>(null);

  function saved(account: AthMovilAccountRow) {
    setAccounts((all) => {
      const rest = all.filter((a) => a.id !== account.id);
      return [...rest, account].sort((a, b) => a.label.localeCompare(b.label));
    });
    setEditing(null);
    toast({
      title: t("adminAccounts.savedTitle"),
      body: t("adminAccounts.savedBody", { label: account.label }),
    });
  }

  async function toggle(account: AthMovilAccountRow) {
    setBusy(account.id);
    const result = await setAthMovilAccountActiveAction(
      account.id,
      !account.active,
    ).catch((): AccountResult => ({ ok: false, error: "saveFailed" }));
    setBusy(null);

    if (result.ok) {
      setAccounts((all) =>
        all.map((a) => (a.id === result.account.id ? result.account : a)),
      );
      toast({
        title: t(
          result.account.active
            ? "adminAccounts.restoredTitle"
            : "adminAccounts.retiredTitle",
        ),
        body: t(
          result.account.active
            ? "adminAccounts.restoredBody"
            : "adminAccounts.retiredBody",
          { label: result.account.label },
        ),
      });
    } else {
      toast({
        title: t("adminAccounts.errors.title"),
        body: t(`adminAccounts.errors.${result.error ?? "saveFailed"}`),
        tone: "danger",
      });
    }
  }

  return (
    <div className="grid gap-4">
      {accounts.length === 0 && editing !== "new" ? (
        <p className="border-2 border-line p-7 text-[15px] text-fg-dim">
          {t("adminAccounts.empty")}
        </p>
      ) : null}

      <ul className="grid gap-4">
        {accounts.map((account) =>
          editing === account.id ? (
            <li key={account.id}>
              <AccountForm
                account={account}
                onSaved={saved}
                onCancel={() => setEditing(null)}
              />
            </li>
          ) : (
            <li
              key={account.id}
              className="flex flex-wrap items-center gap-5 border-2 border-line p-5 sm:p-6"
            >
              <QrThumb url={account.qrUrl} path={account.path} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-3">
                  <p className="text-xl font-extrabold break-words">
                    {account.label}
                  </p>
                  {account.active ? null : (
                    <Badge tone="neutral">{t("adminAccounts.retired")}</Badge>
                  )}
                </div>
                <p
                  translate="no"
                  className="mt-1 font-mono text-[15px] font-bold break-all text-neon-lime"
                >
                  {account.path}
                </p>
                {account.qrUrl ? null : (
                  <p className="mt-1 text-[13px] text-fg-dim">
                    {t("adminAccounts.noQr")}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap gap-3">
                <Button
                  variant="outline"
                  size="md"
                  disabled={busy !== null}
                  onClick={() => setEditing(account.id)}
                >
                  {t("adminAccounts.edit")}
                </Button>
                <Button
                  variant={account.active ? "ghost" : "success"}
                  size="md"
                  disabled={busy !== null}
                  aria-busy={busy === account.id}
                  onClick={() => toggle(account)}
                >
                  {busy === account.id
                    ? t("adminAccounts.working")
                    : t(
                        account.active
                          ? "adminAccounts.retire"
                          : "adminAccounts.restore",
                      )}
                </Button>
              </div>
            </li>
          ),
        )}
      </ul>

      {editing === "new" ? (
        <AccountForm
          onSaved={saved}
          onCancel={accounts.length ? () => setEditing(null) : undefined}
        />
      ) : (
        <div>
          <Button
            variant="secondary"
            size="md"
            disabled={busy !== null}
            onClick={() => setEditing("new")}
          >
            {t("adminAccounts.add")}
          </Button>
        </div>
      )}
    </div>
  );
}

function QrThumb({ url, path }: { url?: string; path: string }) {
  const t = useT();
  return (
    <div className="flex h-24 w-24 shrink-0 items-center justify-center bg-white p-1.5">
      {url ? (
        // Shown as uploaded: a QR code must not be resampled.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={t("register.athMovil.qrAlt", { path })}
          width={84}
          height={84}
          className="block h-full w-full object-contain"
        />
      ) : (
        <span aria-hidden="true" className="font-mono text-[11px] text-ink/50">
          QR
        </span>
      )}
    </div>
  );
}

/**
 * Add or edit one account. The QR code uploads as soon as it is picked; an
 * upload no save claimed is deleted when it is replaced or the form closes.
 */
function AccountForm({
  account,
  onSaved,
  onCancel,
}: {
  account?: AthMovilAccountRow;
  onSaved: (account: AthMovilAccountRow) => void;
  /** Absent when there is nothing to go back to. */
  onCancel?: () => void;
}) {
  const t = useT();
  const fileId = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const savedQr = account?.qrPath ?? null;
  const [qrPath, setQrPath] = useState<string | null>(savedQr);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [qrError, setQrError] = useState<string>();
  const [fieldErrors, setFieldErrors] = useState<{
    label?: string;
    path?: string;
  }>({});
  const [error, setError] = useState<string>();

  /** Drop an upload no save has claimed. Best effort. */
  function discard(path: string | null) {
    if (path && path !== savedQr) {
      void createClient().storage.from(ATH_MOVIL_QR_BUCKET).remove([path]);
    }
  }

  async function upload(file: File) {
    setQrError(undefined);
    const ext = ATH_MOVIL_QR_TYPES[file.type];
    if (!ext) return setQrError("qrType");
    if (file.size > ATH_MOVIL_QR_MAX_BYTES) return setQrError("qrTooLarge");

    setUploading(true);
    const path = `${crypto.randomUUID()}.${ext}`;
    const { error: storageError } = await createClient()
      .storage.from(ATH_MOVIL_QR_BUCKET)
      // Each upload gets a fresh name, so the file never changes in place.
      .upload(path, file, { contentType: file.type, cacheControl: "31536000" })
      .catch(() => ({ error: true }));
    setUploading(false);
    if (storageError) return setQrError("qrUploadFailed");

    discard(qrPath);
    setQrPath(path);
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    setSaving(true);
    setError(undefined);
    const result = await saveAthMovilAccountAction({
      id: account?.id ?? null,
      label: String(data.get("label") ?? ""),
      path: String(data.get("path") ?? ""),
      qrPath,
    }).catch((): AccountResult => ({ ok: false, error: "saveFailed" }));
    setSaving(false);

    if (result.ok) return onSaved(result.account);
    setFieldErrors(result.fieldErrors ?? {});
    setError(result.error);
  }

  function cancel() {
    discard(qrPath);
    onCancel?.();
  }

  const qrUrl = athMovilQrUrl(qrPath);
  const err = (key?: string) =>
    key ? t(`adminAccounts.errors.${key}`) : undefined;

  return (
    <form
      onSubmit={submit}
      noValidate
      aria-label={t(account ? "adminAccounts.editTitle" : "adminAccounts.addTitle")}
      className="border-2 border-neon-lime"
    >
      <p className="border-b-2 border-line px-5 py-4 font-display text-lg font-black uppercase sm:px-6">
        {t(account ? "adminAccounts.editTitle" : "adminAccounts.addTitle")}
      </p>

      <div className="grid gap-6 p-5 sm:grid-cols-2 sm:p-6">
        <Field
          label={t("adminAccounts.label")}
          hint={t("adminAccounts.labelHint")}
          error={err(fieldErrors.label)}
        >
          {(p) => (
            <Input
              {...p}
              name="label"
              defaultValue={account?.label}
              maxLength={MAX_LABEL_LENGTH}
              autoComplete="off"
              placeholder={t("adminAccounts.labelPlaceholder")}
            />
          )}
        </Field>
        <Field
          label={t("adminAccounts.path")}
          hint={t("adminAccounts.pathHint")}
          error={err(fieldErrors.path)}
        >
          {(p) => (
            <Input
              {...p}
              name="path"
              translate="no"
              defaultValue={account?.path}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="/NeonsRunning"
            />
          )}
        </Field>
      </div>

      <div className="flex flex-wrap items-center gap-5 border-t-2 border-line p-5 sm:p-6">
        <QrThumb url={qrUrl} path={account?.path ?? ""} />
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <input
            ref={fileRef}
            id={fileId}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="sr-only"
            disabled={uploading}
            aria-describedby={`${fileId}-message`}
            onChange={(e) => {
              const file = e.target.files?.[0];
              // Cleared so picking the same file again still fires a change.
              e.target.value = "";
              if (file) void upload(file);
            }}
          />
          <div className="flex flex-wrap gap-3">
            <Button
              variant="outline"
              size="md"
              disabled={uploading || saving}
              aria-busy={uploading}
              onClick={() => fileRef.current?.click()}
            >
              {uploading
                ? t("adminAccounts.qrUploading")
                : t(qrPath ? "adminAccounts.qrReplace" : "adminAccounts.qrChoose")}
            </Button>
            {qrPath ? (
              <Button
                variant="ghost"
                size="md"
                className="text-danger"
                disabled={uploading || saving}
                onClick={() => {
                  discard(qrPath);
                  setQrPath(null);
                }}
              >
                {t("adminAccounts.qrRemove")}
              </Button>
            ) : null}
          </div>
          {qrError ? (
            <p
              id={`${fileId}-message`}
              role="alert"
              className="flex items-center gap-2 text-[13px] font-semibold text-danger"
            >
              <span aria-hidden="true">▲</span>
              {t(`adminAccounts.errors.${qrError}`)}
            </p>
          ) : (
            <p id={`${fileId}-message`} className="text-[13px] text-fg-dim">
              {t("adminAccounts.qrHint")}
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t-2 border-line p-5 sm:p-6">
        <Button
          type="submit"
          variant="secondary"
          size="md"
          disabled={saving || uploading}
          aria-busy={saving}
        >
          {saving ? t("adminAccounts.working") : t("adminAccounts.save")}
        </Button>
        {onCancel ? (
          <Button variant="ghost" size="md" disabled={saving} onClick={cancel}>
            {t("adminAccounts.cancel")}
          </Button>
        ) : null}
        {error ? (
          <p role="alert" className="text-[13px] font-semibold text-danger">
            {t(`adminAccounts.errors.${error}`)}
          </p>
        ) : null}
      </div>
    </form>
  );
}
