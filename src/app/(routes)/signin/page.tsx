import { Suspense } from "react";
import { auth } from "@/lib/auth";
import { enabledSocialProviders } from "@/lib/auth";
import { SignInButtons } from "@/components/auth/sign-in-buttons";
import { H1 } from "@/components/headings";
import { redirect } from "next/navigation";
import { headers } from "next/headers";

export default function Page() {
  return (
    <Suspense>
      <SignInPage />
    </Suspense>
  );
}

async function SignInPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (session) redirect("/");

  return (
    <div className="m-10">
      <H1 data-testid="signin-shell-marker">Sign in Page</H1>
      <div className="text-center">
        In order to submit scores you must be logged in. Please login with one
        of the providers below.
      </div>
      <div className="mx-auto mt-4 w-fit">
        <SignInButtons providers={enabledSocialProviders} />
      </div>
    </div>
  );
}
