import type { Metadata } from "next";
import { Link } from "@/components/i18n/link";
import { getT } from "@/lib/i18n/server";
import { AuthShell } from "@/components/auth/auth-shell";
import { ForgotPasswordForm } from "@/components/auth/forms";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("auth.forgot.metaTitle") };
}

export default async function ForgotPasswordPage() {
  const t = await getT();

  return (
    <AuthShell
      title={t("auth.forgot.title")}
      intro={t("auth.forgot.intro")}
      stats={false}
      footer={
        <>
          {t("auth.forgot.footerPre")}{" "}
          <Link href="/login" className="font-bold text-neon-lime hover:underline">
            {t("auth.forgot.footerLink")}
          </Link>
        </>
      }
    >
      <ForgotPasswordForm />
    </AuthShell>
  );
}
