"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/", label: "Home", testId: "nav-home-link" },
  { href: "/members", label: "Members", testId: "nav-members-link" },
  { href: "/games", label: "Games", testId: "nav-games-link" },
  { href: "/about", label: "About", testId: "nav-about-link" },
];

/**
 * Reads the pathname for the active link. Must render inside a Suspense
 * boundary: usePathname() during static prerender otherwise fails the build.
 */
export function NavLinks({ className }: { className?: string }) {
  const pathname = usePathname();
  return <NavLinkList className={className} pathname={pathname} />;
}

/** Same links with no active state; used as the Suspense fallback. */
export function NavLinksFallback({ className }: { className?: string }) {
  return <NavLinkList className={className} pathname={null} />;
}

function NavLinkList({
  className,
  pathname,
}: {
  className?: string;
  pathname: string | null;
}) {
  return (
    <nav aria-label="Main" className={cn("flex items-center gap-1", className)}>
      {LINKS.map(({ href, label, testId }) => {
        const active =
          pathname !== null &&
          (href === "/" ? pathname === "/" : pathname.startsWith(href));
        return (
          <Link
            key={href}
            href={href}
            data-testid={testId}
            aria-current={active ? "page" : undefined}
            className={cn(
              "ac-label border-2 px-3 py-2 transition-colors",
              active
                ? "bg-ac-red text-ac-ink border-ac-red"
                : "text-ac-cream border-ac-panel-2 hover:border-ac-cream",
            )}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

export function SignOutButton() {
  const router = useRouter();
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={async () => {
        await authClient.signOut();
        router.push("/");
        router.refresh();
      }}
      className="text-foreground/70 hover:text-foreground hover:bg-transparent"
    >
      Log out
    </Button>
  );
}
