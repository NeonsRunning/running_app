import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Link } from "@/components/i18n/link";
import { getLocale, getT } from "@/lib/i18n/server";
import { localizePath } from "@/lib/i18n/config";
import { AuthShell } from "@/components/auth/auth-shell";
import { ConfirmLinkForm } from "@/components/auth/forms";
import { isEmailLinkType, safeNextPath } from "@/lib/auth/routes";
import { getUser } from "@/lib/auth/session";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("auth.confirmLink.metaTitle") };
}

/**
 * Where an emailed `token_hash` link waits to be spent. `app/[lang]/auth/confirm`
 * forwards here instead of signing the browser in on sight, because anyone
 * can mail a stranger a link to their own account.
 *
 * Which account the link belongs to is not known until it is spent — the hash
 * names no one — so this cannot say "continue as x@y.com". What it can do is
 * make signing in take a deliberate press, name the account that press would
 * replace, and say not to continue with a link nobody asked for. Once in, the
 * header shows whose account it is.
 */
export default async function ConfirmLinkPage(
  props: PageProps<"/[lang]/confirm-link">,
) {
  const [t, locale, params] = await Promise.all([
    getT(),
    getLocale(),
    props.searchParams,
  ]);
  const first = (v: string | string[] | undefined) =>
    Array.isArray(v) ? v[0] : v;

  const tokenHash = first(params.token_hash);
  const type = first(params.type);
  if (!tokenHash || !isEmailLinkType(type)) {
    redirect(`${localizePath("/login", locale)}?error=link`);
  }
  const next = safeNextPath(first(params.next)) ?? undefined;
  const user = await getUser();

  return (
    <AuthShell
      title={t("auth.confirmLink.title")}
      intro={t(
        type === "recovery"
          ? "auth.confirmLink.introRecovery"
          : "auth.confirmLink.intro",
      )}
      stats={false}
      footer={
        <>
          {t("auth.confirmLink.footerPre")}{" "}
          <Link href="/login" className="font-bold text-neon-lime hover:underline">
            {t("auth.confirmLink.footerLink")}
          </Link>
        </>
      }
    >
      <ConfirmLinkForm
        tokenHash={tokenHash}
        type={type}
        next={next}
        signedInAs={user?.email ?? undefined}
      />
    </AuthShell>
  );
}
