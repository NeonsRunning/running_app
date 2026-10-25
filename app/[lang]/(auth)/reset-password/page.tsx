import type { Metadata } from "next";
import { Link } from "@/components/i18n/link";
import { getT } from "@/lib/i18n/server";
import { AuthShell } from "@/components/auth/auth-shell";
import { ResetPasswordForm } from "@/components/auth/forms";
import { isRecoverySession } from "@/lib/auth/session";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("auth.reset.metaTitle") };
}

/**
 * The far end of the recovery email. The link's token has been spent by the
 * time this renders, so the runner arrives signed in and can set a new
 * password — that recovery session is the authorization. Reached with any
 * other session, the form asks for the current password as well.
 */
export default async function ResetPasswordPage() {
  const t = await getT();
  const recovering = await isRecoverySession();

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
      <ResetPasswordForm requireCurrent={!recovering} />
    </AuthShell>
  );
}
