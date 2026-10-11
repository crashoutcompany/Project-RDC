"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth/client";
import {
  SIGN_IN_PATH,
  type SocialProvider,
} from "@/lib/auth/config";

const PROVIDER_LABELS: Record<SocialProvider, string> = {
  github: "GitHub",
  google: "Google",
};

export function SignInButtons({
  providers,
}: {
  providers: SocialProvider[];
}) {
  const [pendingProvider, setPendingProvider] =
    useState<SocialProvider | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function signIn(provider: SocialProvider) {
    setPendingProvider(provider);
    setErrorMessage(null);

    const result = await authClient.signIn.social({
      provider,
      callbackURL: "/",
      errorCallbackURL: SIGN_IN_PATH,
    });

    if (result.error) {
      setErrorMessage(result.error.message || "Unable to sign in.");
      setPendingProvider(null);
    }
  }

  if (providers.length === 0) {
    return (
      <p role="status" className="text-muted-foreground text-sm">
        No social sign-in providers are currently configured.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {providers.map((provider, i) => (
        <Button
          key={provider}
          type="button"
          className={
            i === 0
              ? "font-display bg-ac-gold text-ac-ink hover:bg-ac-gold/90 h-14 cursor-pointer text-xs uppercase shadow-[4px_4px_0_var(--ac-red)]"
              : "font-display bg-ac-cream text-ac-ink hover:bg-ac-cream/90 h-14 cursor-pointer text-xs uppercase shadow-[4px_4px_0_var(--ac-blue)]"
          }
          disabled={pendingProvider !== null}
          onClick={() => void signIn(provider)}
        >
          {pendingProvider === provider
            ? "Redirecting…"
            : `▶ Continue with ${PROVIDER_LABELS[provider]}`}
        </Button>
      ))}
      {errorMessage ? (
        <p role="alert" className="text-destructive text-sm">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}
