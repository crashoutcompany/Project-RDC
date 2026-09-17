import { Suspense } from "react";
import { enabledSocialProviders } from "@/lib/auth";
import { getRscSession } from "@/lib/auth/server";
import { SignInButtons } from "@/components/auth/sign-in-buttons";
import { H1 } from "@/components/headings";
import { redirect } from "next/navigation";

/** Shell commits under instant(); session gate streams in separately. */
export default function Page() {
  return (
    <div className="m-10">
      <H1 data-testid="signin-shell-marker">Sign in Page</H1>
      <div className="text-center">
        In order to submit scores you must be logged in. Please login with one
        of the providers below.
      </div>
      <div className="mx-auto mt-4 w-fit">
        <Suspense fallback={null}>
          <SignInControls />
        </Suspense>
      </div>
    </div>
  );
}

async function SignInControls() {
  const session = await getRscSession();
  if (session) redirect("/");

  return <SignInButtons providers={enabledSocialProviders} />;
}
