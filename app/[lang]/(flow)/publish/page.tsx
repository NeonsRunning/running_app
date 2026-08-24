import type { Metadata } from "next";
import { PublishWizard } from "@/components/publish/publish-wizard";
import { getT } from "@/lib/i18n/server";
import { requireUser } from "@/lib/auth/session";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return {
    title: t("publish.metaTitle"),
    description: t("publish.metaDescription"),
  };
}

export default async function PublishPage() {
  await requireUser("/publish");

  return <PublishWizard />;
}
