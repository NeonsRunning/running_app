import type { Metadata } from "next";
import { Link } from "@/components/i18n/link";
import { getT } from "@/lib/i18n/server";
import { AuthShell } from "@/components/auth/auth-shell";
import { ResetPasswordForm } from "@/components/auth/forms";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("auth.reset.metaTitle") };
}

/**
 * The far end of the recovery email. `app/[lang]/auth/confirm` has already
 * spent the link's token by the time this renders, so the runner arrives
 * signed in and can set a new password — that session is the authorization.
 */
export default async function ResetPasswordPage() {
  const t = await getT();

  return (
    <AuthShell
      title={t("auth.reset.title")}
      intro={t("auth.reset.intro")}
      stats={false}
      footer={
        <>
          {t("auth.reset.footerPre")}{" "}
          <Link href="/login" className="font-bold text-neon-lime hover:underline">
            {t("auth.reset.footerLink")}
          </Link>
        </>
      }
    >
      <ResetPasswordForm />
    </AuthShell>
  );
}
