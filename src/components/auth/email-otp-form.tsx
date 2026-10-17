"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth/client";
import { cn } from "@/lib/utils";

const inputClass =
  "border-ac-cream bg-ac-ink text-ac-cream placeholder:text-ac-cream/40 focus-visible:border-ac-gold focus-visible:ring-ac-gold/40 h-12 rounded-none border-2 text-xl md:text-xl";
const submitClass =
  "font-display bg-ac-blue text-ac-ink hover:bg-ac-blue/90 h-12 w-full cursor-pointer rounded-none text-xs uppercase shadow-[4px_4px_0_var(--ac-gold)]";
const labelClass = "ac-label text-ac-cream/80 text-[0.6rem]";

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

    try {
      const result = await authClient.emailOtp.sendVerificationOtp({
        email: email.trim(),
        type: "sign-in",
      });

      if (result.error) {
        setErrorMessage(
          result.error.message ||
            "Unable to send a code. Try again in a minute.",
        );
        return;
      }
      setOtp("");
      setStep("code");
    } catch {
      setErrorMessage("Unable to send a code. Try again in a minute.");
    } finally {
      setPending(false);
    }
  }

  async function verifyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setErrorMessage(null);

    try {
      const result = await authClient.signIn.emailOtp({
        email: email.trim(),
        otp: otp.trim(),
      });

      if (result.error) {
        setErrorMessage(
          result.error.message ||
            "Unable to sign in. Check the code and try again.",
        );
        return;
      }
      router.replace(callbackURL ?? "/");
      router.refresh();
    } catch {
      setErrorMessage("Unable to sign in. Check the code and try again.");
    } finally {
      setPending(false);
    }
  }

  function changeEmail() {
    setStep("email");
    setOtp("");
    setErrorMessage(null);
  }

  return (
    <div className="flex flex-col gap-3 text-left">
      <p className="ac-label text-ac-gold">Sign in with email code</p>
      {step === "email" ? (
        <form className="flex flex-col gap-3" onSubmit={sendCode}>
          <Label htmlFor="email-otp-email" className={labelClass}>
            Email
          </Label>
          <Input
            id="email-otp-email"
            name="email"
            type="email"
            autoComplete="email"
            spellCheck={false}
            placeholder="you@example.com"
            className={inputClass}
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <Button type="submit" className={submitClass} disabled={pending}>
            {pending ? "Sending…" : "Send code"}
          </Button>
        </form>
      ) : (
        <form className="flex flex-col gap-3" onSubmit={verifyCode}>
          <p aria-live="polite" className="text-ac-cream/80 text-lg">
            If <span className="text-ac-cream break-all">{email.trim()}</span>{" "}
            can use email sign-in, a 6-digit code is on its way.
          </p>
          <Label htmlFor="email-otp-code" className={labelClass}>
            Code
          </Label>
          <Input
            id="email-otp-code"
            name="otp"
            inputMode="numeric"
            autoComplete="one-time-code"
            spellCheck={false}
            pattern="[0-9]*"
            maxLength={6}
            placeholder="123456"
            className={cn(inputClass, "tracking-[0.3em] tabular-nums")}
            autoFocus
            required
            value={otp}
            onChange={(event) => setOtp(event.target.value)}
          />
          <Button type="submit" className={submitClass} disabled={pending}>
            {pending ? "Verifying…" : "Verify"}
          </Button>
          <Button
            type="button"
            variant="link"
            size="sm"
            className="text-ac-cream/70 hover:text-ac-gold self-start px-0"
            onClick={changeEmail}
          >
            Use a different email
          </Button>
        </form>
      )}
      {errorMessage ? (
        <p role="alert" className="text-ac-red text-lg">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}
