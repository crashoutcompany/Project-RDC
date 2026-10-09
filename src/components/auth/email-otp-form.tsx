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
      setErrorMessage(result.error.message || "Unable to send a code.");
      return;
    }
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
      setErrorMessage(result.error.message || "Unable to sign in.");
      setPending(false);
      return;
    }
    router.replace(callbackURL ?? "/");
    router.refresh();
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
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <Button type="submit" variant="outline" disabled={pending}>
            Send code
          </Button>
        </form>
      ) : (
        <form className="flex flex-col gap-3" onSubmit={verifyCode}>
          <Label htmlFor="email-otp-code">Code</Label>
          <Input
            id="email-otp-code"
            name="otp"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={6}
            required
            value={otp}
            onChange={(event) => setOtp(event.target.value)}
          />
          <Button type="submit" variant="outline" disabled={pending}>
            Verify
          </Button>
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
