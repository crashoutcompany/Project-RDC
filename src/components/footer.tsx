import Link from "next/link";

export const Footer = () => {
  return (
    <footer
      data-testid="site-footer"
      className="border-ac-panel-2 bg-ac-panel border-t-2"
    >
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-8">
        <Link href="/" className="ac-title text-ac-gold text-xs">
          RDC Stats
        </Link>
        <p className="text-ac-cream/70 text-lg">
          A fan-made stat tracker. Found a bug?{" "}
          <Link
            href="https://github.com/crashoutcompany/Project-RDC/issues"
            target="_blank"
            rel="noopener noreferrer"
            className="text-ac-cream underline underline-offset-2"
          >
            Report it on GitHub
          </Link>
          .
        </p>
        <span className="ac-label text-ac-cream animate-blink">
          Insert coin
        </span>
      </div>
    </footer>
  );
};
