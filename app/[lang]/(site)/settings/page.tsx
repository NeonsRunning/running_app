import type { Metadata } from "next";
import { SettingsPanel } from "@/components/settings/settings-panel";
import { getT } from "@/lib/i18n/server";
import { requireAccount } from "@/lib/auth/session";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return {
    title: t("settings.metaTitle"),
    description: t("settings.metaDescription"),
  };
}

export default async function SettingsPage() {
  const { profile } = await requireAccount("/settings");

  return <SettingsPanel profile={profile} />;
}
