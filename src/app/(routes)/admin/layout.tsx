import { auth } from "@/lib/auth";
import { BreadcrumbNav } from "@/components/breadcrumb-nav";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
// import { VersionSwitcher } from "@/components/version-switcher";
import { AdminProvider } from "@/lib/adminContext";
import { Separator } from "@radix-ui/react-separator";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { AdminSidebar } from "@/components/admin-sidebar";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";

export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense fallback={<Skeleton className="h-72 w-full" />}>
      <Component>{children}</Component>
    </Suspense>
  );
}

const Component = async ({ children }: { children: React.ReactNode }) => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/");

  const cookieStore = await cookies();
  const defaultOpen = cookieStore.get("sidebar:state")?.value === "true";

  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <AdminSidebar />
      <SidebarInset className="m-16">
        <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator
            orientation="vertical"
            className="mr-2 data-[orientation=vertical]:h-4"
          />
          <BreadcrumbNav />
        </header>
        <AdminProvider>{children}</AdminProvider>
      </SidebarInset>
    </SidebarProvider>
  );
};
