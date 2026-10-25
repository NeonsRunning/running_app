import type { Metadata, Viewport } from "next";
import { Archivo, IBM_Plex_Mono } from "next/font/google";
import { ToastProvider } from "@/components/ui/toast";
import { I18nProvider } from "@/components/i18n/provider";
import { LOCALES, LOCALE_TAGS } from "@/lib/i18n/config";
import { getDictionary, getLocale, getT } from "@/lib/i18n/server";
import { configuredOrigin, openGraphBase } from "@/lib/seo";
import "../globals.css";

const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

/** Both languages are known ahead of time, so both are prerendered. */
export function generateStaticParams() {
  return LOCALES.map((lang) => ({ lang }));
}

/**
 * Defaults for every page. No canonical here: every page beneath would
 * inherit it and point search engines at the home page. Pages meant to be
 * found set their own with `pageAlternates`; the rest are noindexed.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  const origin = configuredOrigin();

  return {
    metadataBase: origin ? new URL(origin) : undefined,
    title: {
      default: t("meta.title"),
      template: t("meta.titleTemplate"),
    },
    description: t("meta.description"),
    applicationName: t("meta.applicationName"),
    // Title, description and image are filled in from the page's own.
    openGraph: await openGraphBase(),
    twitter: { card: "summary_large_image" },
  };
}

export const viewport: Viewport = {
  themeColor: "#050505",
  colorScheme: "dark",
};

export default async function RootLayout({ children }: LayoutProps<"/[lang]">) {
  const locale = await getLocale();
  const dict = await getDictionary();
  const t = await getT();

  return (
    <html
      lang={LOCALE_TAGS[locale]}
      className={`${archivo.variable} ${plexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-ink text-fg">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-100 focus:bg-neon-yellow focus:px-4 focus:py-3 focus:text-sm focus:font-black focus:uppercase focus:tracking-widest focus:text-ink"
        >
          {t("common.skipToContent")}
        </a>
        <I18nProvider locale={locale} dict={dict}>
          <ToastProvider>{children}</ToastProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
