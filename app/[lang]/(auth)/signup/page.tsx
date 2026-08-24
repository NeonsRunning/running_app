import type { Metadata } from "next";
import { Link } from "@/components/i18n/link";
import { getT } from "@/lib/i18n/server";
import { AuthShell } from "@/components/auth/auth-shell";
import { SignUpForm } from "@/components/auth/forms";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("auth.signup.metaTitle") };
}

export default async function SignUpPage() {
  const t = await getT();

  return (
    <AuthShell
      title={t("auth.signup.title")}
      intro={t("auth.signup.intro")}
      footer={
        <>
          {t("auth.signup.footerPre")}{" "}
          <Link href="/login" className="font-bold text-neon-lime hover:underline">
            {t("auth.signup.footerLink")}
          </Link>
        </>
      }
    >
      <SignUpForm />
    </AuthShell>
  );
}
