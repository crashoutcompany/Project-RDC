import type { Metadata } from "next";
import { ArcadeButton, Tag } from "@/components/arcade/ui";

export const metadata: Metadata = {
  title: "Access denied",
  robots: { index: false },
};

export default function ForbiddenPage() {
  return (
    <section className="ac-grid bg-ac-ink flex min-h-[70vh] items-center justify-center px-4 py-16">
      <div className="border-ac-red bg-ac-panel relative w-full max-w-xl border-4 p-8 text-center sm:p-10">
        <Tag tone="pink" className="absolute -top-7 -left-4 text-4xl">
          no entry!
        </Tag>
        <p className="ac-label text-ac-red mt-2">Error 403</p>
        <h1
          data-testid="forbidden-shell-marker"
          className="ac-title ac-glow text-ac-red animate-slam-in mt-3 text-2xl md:text-3xl"
        >
          Access denied
        </h1>
        <p className="text-ac-cream/80 mx-auto mt-4 max-w-md text-lg">
          You&apos;re signed in, but your account doesn&apos;t have access to
          this page. If you think that&apos;s a mistake, ask an RDC admin to
          update your role.
        </p>
        <div className="mt-8 flex justify-center">
          <ArcadeButton href="/">◀ Back to home</ArcadeButton>
        </div>
      </div>
    </section>
  );
}
