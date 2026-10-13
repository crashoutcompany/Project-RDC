import type { Metadata } from "next";
import Link from "next/link";
import { H1 } from "@/components/headings";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Access denied",
  robots: { index: false },
};

export default function ForbiddenPage() {
  return (
    <div className="container mx-auto flex flex-col items-center py-16 text-center">
      <H1 className="mb-4" data-testid="forbidden-shell-marker">
        Access denied
      </H1>
      <p className="text-muted-foreground mb-8 max-w-md">
        You&apos;re signed in, but your account doesn&apos;t have access to
        this page. If you think that&apos;s a mistake, ask an RDC admin to
        update your role.
      </p>
      <Button asChild>
        <Link href="/">Back to home</Link>
      </Button>
    </div>
  );
}
