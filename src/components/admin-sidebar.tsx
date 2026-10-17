"use client";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { Gamepad, Home, Notebook } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { label: "Dashboard", icon: Home, href: "/admin" },
  { label: "Submissions", icon: Notebook, href: "/admin/submissions" },
  { label: "Update", icon: Gamepad, href: "/admin/update" },
];

/**
 * Sticks below the navbar but stays in the page flow (instead of shadcn's
 * fixed panel) so it ends with the admin content and never covers the footer.
 * The layout hides shadcn's spacer column, which only fixed mode needs.
 */
export function AdminSidebar(props: React.ComponentProps<typeof Sidebar>) {
  const pathname = usePathname();

  return (
    <Sidebar
      {...props}
      className="sticky top-[calc(var(--crt-bezel)+var(--nav-h))] bottom-auto h-[calc(100svh-2*var(--crt-bezel)-var(--nav-h))] group-data-[collapsible=offcanvas]:hidden"
    >
      <SidebarHeader>
        <span className="ac-label text-ac-gold px-2 pt-2">Admin panel</span>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="ac-label text-muted-foreground text-[0.55rem]">
            Navigation
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.label}>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname === item.href}
                    className="data-[active=true]:bg-primary data-[active=true]:text-primary-foreground text-lg"
                  >
                    <Link href={item.href}>
                      <item.icon />
                      {item.label}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  );
}
