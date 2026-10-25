import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

/**
 * The 1200×630 card link previews show (WhatsApp, Facebook, X, iMessage).
 * Drawn by `next/og`, which takes inline styles and flexbox only — none of the
 * site's Tailwind classes apply here, so the brand colours are written out.
 */
export const SHARE_CARD_SIZE = { width: 1200, height: 630 };

const INK = "#050505";
const YELLOW = "#fff200";
const LIME = "#9cff00";
const MUTED = "#c9c9c9";

const mark = readFile(join(process.cwd(), "public/brand/neons-mark.png")).then(
  (png) => `data:image/png;base64,${png.toString("base64")}`,
);

export async function shareCard(
  card: { eyebrow: string; title: string; lines: string[] },
  init?: ResponseInit,
): Promise<ImageResponse> {
  const logo = await mark;
  // Long race names shrink rather than spill off the card.
  const titleSize = card.title.length > 40 ? 64 : card.title.length > 24 ? 80 : 96;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 64,
          background: `linear-gradient(115deg, ${INK} 0%, ${INK} 52%, #0d2207 74%, #245200 92%, #4f9c00 112%)`,
          color: "#ffffff",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- next/og renders plain <img> */}
          <img src={logo} width={161} height={60} alt="" />
          <div
            style={{
              fontSize: 26,
              letterSpacing: 6,
              textTransform: "uppercase",
              color: LIME,
            }}
          >
            {card.eyebrow}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            fontSize: titleSize,
            fontWeight: 900,
            lineHeight: 0.95,
            textTransform: "uppercase",
            letterSpacing: -2,
          }}
        >
          {card.title}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {card.lines.map((line, i) => (
            <div
              key={line}
              style={{ fontSize: 34, color: i === 0 ? YELLOW : MUTED }}
            >
              {line}
            </div>
          ))}
        </div>
      </div>
    ),
    { ...SHARE_CARD_SIZE, ...init },
  );
}
