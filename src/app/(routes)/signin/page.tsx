import { Suspense } from "react";
import Image from "next/image";
import Link from "next/link";
import { emailOtpEnabled, enabledSocialProviders } from "@/lib/auth";
import { getRscSession } from "@/lib/auth/server";
import { SignInButtons } from "@/components/auth/sign-in-buttons";
import { redirect } from "next/navigation";

/** Shell commits under instant(); session gate streams in separately. */
export default function Page() {
  return (
    <div className="flex min-h-[calc(100svh-8rem)] items-center justify-center px-4 py-10 sm:px-8">
      <div className="bg-card grid w-full max-w-5xl overflow-hidden rounded-2xl border shadow-xl lg:grid-cols-[1.05fr_1fr]">
        <section className="relative hidden min-h-[36rem] overflow-hidden lg:block">
          <Image
            src="/images/battle_background.png"
            alt=""
            fill
            priority
            sizes="(min-width: 1024px) 34rem, 0px"
            className="object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-black/20" />
          <div className="relative flex h-full flex-col justify-between p-10 text-white">
            <p
              translate="no"
              className="w-fit rounded-full border border-white/20 bg-black/30 px-3 py-1 text-xs font-semibold tracking-[0.18em] uppercase backdrop-blur"
            >
              RDC Stat Tracker
            </p>
            <div>
              <p className="text-sm font-medium tracking-[0.2em] text-white/70 uppercase">
                Real Dreams Change the World
              </p>
              <p className="mt-3 text-4xl leading-tight font-bold text-balance">
                Every game. Every stat. Every win.
              </p>
              <p className="mt-4 max-w-sm leading-relaxed text-white/75">
                Help keep the record straight by submitting scores from the
                latest RDC sessions.
              </p>
            </div>
          </div>
        </section>

        <section className="flex flex-col justify-center gap-8 p-8 sm:p-12">
          <div>
            <p className="dark:text-chart-4 text-xs font-semibold tracking-[0.2em] text-amber-700 uppercase">
              Contributor access
            </p>
            <h1
              data-testid="signin-shell-marker"
              className="mt-3 text-3xl font-bold tracking-tight text-balance sm:text-4xl"
            >
              Sign in to submit scores
            </h1>
            <p className="text-muted-foreground mt-3 leading-relaxed">
              Browsing stats is open to everyone. Sign in to add new game
              results and keep the leaderboards up to date.
            </p>
          </div>

          <Suspense fallback={<div className="h-28" />}>
            <SignInControls />
          </Suspense>

          <p className="text-muted-foreground text-sm">
            <Link
              href="/"
              className="hover:text-foreground underline-offset-4 hover:underline"
            >
              ← Back to stats
            </Link>
          </p>
        </section>
      </div>
    </div>
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
