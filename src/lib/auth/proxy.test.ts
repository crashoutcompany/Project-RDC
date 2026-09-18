import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

import { createAuthProxy, resolvePathAccess } from "./proxy";

function request(pathname: string, cookieHeader?: string) {
  const headers: Record<string, string> = { "x-request-id": "request-1" };
  if (cookieHeader) headers.cookie = cookieHeader;
  return new NextRequest(`https://example.com${pathname}`, { headers });
}

describe("resolvePathAccess", () => {
  it("lets public paths override catch-all rules", () => {
    expect(
      resolvePathAccess(
        "/",
        ["/", "/signin"],
        [{ path: "*", access: "session" }],
      ),
    ).toBeNull();
    expect(
      resolvePathAccess(
        "/dex",
        ["/", "/signin"],
        [{ path: "*", access: "session" }],
      ),
    ).toBe("session");
  });

  it("supports subtree and role rules", () => {
    expect(
      resolvePathAccess(
        "/admin/users",
        [],
        [{ path: "/admin/*", access: "role:admin" }],
      ),
    ).toBe("role:admin");
  });
});

describe("createAuthProxy", () => {
  it("does not fetch a session for public paths without a session cookie", async () => {
    const getSession = vi.fn();
    const proxy = createAuthProxy({
      auth: { api: { getSession } },
      publicPaths: ["/"],
      rules: [{ path: "/app/*", access: "session" }],
      signInPath: "/signin",
    });

    await proxy(request("/"));
    await proxy(request("/about"));

    expect(getSession).not.toHaveBeenCalled();
  });

  it("reads session with GET and skips POST when needsRefresh is false", async () => {
    const getSession = vi.fn().mockResolvedValue({
      headers: new Headers(),
      response: { user: { id: "1" }, needsRefresh: false },
    });
    const proxy = createAuthProxy({
      auth: { api: { getSession } },
      publicPaths: ["/"],
      rules: [{ path: "/app/*", access: "session" }],
      signInPath: "/signin",
    });

    await proxy(request("/", "better-auth.session_token=stale"));

    expect(getSession).toHaveBeenCalledTimes(1);
    expect(getSession).toHaveBeenCalledWith({
      headers: expect.any(Headers),
      returnHeaders: true,
      method: "GET",
    });
  });

  it("POSTs to refresh when GET reports needsRefresh", async () => {
    const sessionHeaders = new Headers({
      "set-cookie": "better-auth.session_token=refreshed; Path=/; HttpOnly",
    });
    const getSession = vi
      .fn()
      .mockResolvedValueOnce({
        headers: new Headers(),
        response: { user: { id: "1" }, needsRefresh: true },
      })
      .mockResolvedValueOnce({
        headers: sessionHeaders,
        response: { user: { id: "1" }, needsRefresh: false },
      });
    const proxy = createAuthProxy({
      auth: { api: { getSession } },
      publicPaths: ["/"],
      rules: [{ path: "/app/*", access: "session" }],
      signInPath: "/signin",
    });

    const response = await proxy(
      request("/", "better-auth.session_token=stale"),
    );

    expect(getSession).toHaveBeenNthCalledWith(1, {
      headers: expect.any(Headers),
      returnHeaders: true,
      method: "GET",
    });
    expect(getSession).toHaveBeenNthCalledWith(2, {
      headers: expect.any(Headers),
      returnHeaders: true,
      method: "POST",
    });
    expect(response.cookies.get("better-auth.session_token")?.value).toBe(
      "refreshed",
    );
  });

  it("passes request headers with returnHeaders and redirects guests from gated paths", async () => {
    const getSession = vi.fn().mockResolvedValue({
      headers: new Headers(),
      response: null,
    });
    const proxy = createAuthProxy({
      auth: { api: { getSession } },
      rules: [{ path: "*", access: "session" }],
      signInPath: "/signin",
    });
    const incoming = request("/dex");

    const response = await proxy(incoming);

    expect(getSession).toHaveBeenCalledWith({
      headers: incoming.headers,
      returnHeaders: true,
      method: "GET",
    });
    expect(response.headers.get("location")).toBe("https://example.com/signin");
  });

  it("redirects signed-in users away from sign-in", async () => {
    const getSession = vi.fn().mockResolvedValue({
      headers: new Headers(),
      response: { user: {} },
    });
    const proxy = createAuthProxy({
      auth: { api: { getSession } },
      publicPaths: ["/signin"],
      rules: [{ path: "*", access: "session" }],
      signInPath: "/signin",
      signedInPath: "/dex",
    });

    const response = await proxy(request("/signin"));

    expect(response.headers.get("location")).toBe("https://example.com/dex");
  });

  it("enforces role rules after authentication", async () => {
    const proxy = createAuthProxy({
      auth: {
        api: {
          getSession: vi.fn().mockResolvedValue({
            headers: new Headers(),
            response: { user: { role: "member" } },
          }),
        },
      },
      rules: [{ path: "/admin/*", access: "role:admin" }],
      signInPath: "/signin",
    });

    const response = await proxy(request("/admin/users"));

    expect(response.status).toBe(403);
  });
});
