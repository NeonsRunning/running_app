"use client";

import "./globals.css";

/**
 * The last-resort error page, for when the root layout itself fails —
 * `app/[lang]/error.tsx` handles everything below it. Nothing from the
 * layout is available here (no dictionary, no fonts, no locale from the
 * URL), so it renders its own <html> and <body> and says the one thing it
 * has to in both of the site's languages.
 *
 * Inline text, not dictionary keys: the dictionaries are loaded by the very
 * layout that failed.
 */
export default function GlobalError({
  error,
  retry,
}: {
  error: unknown;
  /** Re-fetches and re-renders the page. */
  retry: () => void;
}) {
  const digest =
    typeof error === "object" && error !== null && "digest" in error
      ? String((error as { digest?: unknown }).digest ?? "")
      : "";

  return (
    <html lang="es">
      <body className="bg-ink text-fg">
        <title>NEONS RUNNING</title>
        <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-16 text-center">
          <div
            aria-hidden="true"
            className="flex h-16 w-16 items-center justify-center border-2 border-danger text-3xl text-danger"
          >
            !
          </div>
          <h1 className="mt-8 text-4xl font-black uppercase sm:text-5xl">Algo falló</h1>
          <p className="mt-5 max-w-md text-[15px] leading-relaxed text-fg-dim">
            No pudimos cargar la página. Ninguna inscripción se guarda hasta que el
            pago termina, así que no se perdió nada.
          </p>
          <p lang="en" className="mt-3 max-w-md text-[15px] leading-relaxed text-fg-dim">
            Something went wrong loading this page. Registrations are only saved once
            payment completes, so nothing was lost.
          </p>
          {digest ? (
            <p className="mt-4 font-mono text-[11px] tracking-[0.14em] text-fg-faint uppercase">
              Ref. {digest}
            </p>
          ) : null}
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <button
              type="button"
              onClick={() => retry()}
              className="min-h-11 border-2 border-neon-lime bg-neon-lime px-6 font-bold text-ink uppercase focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neon-lime"
            >
              Reintentar · Try again
            </button>
            {/* A full page load: the client router lives in the layout that failed. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a
              href="/"
              className="flex min-h-11 items-center border-2 border-line px-6 font-bold uppercase focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neon-lime"
            >
              Inicio · Home
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}
