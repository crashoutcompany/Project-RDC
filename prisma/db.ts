import {
  PrismaClientKnownRequestError,
  PrismaClientValidationError,
} from "@prisma/client/runtime/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { neonConfig, NeonDbError } from "@neondatabase/serverless";
import ws from "ws";
import { PrismaClient } from "./generated";
import posthog from "@/posthog/server-init";

neonConfig.webSocketConstructor = ws;

// To work in edge environments (Cloudflare Workers, Vercel Edge, etc.), enable querying over fetch
// ! Broken currently due to Cache Components
// neonConfig.poolQueryViaFetch = true;

// Type definitions
declare global {
  var prisma: PrismaClient | undefined;
}

export type ErrorResponse<T> = {
  success: false;
  error: string;
  code?: string;
  data: T | null;
};

export type SuccessResponse<T> = {
  success: true;
  data: T;
};

export type QueryResponse<T> = ErrorResponse<T> | SuccessResponse<T>;

export type QueryResponseData<T, Y = unknown> = NonNullable<
  Extract<T, { success: true; data: Y }>["data"]
>;

export async function handlePrismaOperation<T>(
  operation: (prisma: PrismaClient) => Promise<T>,
): Promise<QueryResponse<T>> {
  try {
    const data = await operation(prisma);
    return { success: true, data };
  } catch (error: any) {
    posthog.captureException(error, "database-error", {
      code: error?.code,
    });
    if (error?.code === "P1000")
      console.warn("Database connection error. Database may be expired.");
    if (error instanceof PrismaClientKnownRequestError) {
      return {
        success: false,
        error: `Database error: ${error.message}`,
        code: error.code,
        data: null,
      };
    }
    if (error instanceof PrismaClientValidationError) {
      return {
        success: false,
        error: "Invalid query parameters",
        data: null,
      };
    }
    if (error instanceof NeonDbError)
      return {
        success: false,
        error: `Neon error: ${error.message}`,
        code: error.code,
        data: null,
      };
    return {
      success: false,
      error: `An unexpected error occurred: ${error}`,
      data: null,
    };
  }
}
const connectionString = process.env.DATABASE_URL;

const adapter = new PrismaNeon({ connectionString });

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export default prisma;
