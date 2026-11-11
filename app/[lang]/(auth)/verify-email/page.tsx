import type { Metadata } from "next";
import { cookies } from "next/headers";
import { VERIFY_EMAIL_COOKIE } from "@/lib/auth/routes";
import { Link } from "@/components/i18n/link";
import { getT } from "@/lib/i18n/server";
import { AuthShell } from "@/components/auth/auth-shell";
import { VerifyEmailPanel } from "@/components/auth/forms";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("auth.verify.metaTitle") };
}

export default async function VerifyEmailPage(
  props: PageProps<"/[lang]/verify-email">,
) {
  const t = await getT();
  const params = await props.searchParams;

  // Sign-up leaves the address in a short-lived cookie: confirming leaves no
  // session to read it from, and the panel needs it both to name the inbox
  // and to resend. Links written before that carried it in the URL.
  const raw = params.email;
  const email =
    (await cookies()).get(VERIFY_EMAIL_COOKIE)?.value ||
    (Array.isArray(raw) ? raw[0] : raw);

  return (
    <AuthShell
      title={t("auth.verify.title")}
      intro={t("auth.verify.intro")}
      footer={
        <>
          {t("auth.verify.footerPre")}{" "}
          <Link href="/signup" className="font-bold text-neon-lime hover:underline">
            {t("auth.verify.footerLink")}
          </Link>
        </>
      }
    >
      <VerifyEmailPanel email={email} />
    </AuthShell>
  );
}
