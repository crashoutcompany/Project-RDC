import { auth } from "@/lib/auth";
import { BreadcrumbNav } from "@/components/breadcrumb-nav";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { AdminProvider } from "@/lib/adminContext";
import { Separator } from "@radix-ui/react-separator";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AdminSidebar } from "@/components/admin-sidebar";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<Skeleton className="h-72 w-full" />}>
      <AuthenticatedAdminShell>{children}</AuthenticatedAdminShell>
    </Suspense>
  );
}

/** Confirms admin session before rendering admin chrome; pages/actions must still enforce auth. */
async function AuthenticatedAdminShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || session.user.role !== "admin") redirect("/");

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
