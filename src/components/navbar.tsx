import Link from "next/link";
import { Suspense } from "react";
import { getRscSession } from "@/lib/auth/server";
import { NavLinks, NavLinksFallback, SignOutButton } from "./nav-links";

const navLinksClass =
  "border-ac-panel-2 order-last w-full justify-center overflow-x-auto border-t pt-2 md:order-none md:w-auto md:border-0 md:pt-0";

export const Navbar = () => {
  return (
    <header
      className="border-ac-gold bg-ac-panel/95 sticky top-0 z-40 border-b-2 backdrop-blur"
      data-testid="navbar-shell-marker"
    >
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-4 px-4 py-2 md:h-14 md:py-0">
        <Link
          href="/"
          className="ac-title text-ac-gold relative shrink-0 text-base"
          aria-label="RDC Stats home"
        >
          RDC Stats
          <span
            aria-hidden
            className="ac-tag text-ac-pink absolute -top-3 -right-10 text-lg"
          >
            fan made!
          </span>
        </Link>
        <Suspense fallback={<NavLinksFallback className={navLinksClass} />}>
          <NavLinks className={navLinksClass} />
        </Suspense>
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
  <span className="flex items-center gap-4">
    <span className="ac-label text-ac-cream/60 hidden lg:inline">
      Credit 00
    </span>
    <Link
      href="/signin"
      className="ac-label bg-ac-gold text-ac-ink hover:bg-ac-cream border-ac-ink border-2 px-3 py-2 transition-colors"
    >
      1P Login
    </Link>
  </span>
);

// UI only: the proxy and admin layout still enforce the role.
const isAdmin = (session: Awaited<ReturnType<typeof getRscSession>>) =>
  Boolean(session && "role" in session.user && session.user.role === "admin");

async function SessionControls() {
  const session = await getRscSession();
  if (!session) return <LoginLink />;

  return (
    <>
      {isAdmin(session) && (
        <Link
          href="/admin"
          data-testid="nav-admin-link"
          className="ac-label bg-ac-red text-ac-ink hover:bg-ac-cream border-ac-ink border-2 px-3 py-2 transition-colors"
        >
          Admin
        </Link>
      )}
      <Link
        href="/profile"
        className="ac-label text-ac-cream/70 hover:text-ac-cream hidden px-2 sm:block"
      >
        {session.user?.name?.split(" ")[0] ?? "Profile"}
      </Link>
      <SignOutButton />
    </>
  );
}
