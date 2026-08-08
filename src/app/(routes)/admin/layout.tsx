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

/**
 * Admin layout: auth gate is deferred so child page shells can prerender.
 * Sidebar open state uses a static default (cookie sync is not needed for shell).
 */
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider defaultOpen>
      <Suspense fallback={null}>
        <AuthGate />
      </Suspense>
      <Suspense fallback={<Skeleton className="h-screen w-64" />}>
        <AdminSidebar />
      </Suspense>
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

/**
 * Request-time auth check. Suspends during prerender so redirect only runs on request.
 */
async function AuthGate() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/");
  return null;
}
