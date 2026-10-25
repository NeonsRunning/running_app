import type { Metadata } from "next";
import en from "@/dictionaries/en.json";
import es from "@/dictionaries/es.json";
import { localizePath } from "@/lib/i18n/config";
import { createTranslator } from "@/lib/i18n/translate";
import { NOINDEX } from "@/lib/seo";
import "./globals.css";

/**
 * The 404 for URLs no route matches, rendered without any layout.
 *
 * `app/[lang]/not-found.tsx` covers a missing event or runner, under a valid
 * language. This one is for what never reaches it: a first segment that is
 * no language at all. Paths with a dot skip the proxy (it leaves files
 * alone), so `/foo.bar` lands on `app/[lang]` unrewritten with `lang`
 * "foo.bar", and the root layout's `getLocale()` calls `notFound()` before
 * any layout could render a page for it. Needs `experimental.globalNotFound`
 * in next.config.ts.
 *
 * With no language in the URL it says its piece in both, Spanish first, as
 * `global-error.tsx` does. The copy is the dictionaries' own, imported
 * directly: there is no request locale to load them by.
 */

const tEs = createTranslator(es, "es");
const tEn = createTranslator(en, "en");

export const metadata: Metadata = {
  title: `404 · ${tEs("notFound.title")} — NEONS RUNNING`,
  robots: NOINDEX,
};

export default function GlobalNotFound() {
  return (
    <html lang="es" className="h-full antialiased">
      <body className="min-h-full bg-ink text-fg">
        <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-16 text-center">
          <p className="font-display text-[6rem] leading-none font-black tracking-[-0.05em] text-neon-yellow sm:text-[9rem]">
            404
          </p>
          <h1 className="mt-4 text-3xl font-black uppercase sm:text-4xl">
            {tEs("notFound.title")}
          </h1>
          <p className="mx-auto mt-5 max-w-md text-[15px] leading-relaxed text-fg-dim">
            {tEs("notFound.body")}
          </p>
          <p lang="en" className="mx-auto mt-3 max-w-md text-[15px] leading-relaxed text-fg-dim">
            {tEn("notFound.body")}
          </p>
          <div className="mt-9 flex flex-wrap justify-center gap-3">
            {/* Full page loads: this page sits outside the app's layout and router. */}
            <a
              href={localizePath("/events", "es")}
              className="flex min-h-11 items-center border-2 border-neon-lime bg-neon-lime px-6 font-bold text-ink uppercase focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neon-lime"
            >
              {tEs("notFound.findRace")}
            </a>
            <a
              href={localizePath("/events", "en")}
              lang="en"
              className="flex min-h-11 items-center border-2 border-line px-6 font-bold uppercase focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neon-lime"
            >
              {tEn("notFound.findRace")}
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}
