"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/", label: "Home", testId: "nav-home-link" },
  { href: "/members", label: "Members", testId: "nav-members-link" },
  { href: "/games", label: "Games", testId: "nav-games-link" },
  { href: "/about", label: "About", testId: "nav-about-link" },
];

export function NavLinks({ className }: { className?: string }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className={cn("flex items-center gap-1", className)}>
      {LINKS.map(({ href, label, testId }) => {
        const active =
          href === "/" ? pathname === "/" : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            data-testid={testId}
            aria-current={active ? "page" : undefined}
            className={cn(
              "vs-title vs-skew-sm px-4 py-1.5 text-lg tracking-wide transition-colors",
              active
                ? "bg-vs-gold text-vs-ink"
                : "text-vs-cream hover:bg-vs-panel-2",
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
    <button
      type="button"
      onClick={async () => {
        await authClient.signOut();
        router.push("/");
        router.refresh();
      }}
      className="vs-title text-vs-cream/70 hover:text-vs-cream cursor-pointer px-2 text-lg"
    >
      Log out
    </button>
  );
}
