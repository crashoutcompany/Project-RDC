import { parseUserInput } from "better-auth/db";
import { describe, expect, it } from "vitest";

import { userAdditionalFields } from "./config";

function optionsWithRoleInput(input?: boolean) {
  return {
    user: {
      additionalFields: {
        role: {
          type: "string" as const,
          required: false,
          defaultValue: "user",
          ...(input === undefined ? {} : { input }),
        },
      },
    },
  };
}

describe("user role additional field", () => {
  it("is not client-writable on the production auth config", () => {
    expect(userAdditionalFields.role.input).toBe(false);
  });

  it("rejects a client-supplied admin role on update-user", () => {
    expect(() =>
      parseUserInput(
        { user: { additionalFields: userAdditionalFields } },
        { role: "admin" },
        "update",
      ),
    ).toThrow(/role is not allowed to be set/i);
  });

  it("still assigns the default role when creating a user", () => {
    expect(
      parseUserInput(
        { user: { additionalFields: userAdditionalFields } },
        {},
        "create",
      ),
    ).toEqual({ role: "user" });
  });

  it("would persist a client-supplied admin role if input were left unset", () => {
    expect(
      parseUserInput(optionsWithRoleInput(), { role: "admin" }, "update"),
    ).toEqual({ role: "admin" });
  });
});
