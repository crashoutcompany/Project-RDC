"use cache";

import { signIn } from "@/auth";
import { H1 } from "@/components/headings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { domain } from "@/lib/utils";
// import { GitHubLogoIcon } from "@radix-ui/react-icons";
import { redirect } from "next/navigation";

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
            const provider = fd.get("provider")?.slice(13);
            console.log(provider);
            switch (provider) {
              case "Google":
                await signIn("google", { redirectTo: domain });
                break;
              case "Github":
                await signIn("github", { redirectTo: domain });
                break;
              default:
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
