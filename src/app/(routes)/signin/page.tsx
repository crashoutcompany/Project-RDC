import { Suspense } from "react";
import { enabledSocialProviders } from "@/lib/auth";
import { getRscSession } from "@/lib/auth/server";
import { SignInButtons } from "@/components/auth/sign-in-buttons";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Tag } from "@/components/arcade/ui";

/** Shell commits under instant(); session gate streams in separately. */
export default function Page() {
  return (
    <section className="ac-grid bg-ac-ink flex min-h-[70vh] items-center justify-center px-4 py-16">
      <div className="border-ac-gold bg-ac-panel relative w-full max-w-xl border-4 p-8 text-center sm:p-10">
        <Tag tone="green" className="absolute -top-7 -left-4 text-4xl">
          keep score!
        </Tag>
                <h1
          data-testid="signin-shell-marker"
          className="ac-title animate-slam-in mt-3 text-2xl md:text-3xl"
        >
          <span className="text-ac-cream">Player 1</span>
          <br />
          <span className="text-ac-cream">Sign in</span>
        </h1>
        <p className="text-ac-cream/80 mx-auto mt-4 max-w-sm text-lg">
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
          className="ac-label text-ac-cream/70 hover:text-ac-cream mt-6 inline-block"
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

  return <SignInButtons providers={enabledSocialProviders} />;
}
