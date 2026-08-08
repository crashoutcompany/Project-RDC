"use client";
import { cn } from "@/lib/utils";
import { Button } from "./ui/button";
import { navigationMenuTriggerStyle } from "./ui/navigation-menu";
import { authClient } from "@/lib/auth-client";
import { useRouter } from "next/navigation";
import { ModeToggle } from "./modetoggle";

/** `hasSession` is server-provided to avoid auth UI hydration mismatch. */
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
