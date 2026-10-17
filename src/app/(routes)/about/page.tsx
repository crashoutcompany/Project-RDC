import type { Metadata } from "next";
import Link from "next/link";
import {
  Breadcrumbs,
  Eyebrow,
  Heading,
  HowToPlay,
  Tag,
} from "@/components/arcade/ui";

export const metadata: Metadata = {
  title: "About | RDC Stats Tracker",
};

export default function AboutPage() {
  return (
    <>
      <section className="ac-grid bg-ac-ink">
        <div className="mx-auto max-w-6xl px-4 pt-8 pb-14">
          <Breadcrumbs
            items={[{ label: "Home", href: "/" }, { label: "About" }]}
          />
          <div className="border-ac-gold bg-ac-panel relative border-4 p-8 md:p-10">
            <Tag tone="green" className="absolute -top-6 right-8 text-4xl">
              by fans 4 fans
            </Tag>
            <Eyebrow>About us</Eyebrow>
            <h1
              data-testid="about-shell-marker"
              className="ac-title text-ac-cream animate-slam-in mt-4 text-2xl md:text-4xl"
            >
              Welcome to Project RDC!
            </h1>
            <p className="text-ac-cream/85 mt-5 max-w-xl text-2xl">
              We are dedicated to providing a platform for our community to
              connect, compete, and track their gaming progress. We are
              constantly working to improve and expand our features.
            </p>
          </div>
        </div>
      </section>
      <section className="bg-ac-panel">
        <div className="mx-auto max-w-6xl px-4 py-14">
          <Heading lead="How to play" className="text-ac-gold mb-8" />
          <HowToPlay />
        </div>
      </section>
      <section className="bg-ac-ink">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 py-14 md:grid-cols-2">
          <div className="border-ac-panel-2 bg-ac-panel border-4 p-8">
            <h2 className="ac-title text-ac-pink text-sm">Built with</h2>
            <ul className="mt-4 flex flex-wrap gap-3">
              {["Next.js", "React", "Tailwind CSS", "three.js"].map((tech) => (
                <li
                  key={tech}
                  className="ac-label border-ac-cream text-ac-cream border-2 px-3 py-2"
                >
                  {tech}
                </li>
              ))}
            </ul>
            <p className="text-ac-cream/70 mt-4">
              Modern web tech for a fast, responsive experience.
            </p>
          </div>
          <div className="border-ac-red bg-ac-panel border-4 p-8">
            <h2 className="ac-title text-ac-red text-sm">Found a bug?</h2>
            <p className="text-ac-cream/80 mt-3">
              Issues, bugs or ideas for new features? Your feedback helps make
              Project RDC even better.
            </p>
            <Link
              href="https://github.com/crashoutcompany/Project-RDC/issues"
              target="_blank"
              rel="noopener noreferrer"
              className="ac-label bg-ac-gold text-ac-ink border-ac-ink mt-5 inline-block border-2 px-4 py-3"
            >
              Report on GitHub
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
