/**
 * The arcade cabinet the whole site plays on: a dim pixel room behind, a lit
 * marquee on top, side panels, a CRT bezel around the page and a control deck
 * below. It is fixed, decorative chrome; the page still scrolls normally
 * inside the screen area (see the `--cab-*` vars in globals.css).
 * Pages that need the full viewport (admin) opt out with `data-no-cabinet`.
 */
export function ArcadeCabinet() {
  return (
    <div aria-hidden className="ac-cabinet">
      <div className="ac-room" />
      <div className="ac-fire" />
      <div className="ac-dust">
        {DUST.map(([left, top, delay, size], i) => (
          <span
            key={i}
            style={{
              left: `${left}%`,
              top: `${top}%`,
              animationDelay: `${delay}s`,
              width: size,
              height: size,
            }}
          />
        ))}
      </div>
      <div className="ac-cab-side ac-cab-side-left" />
      <div className="ac-cab-side ac-cab-side-right" />
      <div className="ac-marquee">
        <span className="ac-marquee-sign">RDC Stats</span>
      </div>
      <div className="ac-bezel" />
      <div className="ac-deck">
        <span className="ac-deck-label">1P</span>
        <span className="ac-joystick" />
        <span className="ac-btn bg-ac-red" />
        <span className="ac-btn bg-ac-blue" />
        <span className="ac-btn bg-ac-gold" />
        <span className="ac-coin">
          <span className="ac-coin-slot" />
          <span className="animate-blink">Insert coin</span>
        </span>
        <span className="ac-btn bg-ac-green" />
        <span className="ac-btn bg-ac-pink" />
        <span className="ac-btn bg-ac-cream" />
        <span className="ac-joystick" />
        <span className="ac-deck-label">2P</span>
      </div>
    </div>
  );
}

/** [left %, top %, delay s, size px] for the floating dust motes. */
const DUST: [number, number, number, number][] = [
  [4, 22, 0, 3],
  [9, 64, 2.1, 2],
  [14, 38, 4.3, 3],
  [18, 80, 1.2, 2],
  [23, 12, 3.4, 2],
  [77, 30, 0.6, 3],
  [81, 70, 2.8, 2],
  [86, 15, 4.9, 3],
  [90, 52, 1.7, 2],
  [95, 84, 3.9, 3],
  [6, 48, 5.2, 2],
  [93, 36, 5.6, 2],
];
