import type { Metadata } from "next";
import { Link } from "@/components/i18n/link";
import { getT } from "@/lib/i18n/server";
import { AuthShell } from "@/components/auth/auth-shell";
import { LoginForm } from "@/components/auth/forms";
import { safeNextPath } from "@/lib/auth/routes";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("auth.login.metaTitle") };
}

/** Failures that redirect here rather than rendering a screen of their own. */
const NOTICES = new Set(["oauth", "link"]);

export default async function LoginPage(props: PageProps<"/[lang]/login">) {
  const t = await getT();
  const params = await props.searchParams;
  const first = (v: string | string[] | undefined) =>
    Array.isArray(v) ? v[0] : v;

  // Where the proxy turned the runner away from, so login can finish the trip.
  const next = safeNextPath(first(params.next)) ?? undefined;
  const error = first(params.error);
  const notice = error && NOTICES.has(error) ? error : undefined;

  return (
    <AuthShell
      title={t("auth.login.title")}
      intro={t("auth.login.intro")}
      footer={
        <>
          {t("auth.login.footerPre")}{" "}
          <Link
            href="/signup"
            className="font-bold text-neon-lime hover:underline"
          >
            {t("auth.login.footerLink")}
          </Link>
        </>
      }
    >
      <LoginForm next={next} notice={notice} />
    </AuthShell>
  );
}
