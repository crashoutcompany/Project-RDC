import { Session } from "next-auth";
import { redirect } from "next/navigation";

export const FEATURE_FLAGS = {
  SUBMISSION_FORM: { roles: ["admin"] },
  ADMIN_FORM: { roles: ["admin"] },
  AUTH: { roles: ["admin", "tester"] },
} as const satisfies Record<string, { roles: [Roles, ...Roles[]] }>;

export type FeatureFlagName = keyof typeof FEATURE_FLAGS;

type Roles = "admin" | "user" | "tester";

export const FeatureFlag = ({
  children,
  devOnly = false,
  shouldRedirect = false,
  flagName,
  user,
}: {
  children: React.ReactNode;
  devOnly?: boolean;
  shouldRedirect: boolean;
  flagName: FeatureFlagName;
  user: Session | null;
}) => {
  // TODO Add necessary checks for if user has a particular role.
  const flag = FEATURE_FLAGS[flagName];
  if (shouldRedirect) {
    if (
      (devOnly && process.env.NODE_ENV !== "development") ||
      flag.roles.some((s) => s === user?.user?.name) // user isn't admin
    )
      redirect("/");
  }

  if (devOnly && process.env.NODE_ENV !== "development") return;

  return <>{children}</>;
};
