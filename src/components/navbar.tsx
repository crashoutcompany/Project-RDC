import {
  NavigationMenu,
  NavigationMenuList,
  NavigationMenuTrigger,
  NavigationMenuItem,
  NavigationMenuContent,
  NavigationMenuLink,
  navigationMenuTriggerStyle,
} from "@/components/ui/navigation-menu";
import { ModeToggle } from "./modetoggle";
import { FillText } from "./fill-text";
import Link from "next/link";
import React, { Suspense } from "react";
import { cn } from "@/lib/utils";
import Image from "next/image";
import Icon from "@/app/favicon.ico";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./ui/tooltip";
import { HamburgerMenuIcon } from "@radix-ui/react-icons";
import { getGamesNav } from "@/lib/constants";
import { getMembersNav } from "prisma/lib/members";
import { auth } from "@/lib/auth";
import { AuthButton, ToggleThemeButton } from "./client-buttons";
import { Skeleton } from "./ui/skeleton";
import { headers } from "next/headers";

/**
 * Site navbar. Static chrome commits in the shell; games/members/auth stream.
 */
export const Navbar = async () => {
  return (
    <NavigationMenu
      className="sticky top-0 z-20 mx-auto w-screen rounded-lg bg-inherit px-2"
      data-testid="navbar-shell-marker"
    >
      <NavigationMenuList>
        <NavigationMenuItem className={navigationMenuTriggerStyle()}>
          <Link href="/" data-testid="nav-home-link">
            <FillText text="Home" className="text-chart-4" />
          </Link>
        </NavigationMenuItem>
        <NavigationMenuItem className={navigationMenuTriggerStyle()}>
          <Link href="/about" data-testid="nav-about-link">
            <FillText text="About" className="text-chart-4" />
          </Link>
        </NavigationMenuItem>
        <NavigationMenuItem>
          <NavigationMenuTrigger data-testid="nav-games-trigger">
            <FillText className="text-chart-4" text="Games" />
          </NavigationMenuTrigger>
          <NavigationMenuContent>
            <Suspense
              fallback={
                <ul className="grid gap-3 p-4 md:w-[400px] lg:w-[500px]">
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-16 w-full" />
                </ul>
              }
            >
              <GamesNavItems />
            </Suspense>
          </NavigationMenuContent>
        </NavigationMenuItem>
        <NavigationMenuItem>
          <NavigationMenuTrigger data-testid="nav-members-trigger">
            <FillText className="text-chart-4" text="Members" />
          </NavigationMenuTrigger>
          <NavigationMenuContent>
            <Suspense
              fallback={
                <ul className="grid gap-3 p-4 md:w-[400px] lg:w-[500px]">
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-16 w-full" />
                </ul>
              }
            >
              <MembersNavItems />
            </Suspense>
          </NavigationMenuContent>
        </NavigationMenuItem>
        <Suspense fallback={<Skeleton className="h-full w-9" />}>
          <AdminSection />
        </Suspense>

        <NavigationMenuItem className="md:hidden">
          <NavigationMenuTrigger>
            <HamburgerMenuIcon />
          </NavigationMenuTrigger>
          <NavigationMenuContent>
            <ul>
              <ListItem href="/about">About</ListItem>
              <Suspense fallback={<Skeleton className="h-full w-9" />}>
                <AuthSection />
              </Suspense>
              <ToggleThemeButton />
            </ul>
          </NavigationMenuContent>
        </NavigationMenuItem>

        <Suspense fallback={<Skeleton className="size-10 rounded-full" />}>
          <ProfileSection />
        </Suspense>
        <NavigationMenuItem className="hidden sm:block">
          <ModeToggle className="" />
        </NavigationMenuItem>
      </NavigationMenuList>
    </NavigationMenu>
  );
};

/**
 * Cached games dropdown links.
 */
async function GamesNavItems() {
  "use cache";
  const games = await getGamesNav();
  return (
    <ul className="grid gap-3 p-4 md:w-[400px] lg:w-[500px] lg:grid-cols-[.75fr_1fr]">
      {games.map((game) => (
        <ListItem key={game.url} href={game.url} title={game.name}>
          {game.desc}
        </ListItem>
      ))}
    </ul>
  );
}

/**
 * Cached members dropdown links.
 */
async function MembersNavItems() {
  "use cache";
  const members = await getMembersNav();
  return (
    <ul className="grid gap-3 p-4 md:w-[400px] lg:w-[500px] lg:grid-cols-[.75fr_1fr]">
      {members.map((rdc) => (
        <div key={rdc.url} className="flex gap-5">
          <Avatar>
            <Image
              alt={rdc.alt}
              src={rdc.src || Icon}
              height={60}
              width={60}
            />
          </Avatar>
          <ListItem
            className="shrink-0"
            href={rdc.url}
            title={rdc.navName}
          />
        </div>
      ))}
      <ListItem
        className="col-span-full"
        href="/members"
        title="Browse all members"
      />
    </ul>
  );
}

const ListItem = React.forwardRef<
  React.ComponentRef<"a">,
  React.ComponentPropsWithoutRef<"a">
>(({ className, title, children, href = "", ...props }, ref) => {
  return (
    <li className="grow">
      <NavigationMenuLink asChild>
        <Link
          prefetch={true}
          href={href}
          ref={ref}
          className={cn(
            "hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground block space-y-1 rounded-md p-3 leading-none no-underline outline-hidden transition-colors select-none",
            className,
          )}
          {...props}
        >
          <div className="text-sm leading-none font-medium">{title}</div>
          <p className="text-muted-foreground line-clamp-2 text-sm leading-snug">
            {children}
          </p>
        </Link>
      </NavigationMenuLink>
    </li>
  );
});
ListItem.displayName = "ListItem";

/**
 * Mobile auth actions (session-gated).
 */
const AuthSection = async () => {
  const session = await auth.api.getSession({ headers: await headers() });
  return (
    <>
      {session && <ListItem href="/admin">Admin</ListItem>}
      <AuthButton hideOnSmallScreens={false} hasSession={Boolean(session)} />
    </>
  );
};

/**
 * Desktop profile avatar (session-gated).
 */
const ProfileSection = async () => {
  const session = await auth.api.getSession({ headers: await headers() });
  return (
    <>
      <NavigationMenuItem className="hidden sm:block">
        {session && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <Avatar asChild>
                  <Link href="/profile">
                    <AvatarImage src={session.user?.image || Icon.src} />
                    <AvatarFallback>Icon</AvatarFallback>
                  </Link>
                </Avatar>
              </TooltipTrigger>
              <TooltipContent>{session.user?.name}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </NavigationMenuItem>
      <AuthButton hideOnSmallScreens hasSession={Boolean(session)} />
    </>
  );
};

/**
 * Always-visible Admin nav link (auth enforced by admin layout).
 */
const AdminSection = async () => {
  return (
    <NavigationMenuItem className="hidden md:block">
      <Link
        className={navigationMenuTriggerStyle()}
        href="/admin"
        data-testid="nav-admin-link"
      >
        <FillText className="text-chart-4" text="Admin" />
      </Link>
    </NavigationMenuItem>
  );
};
