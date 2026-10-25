"use server";

import { revalidatePath } from "next/cache";
import { isPlatformAdmin } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  ATH_MOVIL_PATH,
  ATH_MOVIL_QR_BUCKET,
  MAX_LABEL_LENGTH,
  toAthMovilAccount,
} from "./config";
import { getOwners, type AthMovilAccountRow, type AthMovilOwner } from "./queries";

/**
 * Listing ATH Móvil Business accounts: what organizers pick from in the
 * publish wizard. Platform admins only — the row-level security on
 * `ath_movil_accounts` refuses anyone else whatever this file does; the
 * check here is for the message.
 *
 * The QR code is uploaded by the browser straight into the `ath-movil-qr`
 * bucket, so only its object path arrives here. Errors come back as keys
 * under `adminAccounts.errors`.
 */

export type AccountInput = {
  /** Null to add a new account. */
  id: string | null;
  label: string;
  path: string;
  /** Object path in the bucket; null for no QR code. */
  qrPath: string | null;
  /**
   * Account id of the organizer who holds the business app, as
   * `lookupAthMovilOwnerAction` resolved it and the admin confirmed; null for
   * none. They may approve payments into it for their own events; with no
   * owner, only platform admins review.
   *
   * An id and not the typed handle: runners pick their own handles, so a
   * handle resolved at save time could name whoever claimed it a moment ago.
   */
  ownerId: string | null;
};

export type OwnerLookupResult =
  | { ok: true; owner: AthMovilOwner }
  | { ok: false; error: "notAdmin" | "ownerNotFound" | "ownerNotOrganizer" };

export type AccountResult =
  | { ok: true; account: AthMovilAccountRow }
  | {
      ok: false;
      /** Field name to a key under `adminAccounts.errors`. */
      fieldErrors?: Partial<Record<"label" | "path" | "owner", string>>;
      error?: "notAdmin" | "saveFailed";
    };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Mirrors the `qr_path` check on the table. */
const QR_PATH = /^[0-9a-f-]{36}\.(png|jpg|webp)$/;
const UNIQUE_VIOLATION = "23505";

const COLUMNS = "id, label, path, qr_path, active, owner_id";

async function toRow(r: {
  id: string;
  label: string;
  path: string;
  qr_path: string | null;
  active: boolean;
  owner_id: string | null;
}): Promise<AthMovilAccountRow> {
  const owners = await getOwners([r.owner_id]);
  return {
    ...toAthMovilAccount(r),
    qrPath: r.qr_path,
    active: r.active,
    owner: r.owner_id ? (owners.get(r.owner_id) ?? null) : null,
  };
}

/**
 * Check that a profile can own an account. Read with the service role — the
 * profile may be private — so call it only once the caller is known to be
 * an admin.
 */
async function findOwner(
  by: { handle: string } | { id: string },
): Promise<{ owner: AthMovilOwner } | { error: "ownerNotFound" | "ownerNotOrganizer" }> {
  const query = createAdminClient().from("profiles").select("id, handle, full_name, account_type");
  const { data } = await ("handle" in by
    ? query.eq("handle", by.handle)
    : query.eq("id", by.id)
  ).maybeSingle();
  if (!data) return { error: "ownerNotFound" };
  // Only an event's organizer ever approves, so an owner who isn't one
  // could approve nothing: almost certainly the wrong handle.
  if (data.account_type !== "organizer") return { error: "ownerNotOrganizer" };
  return { owner: { id: data.id, handle: data.handle, name: data.full_name } };
}

/**
 * Who a typed handle names right now, for the admin to check by name before
 * saving. The save then stores that profile's id, so a handle changing hands
 * between the look-up and the save cannot redirect it.
 */
export async function lookupAthMovilOwnerAction(typed: string): Promise<OwnerLookupResult> {
  if (!(await isPlatformAdmin())) return { ok: false, error: "notAdmin" };
  const handle = typeof typed === "string" ? typed.trim().replace(/^@/, "").toLowerCase() : "";
  if (!handle) return { ok: false, error: "ownerNotFound" };

  const found = await findOwner({ handle });
  return "error" in found ? { ok: false, error: found.error } : { ok: true, owner: found.owner };
}

/** Add an account, or change one's label, path or QR code. */
export async function saveAthMovilAccountAction(
  input: AccountInput,
): Promise<AccountResult> {
  const id = typeof input?.id === "string" ? input.id : null;
  if (id !== null && !UUID.test(id)) return { ok: false, error: "saveFailed" };

  const label = typeof input.label === "string" ? input.label.trim() : "";
  // Typed with or without the slash; stored with it, as the app shows it.
  const typed = typeof input.path === "string" ? input.path.trim() : "";
  const path = typed && !typed.startsWith("/") ? `/${typed}` : typed;
  const qrPath =
    typeof input.qrPath === "string" && QR_PATH.test(input.qrPath)
      ? input.qrPath
      : null;

  const fieldErrors: { label?: string; path?: string } = {};
  if (!label) fieldErrors.label = "labelRequired";
  else if (label.length > MAX_LABEL_LENGTH) fieldErrors.label = "labelTooLong";
  if (!ATH_MOVIL_PATH.test(path)) fieldErrors.path = "pathInvalid";
  if (Object.keys(fieldErrors).length) return { ok: false, fieldErrors };

  if (!(await isPlatformAdmin())) return { ok: false, error: "notAdmin" };

  let ownerId: string | null = null;
  if (input.ownerId !== null) {
    if (typeof input.ownerId !== "string" || !UUID.test(input.ownerId)) {
      return { ok: false, error: "saveFailed" };
    }
    // Still an organizer since the look-up?
    const found = await findOwner({ id: input.ownerId });
    if ("error" in found) return { ok: false, fieldErrors: { owner: found.error } };
    ownerId = found.owner.id;
  }

  const supabase = await createClient();
  let previousQr: string | null = null;
  if (id) {
    const { data } = await supabase
      .from("ath_movil_accounts")
      .select("qr_path")
      .eq("id", id)
      .maybeSingle();
    if (!data) return { ok: false, error: "saveFailed" };
    previousQr = data.qr_path;
  }

  const values = { label, path, qr_path: qrPath, owner_id: ownerId };
  const { data, error } = id
    ? await supabase
        .from("ath_movil_accounts")
        .update(values)
        .eq("id", id)
        .select(COLUMNS)
        .maybeSingle()
    : await supabase
        .from("ath_movil_accounts")
        .insert(values)
        .select(COLUMNS)
        .maybeSingle();

  if (error?.code === UNIQUE_VIOLATION) {
    return { ok: false, fieldErrors: { path: "pathTaken" } };
  }
  if (error || !data) {
    console.error("Saving the ATH Móvil account failed:", error?.message);
    return { ok: false, error: "saveFailed" };
  }

  // The old QR code is no longer shown anywhere. Best effort: a leftover
  // file costs storage, not correctness.
  if (previousQr && previousQr !== data.qr_path) {
    await supabase.storage.from(ATH_MOVIL_QR_BUCKET).remove([previousQr]);
  }

  // Payment steps and the wizard read the account.
  revalidatePath("/", "layout");
  return { ok: true, account: await toRow(data) };
}

/**
 * Retire an account, or bring one back. A retired account stays on the
 * events and registrations that used it, but runners are no longer offered
 * it and organizers can no longer pick it.
 */
export async function setAthMovilAccountActiveAction(
  id: string,
  active: boolean,
): Promise<AccountResult> {
  if (typeof id !== "string" || !UUID.test(id) || typeof active !== "boolean") {
    return { ok: false, error: "saveFailed" };
  }
  if (!(await isPlatformAdmin())) return { ok: false, error: "notAdmin" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ath_movil_accounts")
    .update({ active })
    .eq("id", id)
    .select(COLUMNS)
    .maybeSingle();
  if (error || !data) {
    console.error("Updating the ATH Móvil account failed:", error?.message);
    return { ok: false, error: "saveFailed" };
  }

  revalidatePath("/", "layout");
  return { ok: true, account: await toRow(data) };
}
