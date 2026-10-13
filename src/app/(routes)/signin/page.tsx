import { Suspense } from "react";
import { emailOtpEnabled, enabledSocialProviders } from "@/lib/auth";
import { getRscSession } from "@/lib/auth/server";
import { SignInButtons } from "@/components/auth/sign-in-buttons";
import { redirect } from "next/navigation";
import Link from "next/link";

/** Shell commits under instant(); session gate streams in separately. */
export default function Page() {
  return (
    <section className="vs-dusk flex min-h-[70vh] items-center justify-center px-4 py-16">
      <div className="border-vs-gold vs-shadow bg-vs-ink w-full max-w-xl border-4 p-8 text-center sm:p-10">
        <p className="vs-label text-vs-red">Insert coin</p>
        <h1
          data-testid="signin-shell-marker"
          className="vs-title animate-slam-in mt-3 text-7xl"
        >
          <span className="text-vs-cream">Player 1</span>
          <br />
          <span className="text-vs-gold">Sign in</span>
        </h1>
        <p className="text-vs-cream/80 mx-auto mt-4 max-w-sm text-lg">
          To submit scores you must be logged in. Pick one of the providers
          below.
        </p>
        <div className="mt-6">
          <Suspense fallback={null}>
            <SignInControls />
          </Suspense>
        </div>
        <Link
          href="/"
          className="vs-label text-vs-cream/70 hover:text-vs-cream mt-6 inline-block"
        >
          ◀ Back to title screen
        </Link>
      </div>
    </section>
  );
}

async function SignInControls() {
  const session = await getRscSession();
  if (session) redirect("/");

  return (
    <SignInButtons
      providers={enabledSocialProviders}
      emailOtpEnabled={emailOtpEnabled}
    />
  );
}
