import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";

type Tone = "red" | "blue" | "gold" | "green" | "pink";

export const TONE_TEXT: Record<Tone, string> = {
  red: "text-ac-red",
  blue: "text-ac-blue",
  gold: "text-ac-gold",
  green: "text-ac-green",
  pink: "text-ac-pink",
};

/** Pixel section title. `accent` is drawn in a neon tone. */
export function Heading({
  lead,
  accent,
  tone = "gold",
  as: Tag = "h2",
  className,
  ...props
}: {
  lead: string;
  accent?: string;
  tone?: Tone;
  as?: "h1" | "h2" | "h3";
  className?: string;
} & React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <Tag
      className={cn("ac-title text-ac-cream text-2xl md:text-3xl", className)}
      {...props}
    >
      {lead}
      {accent ? (
        <>
          {" "}
          <span className={cn("ac-glow", TONE_TEXT[tone])}>{accent}</span>
        </>
      ) : null}
    </Tag>
  );
}

/** Spray-painted graffiti tag, e.g. "pick ur battle". */
export function Tag({
  children,
  tone = "green",
  className,
}: {
  children: React.ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "ac-tag text-3xl drop-shadow-[2px_2px_0_#07061a]",
        TONE_TEXT[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Eyebrow({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "ac-label bg-ac-ink text-ac-gold border-ac-panel-2 inline-block border px-3 py-1.5",
        className,
      )}
    >
      {children}
    </span>
  );
}

const BAR_FILL: Record<"p1" | "p2" | "gold", string> = {
  p1: "var(--ac-red)",
  p2: "var(--ac-blue)",
  gold: "var(--ac-gold)",
};

/**
 * Segmented arcade health bar. `value` is 0..1; `align="right"` fills from
 * the right like a 2P bar.
 */
export function HpBar({
  value,
  variant = "gold",
  align = "left",
  className,
  label,
}: {
  value: number;
  variant?: keyof typeof BAR_FILL;
  align?: "left" | "right";
  className?: string;
  label?: string;
}) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
      className={cn(
        "border-ac-cream bg-ac-ink relative h-3 overflow-hidden border-2",
        className,
      )}
    >
      <div
        className="absolute inset-y-0 [mask-image:repeating-linear-gradient(90deg,#000_0_6px,transparent_6px_8px)] transition-[width] duration-700"
        style={{
          width: `${pct}%`,
          background: BAR_FILL[variant],
          [align === "right" ? "right" : "left"]: 0,
        }}
      />
    </div>
  );
}

/**
 * Member photo rendered from a tiny source and scaled up with nearest-neighbour
 * sampling, so it reads as pixel art.
 */
export function PixelPortrait({
  src,
  alt,
  className,
  imgClassName,
  priority,
  pixels = 48,
}: {
  src: string;
  alt: string;
  /** Unused; kept so shared markup can pass a `sizes` hint. */
  sizes?: string;
  className?: string;
  imgClassName?: string;
  priority?: boolean;
  /** Source width in CSS px before upscaling. Smaller = chunkier. */
  pixels?: number;
}) {
  return (
    <div className={cn("bg-ac-panel-2 relative overflow-hidden", className)}>
      <Image
        src={src}
        alt={alt}
        fill
        sizes={`${pixels}px`}
        priority={priority}
        className={cn("ac-pixel object-cover", imgClassName)}
      />
    </div>
  );
}

/** Segmented 1P / timer / 2P bar across the top of a match. */
export function FightBar({
  left = "1P",
  right,
  leftValue = 1,
  rightValue = 1,
}: {
  left?: string;
  right: string;
  leftValue?: number;
  rightValue?: number;
}) {
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
      <div>
        <HpBar value={leftValue} variant="p1" align="right" className="h-5" />
        <p className="ac-label text-ac-red mt-1">1P {left}</p>
      </div>
      <span className="ac-title border-ac-gold text-ac-gold border-2 px-3 py-2 text-xl">
        99
      </span>
      <div>
        <HpBar value={rightValue} variant="p2" className="h-5" />
        <p className="ac-label text-ac-blue mt-1 text-right">{right} 2P</p>
      </div>
    </div>
  );
}

export function Breadcrumbs({
  items,
}: {
  items: { label: string; href?: string }[];
}) {
  return (
    <nav aria-label="Breadcrumb" className="ac-label text-ac-cream/80 mb-4">
      <ol className="flex flex-wrap items-center gap-2">
        {items.map((item, i) => (
          <li key={item.label} className="flex items-center gap-2">
            {i > 0 ? <span aria-hidden>›</span> : null}
            {item.href ? (
              <Link href={item.href} className="hover:text-ac-gold">
                {item.label}
              </Link>
            ) : (
              <span className="text-ac-cream" aria-current="page">
                {item.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export const arcadeButtonClass = (variant: "gold" | "dark" | "red" = "gold") =>
  cn(
    "ac-title inline-block border-2 px-5 py-3 text-xs transition-transform hover:-translate-y-0.5 active:translate-y-0.5",
    variant === "gold" && "bg-ac-gold text-ac-ink border-ac-ink ac-shadow",
    variant === "dark" && "bg-ac-ink text-ac-cream border-ac-cream",
    variant === "red" && "bg-ac-red text-ac-ink border-ac-ink ac-shadow-gold",
  );

/** Chunky arcade button with a hard offset shadow. */
export function ArcadeButton({
  href,
  children,
  variant = "gold",
  className,
  ...props
}: {
  href: string;
  children: React.ReactNode;
  variant?: "gold" | "dark" | "red";
  className?: string;
} & Omit<React.ComponentProps<typeof Link>, "href" | "className">) {
  return (
    <Link
      href={href}
      className={cn(arcadeButtonClass(variant), className)}
      {...props}
    >
      {children}
    </Link>
  );
}

export const HOW_TO_PLAY = [
  {
    title: "Pick a stage",
    body: "Session timelines, MVPs and stats for every game.",
    tone: "blue" as Tone,
  },
  {
    title: "Pick a fighter",
    body: "Win summaries, records and head-to-head match-ups.",
    tone: "red" as Tone,
  },
  {
    title: "Submit a session",
    body: "Log in and add the results of a session you watched.",
    tone: "green" as Tone,
  },
];

const TONE_BORDER: Record<Tone, string> = {
  red: "border-t-ac-red border-r-ac-red",
  blue: "border-t-ac-blue border-r-ac-blue",
  gold: "border-t-ac-gold border-r-ac-gold",
  green: "border-t-ac-green border-r-ac-green",
  pink: "border-t-ac-pink border-r-ac-pink",
};

export function HowToPlay() {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {HOW_TO_PLAY.map((step, i) => (
        <div
          key={step.title}
          className={cn(
            "bg-ac-panel border-ac-panel-2 border-2 p-5",
            TONE_BORDER[step.tone],
          )}
        >
          <span
            className={cn("ac-title ac-glow text-2xl", TONE_TEXT[step.tone])}
          >
            {i + 1}
          </span>
          <h3 className="ac-title text-ac-cream mt-3 text-xs">{step.title}</h3>
          <p className="text-ac-cream/75 mt-2">{step.body}</p>
        </div>
      ))}
    </div>
  );
}

/** "CONTINUE? 9" call to log in and submit a session. */
export function ChallengerBanner() {
  return (
    <section className="ac-grid bg-ac-ink">
      <div className="mx-auto max-w-6xl px-4 py-14">
        <div className="border-ac-gold bg-ac-panel relative flex flex-wrap items-center justify-between gap-6 border-4 p-8">
          <Tag tone="green" className="absolute -top-6 right-6">
            help us out!!
          </Tag>
          <div>
            <h2 className="ac-title text-ac-cream text-2xl md:text-3xl">
              Continue?{" "}
              <span className="text-ac-red animate-blink inline-block">9</span>
            </h2>
            <p className="text-ac-cream/80 mt-3 max-w-md">
              Keeping track of stats takes a lot of time. Log in and submit a
              session to keep the record going.
            </p>
          </div>
          <ArcadeButton href="/admin/submissions">Submit entry</ArcadeButton>
        </div>
      </div>
    </section>
  );
}
