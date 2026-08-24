import { Link } from "@/components/i18n/link";
import { NeonsMark } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { getT } from "@/lib/i18n/server";

export default async function NotFound() {
  const t = await getT();

  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-4 py-16 text-center">
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[linear-gradient(150deg,#050505_0%,#050505_58%,#0d2207_84%,#2c6600_122%)]"
      />
      <div aria-hidden="true" className="bg-road-lines absolute inset-0" />

      <div className="relative">
        <NeonsMark size={64} className="mx-auto" />
        <p className="mt-9 font-display text-[6rem] leading-none font-black tracking-[-0.05em] text-neon-yellow sm:text-[9rem]">
          404
        </p>
        <h1 className="mt-4 font-display text-3xl font-black uppercase sm:text-4xl">
          {t("notFound.title")}
        </h1>
        <p className="mx-auto mt-5 max-w-md text-[15px] leading-relaxed text-fg-dim">
          {t("notFound.body")}
        </p>
        <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
          <Button href="/events" size="lg">
            {t("notFound.findRace")}
          </Button>
          <Button href="/" variant="outline" size="lg">
            {t("notFound.backHome")}
          </Button>
        </div>
        <p className="mt-8 font-mono text-[11px] tracking-[0.16em] text-fg-faint uppercase">
          {t("notFound.orTry")}{" "}
          <Link href="/faq" className="text-neon-lime hover:underline">
            {t("notFound.faq")}
          </Link>
        </p>
      </div>
    </div>
  );
}
