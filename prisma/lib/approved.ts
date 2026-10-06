import type { Prisma } from "@/generated/prisma/client";

/**
 * Public pages only show sessions an admin has approved. Nested relations
 * (sets, matches, player sessions, stats) reach the session via `set`, since
 * PlayerSession.sessionId has no Prisma relation.
 */
export const approvedSession = {
  isApproved: true,
} as const satisfies Prisma.SessionWhereInput;

export const inApprovedSet = {
  session: approvedSession,
} as const satisfies Prisma.GameSetWhereInput;

export const inApprovedMatch = {
  set: inApprovedSet,
} as const satisfies Prisma.MatchWhereInput;

export const inApprovedPlayerSession = {
  set: inApprovedSet,
} as const satisfies Prisma.PlayerSessionWhereInput;

export const inApprovedPlayerStat = {
  playerSession: inApprovedPlayerSession,
} as const satisfies Prisma.PlayerStatWhereInput;
