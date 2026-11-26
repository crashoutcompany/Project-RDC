import { handlePrismaOperation } from "prisma/db";

/** Open and rejected vision flags on one session, for the approve page warning. */
export const getVisionFlagCounts = async (sessionId: number) => {
  const res = await handlePrismaOperation((prisma) =>
    prisma.visionImportFlag.findMany({
      where: { sessionId, status: { in: ["PENDING", "REJECTED"] } },
      select: { status: true },
    }),
  );
  const flags = res.success ? res.data : [];
  return {
    pending: flags.filter((flag) => flag.status === "PENDING").length,
    rejected: flags.filter((flag) => flag.status === "REJECTED").length,
  };
};
