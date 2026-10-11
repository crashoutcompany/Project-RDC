import Link from "next/link";
import type { Fighter } from "@/lib/rdc-stats";
import { HpBar, PixelPortrait } from "./ui";

const percent = (share: number | null) =>
  share === null ? "--" : `${Math.round(share * 100)}%`;

/** Home hero roster: eight pixel-portrait cabinets on the neon grid floor. */
export function RosterHero({ fighters }: { fighters: Fighter[] }) {
  return (
    <ul className="relative mx-auto grid max-w-6xl grid-cols-4 gap-3 px-4 pt-8 pb-10 md:grid-cols-8">
      {fighters.map((fighter, i) => (
        <li
          key={fighter.slug}
          className="animate-rise-in"
          style={{ animationDelay: `${i * 70}ms` }}
        >
          <Link
            href={`/members/${fighter.slug}`}
            className="group border-ac-panel-2 bg-ac-panel/90 hover:border-ac-gold block border-2 p-1.5 transition-colors"
          >
            <PixelPortrait
              src={fighter.art.portrait}
              alt=""
              pixels={24}
              className="aspect-[4/5] transition-transform duration-150 group-hover:-translate-y-1 motion-reduce:transition-none"
            />
            <p className="ac-label text-ac-cream bg-ac-ink mt-1.5 py-1 text-center">
              {fighter.name}
            </p>
            <HpBar
              value={fighter.hp}
              variant="gold"
              className="mt-1.5"
              label={`${fighter.name} win share`}
            />
            <p className="text-ac-gold mt-1 text-center text-lg">
              {percent(fighter.winShare)}
            </p>
          </Link>
        </li>
      ))}
    </ul>
  );
}
