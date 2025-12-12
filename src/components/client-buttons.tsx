"use client";
import { cn } from "@/lib/utils";
import { Button } from "./ui/button";
import { navigationMenuTriggerStyle } from "./ui/navigation-menu";
import { authClient } from "@/lib/auth-client";
import { useRouter } from "next/navigation";
import { ModeToggle } from "./modetoggle";

/**
 * `AuthButton` is a React component that renders a button for authentication actions.
 * It displays "Sign In" if there is no session and "Sign Out" if a session exists.
 * The button's visibility can be controlled based on screen size using the `hideOnSmallScreens` prop.
 *
 * @param {boolean} [hideOnSmallScreens] - If true, the button is hidden on small screens and visible on large screens. If false, the button is visible on small screens and hidden on large screens.
 * @param {boolean} [hasSession] - Server-provided session existence used to avoid hydration mismatches.
 *
 * @returns {JSX.Element} The rendered authentication button component.
 */

export const AuthButton = ({
  hideOnSmallScreens: hide,
  hasSession,
}: {
  hideOnSmallScreens?: boolean | undefined;
  hasSession?: boolean | undefined;
}) => {
  const router = useRouter();

  const handleAuth = async () => {
    if (hasSession) {
      await authClient.signOut();
      router.push("/");
      router.refresh();
    } else {
      router.push("/signin");
    }
  };

  return (
    <Button
      onClick={handleAuth}
      className={cn(
        navigationMenuTriggerStyle(),
        hide ? "hidden sm:block" : "sm:hidden",
      )}
      variant="ghost"
    >
      {hasSession ? "Sign Out" : "Sign In"}
    </Button>
  );
};

export const ToggleThemeButton = () => {
  return (
    <>
      <ModeToggle className="fixed top-3 right-0 hidden max-[400px]:inline-flex" />
    </>
  );
};
