import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";

type Tone = "red" | "blue" | "gold";

const TONE_TEXT: Record<Tone, string> = {
  red: "text-vs-red",
  blue: "text-vs-blue",
  gold: "text-vs-gold",
};

/** Two-tone section title: "CHOOSE YOUR" in cream, "ARENA" in the accent. */
export function VsHeading({
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
      className={cn("vs-title text-vs-cream text-5xl md:text-6xl", className)}
      {...props}
    >
      {lead}
      {accent ? (
        <>
          {" "}
          <span className={TONE_TEXT[tone]}>{accent}</span>
        </>
      ) : null}
    </Tag>
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
        "vs-label bg-vs-ink text-vs-gold inline-block px-3 py-1",
        className,
      )}
    >
      {children}
    </span>
  );
}

const HP_FILL: Record<"p1" | "p2" | "gold", string> = {
  p1: "bg-linear-to-r from-vs-gold via-orange-500 to-vs-red",
  p2: "bg-linear-to-l from-vs-gold via-indigo-400 to-vs-blue",
  gold: "bg-vs-gold",
};

/**
 * Skewed fighting-game health bar. `value` is 0..1; `align="right"` drains
 * toward the left like a 2P bar.
 */
export function HpBar({
  value,
  variant = "gold",
  align = "left",
  className,
  label,
}: {
  value: number;
  variant?: keyof typeof HP_FILL;
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
        "border-vs-cream bg-vs-ink/80 relative h-3 -skew-x-[20deg] overflow-hidden border-2",
        className,
      )}
    >
      <div
        className={cn(
          "absolute inset-y-0 transition-[width] duration-700",
          HP_FILL[variant],
          align === "right" ? "right-0" : "left-0",
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

/** A member photo in the signature skewed frame. */
export function SkewPortrait({
  src,
  alt,
  sizes = "200px",
  className,
  imgClassName,
  priority,
}: {
  src: string;
  alt: string;
  sizes?: string;
  className?: string;
  imgClassName?: string;
  priority?: boolean;
}) {
  return (
    <div className={cn("vs-skew bg-vs-panel-2 relative overflow-hidden", className)}>
      <Image
        src={src}
        alt={alt}
        fill
        sizes={sizes}
        priority={priority}
        className={cn("object-cover", imgClassName)}
      />
    </div>
  );
}

/** "ROUND 1 ━━━ 99 ━━━ 8 FIGHTERS" bar from the select screen. */
export function FightBar({
  left = "Round 1",
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
    <div className="flex items-center gap-3">
      <span className="vs-title vs-skew-sm bg-vs-gold text-vs-ink px-4 py-1 text-xl whitespace-nowrap">
        {left}
      </span>
      <HpBar value={leftValue} variant="p1" align="right" className="h-5 flex-1" />
      <span className="vs-title text-vs-cream text-4xl tabular-nums">99</span>
      <HpBar value={rightValue} variant="p2" className="h-5 flex-1" />
      <span className="vs-title vs-skew-sm bg-vs-blue text-vs-cream px-4 py-1 text-xl whitespace-nowrap">
        {right}
      </span>
    </div>
  );
}

export function Breadcrumbs({
  items,
}: {
  items: { label: string; href?: string }[];
}) {
  return (
    <nav aria-label="Breadcrumb" className="vs-label text-vs-cream mb-4">
      <ol className="flex flex-wrap items-center gap-2">
        {items.map((item, i) => (
          <li key={item.label} className="flex items-center gap-2">
            {i > 0 ? <span aria-hidden>›</span> : null}
            {item.href ? (
              <Link href={item.href} className="hover:text-vs-gold">
                {item.label}
              </Link>
            ) : (
              <span className="text-vs-gold" aria-current="page">
                {item.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** Skewed call-to-action button. */
export function VsButton({
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
      className={cn(
        "vs-title vs-skew-sm inline-block px-7 py-2.5 text-xl transition-transform hover:-translate-y-0.5",
        variant === "gold" && "bg-vs-gold text-vs-ink vs-shadow",
        variant === "dark" &&
          "bg-vs-ink text-vs-cream border-vs-cream border-2",
        variant === "red" && "bg-vs-red text-vs-cream",
        className,
      )}
      {...props}
    >
      {children}
    </Link>
  );
}

export const HOW_TO_PLAY = [
  {
    title: "Pick an arena",
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
    tone: "gold" as Tone,
  },
];

const TONE_BORDER: Record<Tone, string> = {
  red: "border-t-vs-red border-r-vs-red",
  blue: "border-t-vs-blue border-r-vs-blue",
  gold: "border-t-vs-gold border-r-vs-gold",
};

export function HowToPlay({ arenaWord = "arena" }: { arenaWord?: string }) {
  return (
    <div className="grid gap-5 md:grid-cols-3">
      {HOW_TO_PLAY.map((step, i) => (
        <div
          key={step.title}
          className={cn(
            "bg-vs-ink border-vs-panel-2 border-2 border-t-4 border-r-4 p-6",
            TONE_BORDER[step.tone],
          )}
        >
          <span className={cn("vs-title text-6xl", TONE_TEXT[step.tone])}>
            {i + 1}
          </span>
          <h3 className="vs-title text-vs-cream mt-2 text-3xl not-italic">
            {step.title.replace("arena", arenaWord)}
          </h3>
          <p className="text-vs-cream/70 mt-1">{step.body}</p>
        </div>
      ))}
    </div>
  );
}

/** Red hazard-striped "Challenger wanted!" call to submit a session. */
export function ChallengerBanner() {
  return (
    <section className="bg-vs-red relative">
      <div className="vs-hazard h-3" />
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-6 px-4 py-12">
        <div>
          <h2 className="vs-title text-vs-cream text-6xl md:text-7xl">
            Challenger
            <br />
            wanted!
          </h2>
          <p className="text-vs-cream mt-3 font-medium">
            Keeping track of stats takes a lot of time. Log in and submit a
            session so every K.O. counts.
          </p>
        </div>
        <VsButton href="/admin/submissions" className="vs-shadow-blue">
          Submit new entry
        </VsButton>
      </div>
      <div className="vs-hazard h-3" />
    </section>
  );
}

export const Dash = () => <span className="text-vs-cream/60">--</span>;
