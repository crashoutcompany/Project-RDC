import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

import { createAuthProxy, resolvePathAccess } from "./proxy";

function request(pathname: string) {
  return new NextRequest(`https://example.com${pathname}`, {
    headers: { "x-request-id": "request-1" },
  });
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
  it("does not fetch a session for ungated or public paths", async () => {
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

  it("passes request headers and redirects guests from gated paths", async () => {
    const getSession = vi.fn().mockResolvedValue(null);
    const proxy = createAuthProxy({
      auth: { api: { getSession } },
      rules: [{ path: "*", access: "session" }],
      signInPath: "/signin",
    });
    const incoming = request("/dex");

    const response = await proxy(incoming);

    expect(getSession).toHaveBeenCalledWith({ headers: incoming.headers });
    expect(response.headers.get("location")).toBe("https://example.com/signin");
  });

  it("redirects signed-in users away from sign-in", async () => {
    const getSession = vi.fn().mockResolvedValue({ user: {} });
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
          getSession: vi.fn().mockResolvedValue({ user: { role: "member" } }),
        },
      },
      rules: [{ path: "/admin/*", access: "role:admin" }],
      signInPath: "/signin",
    });

    const response = await proxy(request("/admin/users"));

    expect(response.status).toBe(403);
  });
});
