import { BreadcrumbNav } from "@/components/breadcrumb-nav";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { AdminProvider } from "@/lib/adminContext";
import { Separator } from "@radix-ui/react-separator";
import { getRscSession } from "@/lib/auth/server";
import { redirect } from "next/navigation";
import { AdminSidebar } from "@/components/admin-sidebar";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { H1 } from "@/components/headings";

/**
 * Shell marker sits outside the session await so instant() can commit chrome
 * while AuthenticatedAdminShell streams. Pages/actions must still enforce auth.
 */
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <H1 data-testid="admin-shell-marker" className="sr-only">
        Admin
      </H1>
      <Suspense fallback={<Skeleton className="h-72 w-full" />}>
        <AuthenticatedAdminShell>{children}</AuthenticatedAdminShell>
      </Suspense>
    </div>
  );
}

/** Confirms admin session before rendering admin chrome; pages/actions must still enforce auth. */
async function AuthenticatedAdminShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getRscSession();
  const role =
    session && "role" in session.user ? session.user.role : undefined;
  if (!session || role !== "admin") redirect("/");

  return (
    <SidebarProvider defaultOpen>
      <AdminSidebar />
      <SidebarInset className="m-16">
        <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator
            orientation="vertical"
            className="mr-2 data-[orientation=vertical]:h-4"
          />
          <Suspense fallback={<Skeleton className="h-4 w-40" />}>
            <BreadcrumbNav />
          </Suspense>
        </header>
        <AdminProvider>{children}</AdminProvider>
      </SidebarInset>
    </SidebarProvider>
  );
}
