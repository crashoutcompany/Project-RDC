"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth/client";

export function EmailOtpForm({ callbackURL }: { callbackURL?: string }) {
  const router = useRouter();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [pending, setPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function sendCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setErrorMessage(null);

    const result = await authClient.emailOtp.sendVerificationOtp({
      email: email.trim(),
      type: "sign-in",
    });

    setPending(false);
    if (result.error) {
      setErrorMessage(
        result.error.message || "Unable to send a code. Try again in a minute.",
      );
      return;
    }
    setOtp("");
    setStep("code");
  }

  async function verifyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setErrorMessage(null);

    const result = await authClient.signIn.emailOtp({
      email: email.trim(),
      otp: otp.trim(),
    });

    if (result.error) {
      setErrorMessage(
        result.error.message || "Unable to sign in. Check the code and try again.",
      );
      setPending(false);
      return;
    }
    router.replace(callbackURL ?? "/");
    router.refresh();
  }

  function changeEmail() {
    setStep("email");
    setOtp("");
    setErrorMessage(null);
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm font-medium">Sign in with email code</p>
      {step === "email" ? (
        <form className="flex flex-col gap-3" onSubmit={sendCode}>
          <Label htmlFor="email-otp-email">Email</Label>
          <Input
            id="email-otp-email"
            name="email"
            type="email"
            autoComplete="email"
            spellCheck={false}
            placeholder="you@example.com"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <Button type="submit" variant="outline" disabled={pending}>
            {pending ? "Sending…" : "Send code"}
          </Button>
        </form>
      ) : (
        <form className="flex flex-col gap-3" onSubmit={verifyCode}>
          <p aria-live="polite" className="text-sm text-muted-foreground">
            If <span className="break-all font-medium text-foreground">{email.trim()}</span>{" "}
            can use email sign-in, a 6-digit code is on its way.
          </p>
          <Label htmlFor="email-otp-code">Code</Label>
          <Input
            id="email-otp-code"
            name="otp"
            inputMode="numeric"
            autoComplete="one-time-code"
            spellCheck={false}
            pattern="[0-9]*"
            maxLength={6}
            placeholder="123456"
            className="tracking-[0.3em] tabular-nums"
            autoFocus
            required
            value={otp}
            onChange={(event) => setOtp(event.target.value)}
          />
          <Button type="submit" variant="outline" disabled={pending}>
            {pending ? "Verifying…" : "Verify"}
          </Button>
          <button
            type="button"
            className="self-start text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:underline"
            onClick={changeEmail}
          >
            Use a different email
          </button>
        </form>
      )}
      {errorMessage ? (
        <p role="alert" className="text-destructive text-sm">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}
