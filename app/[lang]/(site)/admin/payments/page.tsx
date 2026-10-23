import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AthMovilReview } from "@/components/admin/ath-movil-review";
import { Eyebrow } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { listAthMovilSubmissions } from "@/lib/ath-movil/queries";
import { requireAdmin } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("adminPayments.metaTitle"), robots: { index: false } };
}

/**
 * ATH Móvil payments waiting for a platform admin to find them in the ATH
 * Móvil Business app. Anyone else gets a 404: the page does not advertise
 * that it exists.
 */
export default async function AdminPaymentsPage() {
  if (!(await requireAdmin("/admin/payments"))) notFound();

  const [t, submissions] = await Promise.all([
    getT(),
    listAthMovilSubmissions(),
  ]);

  return (
    <div className="mx-auto max-w-[1100px] px-4 py-10 sm:px-6 lg:px-10 lg:py-14">
      <header className="pb-8">
        <Eyebrow>{t("adminPayments.eyebrow")}</Eyebrow>
        <h1 className="mt-3 font-display text-4xl font-black uppercase sm:text-5xl">
          {t("adminPayments.title")}
        </h1>
        <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-fg-dim">
          {t("adminPayments.body")}
        </p>
        <div className="mt-6">
          <Button href="/admin/payments/accounts" variant="outline" size="sm">
            {t("adminPayments.manageAccounts")}
          </Button>
        </div>
      </header>

      <AthMovilReview initial={submissions} />
    </div>
  );
}
