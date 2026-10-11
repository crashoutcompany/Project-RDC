import Link from "next/link";

export const Footer = () => {
  return (
    <footer className="border-vs-panel-2 bg-vs-ink border-t-2">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-8">
        <Link href="/" className="vs-title text-vs-gold text-2xl">
          RDC <span className="text-vs-cream">Stats</span>
        </Link>
        <p className="text-vs-cream/70 text-sm">
          A fan-made stat tracker. Found a bug?{" "}
          <Link
            href="https://github.com/crashoutcompany/Project-RDC/issues"
            target="_blank"
            rel="noopener noreferrer"
            className="text-vs-cream underline underline-offset-2"
          >
            Report it on GitHub
          </Link>
          .
        </p>
        <span className="vs-label text-vs-cream/60">K.O.</span>
      </div>
    </footer>
  );
};
