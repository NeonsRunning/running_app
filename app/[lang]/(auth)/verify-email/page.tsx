import type { Metadata } from "next";
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

  // Sign-up puts the address in the URL: the code has to be verified against
  // it, and there is no session yet to read it from.
  const raw = params.email;
  const email = Array.isArray(raw) ? raw[0] : raw;

  return (
    <AuthShell
      title={t("auth.verify.title")}
      intro={t("auth.verify.intro")}
      stats={false}
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
