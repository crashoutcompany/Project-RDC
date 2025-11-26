import { auth } from "@/lib/auth";
import { H1 } from "@/components/headings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { domain } from "@/lib/utils";
// import { GitHubLogoIcon } from "@radix-ui/react-icons";
import { redirect } from "next/navigation";
import { headers } from "next/headers";

export default async function Page() {
  return (
    <div className="m-10">
      <H1>Sign in Page</H1>
      <div className="text-center">
        In order to submit scores you must be logged in. Please login with one
        of the providers below.
      </div>
      <div className="mx-auto mt-4 w-fit">
        <form
          action={async (fd) => {
            "use server";
            const rawProvider = fd.get("provider");
            if (typeof rawProvider !== "string") {
              console.error("Invalid provider");
              redirect("/");
            }

            const provider = rawProvider.slice(13).toLowerCase();
            console.log(provider);

            if (provider === "github" || provider === "google") {
              const data = await auth.api.signInSocial({
                body: {
                  provider: provider as "github" | "google",
                  callbackURL: "/",
                  errorCallbackURL: "/",
                },
                headers: await headers(),
              });
              if (data?.url) {
                redirect(data.url);
              }
            } else {
              console.error("Invalid provider");
              redirect("/");
            }
          }}
        >
          <div className="flex flex-col space-y-4">
            <Button
              type="submit"
              className="focus-visible:bg-primary/90 cursor-pointer text-white"
              asChild
            >
              <Input
                name="provider"
                type="submit"
                value="Sign in with Github"
              />
              {/* <GitHubLogoIcon /> */}
            </Button>
            <Button
              type="submit"
              className="focus-visible:bg-primary/90 cursor-pointer text-white"
              asChild
            >
              <Input
                name="provider"
                type="submit"
                value="Sign in with Google"
              />
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
