import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs, Eyebrow, HowToPlay, VsHeading } from "@/components/versus/ui";

export const metadata: Metadata = {
  title: "About | RDC Stats Tracker",
};

export default function AboutPage() {
  return (
    <>
      <section className="vs-dusk relative overflow-hidden [--sun-x:80%]">
        <div className="mx-auto max-w-6xl px-4 pt-8 pb-14">
          <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "About" }]} />
          <Eyebrow>About us</Eyebrow>
          <h1
            data-testid="about-shell-marker"
            className="vs-title text-vs-cream animate-slam-in mt-3 text-7xl md:text-8xl"
          >
            Welcome to <span className="text-vs-gold">Project RDC!</span>
          </h1>
          <p className="text-vs-cream mt-4 max-w-xl text-lg font-semibold">
            We are dedicated to providing a platform for our community to
            connect, compete, and track their gaming progress. We are constantly
            working to improve and expand our features.
          </p>
        </div>
      </section>
      <section className="bg-vs-panel">
        <div className="mx-auto max-w-6xl px-4 py-14">
          <VsHeading lead="How to" accent="play" className="mb-8" />
          <HowToPlay />
        </div>
      </section>
      <section className="bg-vs-ink">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 py-14 md:grid-cols-2">
          <div className="border-vs-panel-2 bg-vs-panel border-4 p-8">
            <h2 className="vs-title text-4xl text-[#6b8cff]">Built with</h2>
            <ul className="mt-4 flex flex-wrap gap-3">
              {["Next.js", "React", "Tailwind CSS", "three.js"].map((tech) => (
                <li
                  key={tech}
                  className="vs-title vs-skew-sm border-vs-cream text-vs-cream border-2 px-4 py-1 text-lg"
                >
                  {tech}
                </li>
              ))}
            </ul>
            <p className="text-vs-cream/70 mt-4">
              Modern web tech for a fast, responsive experience.
            </p>
          </div>
          <div className="border-vs-red bg-vs-panel border-4 p-8">
            <h2 className="vs-title text-4xl text-[#ff5468]">Found a bug?</h2>
            <p className="text-vs-cream/80 mt-3">
              Issues, bugs or ideas for new features? Your feedback helps make
              Project RDC even better.
            </p>
            <Link
              href="https://github.com/crashoutcompany/Project-RDC/issues"
              target="_blank"
              rel="noopener noreferrer"
              className="vs-title vs-skew-sm bg-vs-gold text-vs-ink vs-shadow mt-5 inline-block px-6 py-2 text-xl"
            >
              Report on GitHub
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
