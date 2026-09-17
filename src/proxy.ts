import { auth } from "@/lib/auth";
import { SIGN_IN_PATH } from "@/lib/auth/config";
import { createAuthProxy } from "@/lib/auth/proxy";

const authProxy = createAuthProxy({
  auth,
  publicPaths: ["/", SIGN_IN_PATH],
  rules: [{ path: "/admin/*", access: "role:admin" }],
  signInPath: SIGN_IN_PATH,
});

export default authProxy;
export { authProxy as proxy };

export const config = {
  matcher: [
    "/((?!api(?:/|$)|_next(?:/|$)|favicon\\.ico$|.*\\.(?:avif|gif|ico|jpe?g|png|svg|webp)$).*)",
  ],
};
