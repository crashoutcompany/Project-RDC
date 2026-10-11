import Link from "next/link";
import { Suspense } from "react";
import { getRscSession } from "@/lib/auth/server";
import { NavLinks, SignOutButton } from "./nav-links";

export const Navbar = () => {
  return (
    <header
      className="border-vs-gold bg-vs-ink/95 sticky top-0 z-40 border-b-2 backdrop-blur"
      data-testid="navbar-shell-marker"
    >
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-4 px-4 py-2 md:h-14 md:py-0">
        <Link
          href="/"
          className="vs-title text-vs-gold shrink-0 text-3xl"
          aria-label="RDC Stats home"
        >
          RDC <span className="text-vs-cream">Stats</span>
        </Link>
        <NavLinks className="border-vs-panel-2 order-last w-full justify-center overflow-x-auto border-t pt-2 md:order-none md:w-auto md:border-0 md:pt-0" />
        <div className="flex shrink-0 items-center gap-2">
          <Suspense fallback={<LoginLink />}>
            <SessionControls />
          </Suspense>
        </div>
      </div>
    </header>
  );
};

const LoginLink = () => (
  <Link
    href="/signin"
    className="vs-title vs-skew-sm bg-vs-gold text-vs-ink hover:bg-vs-cream px-5 py-1.5 text-lg transition-colors"
  >
    Log in
  </Link>
);

async function SessionControls() {
  const session = await getRscSession();
  if (!session) return <LoginLink />;

  return (
    <>
      <Link
        href="/admin"
        data-testid="nav-admin-link"
        className="vs-title vs-skew-sm bg-vs-red text-vs-cream hover:bg-vs-cream hover:text-vs-ink px-4 py-1.5 text-lg transition-colors"
      >
        Admin
      </Link>
      <Link
        href="/profile"
        className="vs-title text-vs-cream/70 hover:text-vs-cream hidden px-2 text-lg sm:block"
      >
        {session.user?.name?.split(" ")[0] ?? "Profile"}
      </Link>
      <SignOutButton />
    </>
  );
}
