import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AthMovilAccounts } from "@/components/admin/ath-movil-accounts";
import { Eyebrow } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { listAthMovilAccounts } from "@/lib/ath-movil/queries";
import { requireAdmin } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("adminAccounts.metaTitle"), robots: { index: false } };
}

/**
 * The ATH Móvil Business accounts organizers choose from for their events.
 * Like /admin/payments, a 404 for anyone but a platform admin.
 */
export default async function AdminAthMovilAccountsPage() {
  if (!(await requireAdmin("/admin/payments/accounts"))) notFound();

  const [t, accounts] = await Promise.all([
    getT(),
    listAthMovilAccounts({ includeRetired: true }),
  ]);

  return (
    <div className="mx-auto max-w-[1100px] px-4 py-10 sm:px-6 lg:px-10 lg:py-14">
      <header className="pb-8">
        <Eyebrow>{t("adminAccounts.eyebrow")}</Eyebrow>
        <h1 className="mt-3 font-display text-4xl font-black uppercase sm:text-5xl">
          {t("adminAccounts.title")}
        </h1>
        <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-fg-dim">
          {t("adminAccounts.body")}
        </p>
        <div className="mt-6">
          <Button href="/admin/payments" variant="outline" size="sm">
            {t("adminAccounts.backToPayments")}
          </Button>
        </div>
      </header>

      <AthMovilAccounts initial={accounts} />
    </div>
  );
}
