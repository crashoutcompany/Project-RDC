import "server-only";
import { readFile } from "node:fs/promises";
import { extname, join, sep } from "node:path";
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
const MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
};
const REMOTE_MIME = ["image/jpeg", "image/png", "image/gif"];

/** Reads a site asset from `public/` as a data URL. Null for missing files or formats Satori cannot draw (e.g. webp). */
export async function publicImageDataUrl(src: string | null | undefined) {
  if (!src?.startsWith("/")) return null;
  const file = join(PUBLIC_DIR, src);
  const mime = MIME[extname(file).toLowerCase()];
  if (!mime || !file.startsWith(PUBLIC_DIR + sep)) return null;
  try {
    return `data:${mime};base64,${(await readFile(file)).toString("base64")}`;
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
export function ogImageResponse({
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
              fontSize: 26,
              color: palette.gold,
              letterSpacing: 4,
            }}
          >
            {clip(eyebrow.toUpperCase(), 60)}
          </div>
          <div
            style={{
              display: "flex",
              marginTop: 18,
              fontSize: title.length > 24 ? 64 : 84,
              fontWeight: 700,
              lineHeight: 1.05,
              color: palette.cream,
            }}
          >
            {clip(title, 48)}
          </div>
          {subtitle ? (
            <div
              style={{
                display: "flex",
                marginTop: 20,
                fontSize: 32,
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
                      fontSize: 20,
                      color: palette.cream,
                      opacity: 0.8,
                      letterSpacing: 2,
                    }}
                  >
                    {stat.label.toUpperCase()}
                  </div>
                  <div
                    style={{
                      display: "flex",
                      marginTop: 6,
                      fontSize: value.length > 12 ? 28 : 44,
                      fontWeight: 700,
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
    { ...OG_SIZE },
  );
}
