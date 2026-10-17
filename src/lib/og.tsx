import "server-only";
import { readFile } from "node:fs/promises";
import { join, sep } from "node:path";
import { ImageResponse } from "next/og";

export const OG_SIZE = { width: 1200, height: 630 } as const;
export const OG_CONTENT_TYPE = "image/png";

const palette = {
  ink: "#07061a",
  panel: "#110f2e",
  panel2: "#2a2766",
  cream: "#f2efff",
  gold: "#ffd400",
  red: "#ff2d55",
  blue: "#2d9cff",
};

const PUBLIC_DIR = join(process.cwd(), "public");
const FONT_DIR = join(process.cwd(), "src/assets/fonts");

/** Site fonts as TTF (Satori can't read the woff2 that next/font serves). */
const DISPLAY_FONT = "Press Start 2P";
const BODY_FONT = "VT323";

type OgFonts = NonNullable<
  NonNullable<ConstructorParameters<typeof ImageResponse>[1]>["fonts"]
>;
let fonts: Promise<OgFonts | undefined> | undefined;

async function readFonts(): Promise<OgFonts> {
  const [display, body] = await Promise.all([
    readFile(join(FONT_DIR, "PressStart2P-Regular.ttf")),
    readFile(join(FONT_DIR, "VT323-Regular.ttf")),
  ]);
  return [
    { name: DISPLAY_FONT, data: display, weight: 400, style: "normal" },
    { name: BODY_FONT, data: body, weight: 400, style: "normal" },
  ];
}

const loadFonts = () =>
  (fonts ??= readFonts().catch(() => {
    // Render with Satori's default font and retry on the next request.
    fonts = undefined;
    return undefined;
  }));
const REMOTE_MIME = ["image/jpeg", "image/png", "image/gif"];

/**
 * Image type from the file's magic bytes. Extensions can't be trusted here:
 * e.g. public/images/marvel_rvials.jpg is a PNG, and Satori silently drops an
 * image whose data URL declares the wrong type.
 */
function sniffImageType(bytes: Buffer): string | null {
  if (bytes.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47])))
    return "image/png";
  if (bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])))
    return "image/jpeg";
  if (bytes.subarray(0, 4).toString("ascii") === "GIF8") return "image/gif";
  return null;
}

/** Reads a site asset from `public/` as a data URL. Null for missing files or formats Satori cannot draw (e.g. webp). */
export async function publicImageDataUrl(src: string | null | undefined) {
  if (!src?.startsWith("/")) return null;
  const file = join(PUBLIC_DIR, src);
  if (!file.startsWith(PUBLIC_DIR + sep)) return null;
  try {
    const bytes = await readFile(file);
    const mime = sniffImageType(bytes);
    return mime ? `data:${mime};base64,${bytes.toString("base64")}` : null;
  } catch {
    return null;
  }
}

/** Fetches a remote image (e.g. a YouTube thumbnail) as a data URL. Any failure or timeout yields null so the card still renders. */
export async function remoteImageDataUrl(url: string | null | undefined) {
  if (!url) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    const type = res.headers.get("content-type")?.split(";")[0] ?? "";
    if (!res.ok || !REMOTE_MIME.includes(type)) return null;
    const bytes = Buffer.from(await res.arrayBuffer());
    return `data:${type};base64,${bytes.toString("base64")}`;
  } catch {
    return null;
  }
}

export type OgStat = { label: string; value: string | number; color?: string };

const clip = (text: string, max: number) =>
  text.length > max ? `${text.slice(0, max - 1)}…` : text;

/**
 * Shared 1200x630 arcade card for every OG image route. Satori only lays out
 * flexbox, so every element with more than one child sets `display: flex`.
 */
export async function ogImageResponse({
  eyebrow,
  title,
  subtitle,
  art,
  stats = [],
}: {
  eyebrow: string;
  title: string;
  subtitle?: string | null;
  art?: string | null;
  stats?: OgStat[];
}) {
  return new ImageResponse(
    <div
      style={{
        display: "flex",
        width: "100%",
        height: "100%",
        background: `linear-gradient(135deg, ${palette.ink} 0%, ${palette.panel} 55%, ${palette.panel2} 100%)`,
        color: palette.cream,
        border: `12px solid ${palette.gold}`,
        fontFamily: BODY_FONT,
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          flex: 1,
          padding: "56px 60px",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              display: "flex",
              fontFamily: DISPLAY_FONT,
              fontSize: 18,
              color: palette.gold,
              letterSpacing: 2,
              lineHeight: 1.6,
            }}
          >
            {clip(eyebrow.toUpperCase(), 40)}
          </div>
          <div
            style={{
              display: "flex",
              marginTop: 24,
              fontFamily: DISPLAY_FONT,
              // Press Start 2P glyphs are about as wide as the font size.
              fontSize: title.length > 20 ? 36 : title.length > 10 ? 48 : 64,
              lineHeight: 1.25,
              color: palette.cream,
            }}
          >
            {clip(title.toUpperCase(), 48)}
          </div>
          {subtitle ? (
            <div
              style={{
                display: "flex",
                marginTop: 24,
                fontSize: 44,
                color: palette.cream,
                opacity: 0.8,
              }}
            >
              {clip(subtitle, 90)}
            </div>
          ) : null}
        </div>

        {stats.length ? (
          <div style={{ display: "flex" }}>
            {stats.map((stat, i) => {
              const value = String(stat.value);
              return (
                <div
                  key={stat.label}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    flex: 1,
                    marginLeft: i ? 24 : 0,
                    padding: "16px 20px",
                    background: palette.panel,
                    border: `4px solid ${stat.color ?? palette.blue}`,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      fontFamily: DISPLAY_FONT,
                      fontSize: 13,
                      color: palette.cream,
                      opacity: 0.8,
                      letterSpacing: 1,
                    }}
                  >
                    {stat.label.toUpperCase()}
                  </div>
                  <div
                    style={{
                      display: "flex",
                      marginTop: 12,
                      fontFamily: DISPLAY_FONT,
                      fontSize: value.length > 8 ? 20 : 36,
                      color: stat.color ?? palette.blue,
                    }}
                  >
                    {clip(value, 24)}
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}
      </div>

      {art ? (
        <div
          style={{
            display: "flex",
            width: 400,
            borderLeft: `6px solid ${palette.red}`,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- Satori renders this, not the DOM */}
          <img
            src={art}
            alt=""
            width={394}
            height={618}
            style={{ width: 394, height: 618, objectFit: "cover" }}
          />
        </div>
      ) : null}
    </div>,
    { ...OG_SIZE, fonts: await loadFonts() },
  );
}
