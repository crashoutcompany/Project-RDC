/**
 * Registers Node.js-only OpenTelemetry exporters for AI SDK traces.
 * Skipped on the Edge runtime because `@opentelemetry/sdk-node` is Node-only.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startAiTelemetry } = await import("./posthog/ai-telemetry-register");
  startAiTelemetry();
}

/**
 * Handles errors that occur during Next.js requests.
 *
 * @description
 * Logs details about errors that occur during request processing, including:
 * - Error digest and message
 * - Request path and method
 * - Router context (Pages vs App router)
 * - Route information and rendering context
 * - Revalidation status
 *
 * @param error - The error object containing digest and error details
 * @param request - Request context including path, method and headers
 * @param context - Next.js runtime context including router and rendering information
 */
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
  // posthog-node is Node-only; import it lazily so the Edge bundle never
  // pulls it in. (`cookies()` is also unavailable here, so read the PostHog
  // cookie from the request headers instead.)
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    const { default: posthog } = await import("./posthog/server-init");
    const cookieHeader = request.headers.cookie;
    const raw = (
      Array.isArray(cookieHeader)
        ? cookieHeader.join("; ")
        : (cookieHeader ?? "")
    )
      .split(";")
      .map((c) => c.trim())
      .find((c) => /^ph_.+_posthog=/.test(c));
    let distinctId: string | undefined;
    if (raw) {
      try {
        distinctId = JSON.parse(
          decodeURIComponent(raw.slice(raw.indexOf("=") + 1)),
        ).distinct_id;
      } catch {
        // malformed cookie, fall back to an anonymous id
      }
    }

    await posthog.captureExceptionImmediate(
      error,
      distinctId ?? crypto.randomUUID(),
      {
        errorMsg: error.message,
        requestMethod: request.method,
        requestPath: request.path,
        contextRoutePath: context.routePath,
        contextRouteType: context.routeType,
      },
    );
  } catch (err) {
    // Never let error reporting throw.
    console.error("onRequestError reporting failed", err);
  }
}
