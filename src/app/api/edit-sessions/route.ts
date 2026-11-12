import config from "@/lib/config";
import { authorizeCronRequest } from "@/lib/cron/authorize";
import { NextRequest } from "next/server";
import { handlePrismaOperation } from "prisma/db";
import {
  logEditSessionCleanupError,
  logEditSessionCleanupSuccess,
} from "@/posthog/server-analytics";

export async function GET(req: NextRequest) {
  // Ensure only authorized cron jobs can access this route
  const cronSecret = config.CRON_SECRET;

  if (!cronSecret) return new Response("Missing cron secret", { status: 500 });

  if (!authorizeCronRequest(req, cronSecret))
    return new Response("Unauthorized", { status: 401 });

  // Start work
  const res = await handlePrismaOperation((prisma) =>
    prisma.sessionEditRequest.deleteMany({
      where: { status: { in: ["APPROVED", "REJECTED"] } },
    }),
  );
  if (res.success) {
    console.log(`Deleted ${res.data.count} edit sessions`);
    logEditSessionCleanupSuccess("Cleaned up edit sessions", {
      count: res.data.count,
    });
    return new Response("Cleaned up edit sessions", { status: 200 });
  } else {
    logEditSessionCleanupError("Error cleaning up edit sessions", {
      error: res.error,
    });
    return new Response("Error cleaning up edit sessions", { status: 500 });
  }
}
