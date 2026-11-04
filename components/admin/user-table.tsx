import { Link } from "@/components/i18n/link";
import { Badge } from "@/components/ui/badge";
import { puertoRicoDate } from "@/lib/dates";
import type { Formatters } from "@/lib/i18n/format";
import type { Translate } from "@/lib/i18n/translate";
import type { AdminUserRow } from "@/lib/profile/admin-queries";

/** A number the admin can call straight from the table. */
function PhoneLink({ phone }: { phone: string }) {
  return (
    <a
      href={`tel:${phone.replace(/[^+\d]/g, "")}`}
      translate="no"
      className="whitespace-nowrap tabular-nums hover:text-neon-lime"
    >
      {phone}
    </a>
  );
}

/**
 * The accounts on `/admin/users`, one per row. A server component: nothing
 * here changes in place, and each name links to that person's profile. The
 * table scrolls sideways inside its own box on a narrow screen.
 */
export function UserTable({
  rows,
  t,
  fmt,
}: {
  rows: AdminUserRow[];
  t: Translate;
  fmt: Formatters;
}) {
  const columns = [
    t("adminUsers.columnUser"),
    t("adminUsers.columnEmail"),
    t("adminUsers.columnPhone"),
    t("adminUsers.columnEmergency"),
    t("adminUsers.columnRole"),
    t("adminUsers.columnLocation"),
    t("adminUsers.columnProfile"),
    t("adminUsers.columnJoined"),
    t("adminUsers.columnLastSignIn"),
  ];

  return (
    <div className="overflow-x-auto border-2 border-line">
      <table className="w-full min-w-[76rem] border-collapse">
        <caption className="sr-only">{t("adminUsers.title")}</caption>
        <thead>
          <tr className="border-b-2 border-line">
            {columns.map((label) => (
              <th
                key={label}
                scope="col"
                className="px-3 py-3 text-left font-mono text-[10px] tracking-[0.16em] text-fg-dim uppercase"
              >
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b-2 border-line align-top last:border-b-0">
              <td className="px-3 py-3">
                <div className="flex items-center gap-3">
                  {row.avatarUrl ? (
                    // A Supabase Storage URL; next/image would need the
                    // project's host configured as a remote pattern.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={row.avatarUrl}
                      alt=""
                      width={32}
                      height={32}
                      loading="lazy"
                      className="h-8 w-8 shrink-0 object-cover"
                    />
                  ) : (
                    <span
                      aria-hidden="true"
                      className="flex h-8 w-8 shrink-0 items-center justify-center bg-graphite text-[11px] font-black text-fg-dim"
                    >
                      {row.initials}
                    </span>
                  )}
                  <div className="min-w-0">
                    <Link
                      href={`/runners/${row.id}`}
                      className="text-sm font-bold wrap-break-word hover:text-neon-lime"
                    >
                      {row.name}
                    </Link>
                    <p translate="no" className="text-[11px] break-all text-fg-faint">
                      @{row.handle}
                    </p>
                  </div>
                </div>
              </td>
              <td translate="no" className="px-3 py-3 text-sm break-all text-fg-dim">
                {row.email}
              </td>
              <td className="px-3 py-3 text-sm text-fg-dim">
                {row.phone ? <PhoneLink phone={row.phone} /> : "—"}
              </td>
              <td className="px-3 py-3 text-sm wrap-break-word text-fg-dim">
                {row.emergencyContactName || row.emergencyContactPhone ? (
                  <>
                    {row.emergencyContactName ? <p>{row.emergencyContactName}</p> : null}
                    {row.emergencyContactPhone ? (
                      <PhoneLink phone={row.emergencyContactPhone} />
                    ) : null}
                  </>
                ) : (
                  "—"
                )}
              </td>
              <td className="px-3 py-3">
                <div className="flex flex-wrap gap-1.5">
                  <Badge>
                    {t(
                      row.accountType === "organizer"
                        ? "adminUsers.roleOrganizer"
                        : "adminUsers.roleRunner",
                    )}
                  </Badge>
                  {row.isAdmin ? <Badge tone="lime">{t("adminUsers.roleAdmin")}</Badge> : null}
                </div>
              </td>
              <td className="px-3 py-3 text-sm wrap-break-word text-fg-dim">
                {[row.city, row.club].filter(Boolean).join(" · ") || "—"}
              </td>
              <td className="px-3 py-3 text-sm text-fg-dim">
                {t(row.isPublic ? "adminUsers.profilePublic" : "adminUsers.profilePrivate")}
              </td>
              <td className="px-3 py-3 text-sm whitespace-nowrap text-fg-dim tabular-nums">
                {fmt.mediumDate(puertoRicoDate(row.joinedAt))}
              </td>
              <td className="px-3 py-3 text-sm whitespace-nowrap text-fg-dim tabular-nums">
                {row.lastSignInAt
                  ? fmt.mediumDate(puertoRicoDate(row.lastSignInAt))
                  : t("adminUsers.neverSignedIn")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
