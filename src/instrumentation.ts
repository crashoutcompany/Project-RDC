 
// import { cookies } from "next/headers";
// import posthog from "./posthog/server-init";
// import { v4 } from "uuid";

export async function onRequestError(
  error: { digest: string } & Error,
  request: {
    path: string; // resource path, e.g. /blog?name=foo
    method: string; // request method. e.g. GET, POST, etc
    headers: { [key: string]: string };
  },
  context: {
    routerKind: "Pages Router" | "App Router"; // the router type
    routePath: string; // the route file path, e.g. /app/blog/[dynamic]
    routeType: "render" | "route" | "action" | "middleware"; // the context in which the error occurred
    renderSource:
      | "react-server-components"
      | "react-server-components-payload"
      | "server-rendering";
    revalidateReason: "on-demand" | "stale" | undefined; // undefined is a normal request without revalidation
    renderType: "dynamic" | "dynamic-resume"; // 'dynamic-resume' for PPR
  },
): Promise<void> {
  let distinctId: string;
  // const cookiesStore = await cookies();
  // const cookieName =
  //   "ph_phc_ymI76IccT0jIjAjaJVFse643ZsilQYyvwG2qnZ2w10H_posthog";

  // if (cookiesStore.has(cookieName)) {
  //   distinctId = cookiesStore.get(cookieName)?.value || v4();
  // } else distinctId = v4();

  // posthog.captureException(error, distinctId, {
  //   errorMsg: error.message,
  //   requestMethod: request.method,
  //   contextRoutePath: context.routePath,
  //   contextRouteType: context.routeType,
  // });
}
