import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import { ActionError } from "@/lib/investigation/actions";
import { logger } from "./logger";

export type ErrorCode = "INVALID_INPUT" | "NOT_FOUND" | "CONFLICT" | "FORBIDDEN" | "NOT_CONFIGURED" | "INTERNAL_ERROR";

const STATUS: Record<ErrorCode, number> = {
  INVALID_INPUT: 400,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  NOT_CONFIGURED: 503,
  INTERNAL_ERROR: 500,
};

export class ApiError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
  }
}

/** Consistent error envelope: { error: { code, message } } */
export function errorResponse(code: ErrorCode, message: string): NextResponse {
  return NextResponse.json({ error: { code, message } }, { status: STATUS[code] });
}

export function json<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json(data, { ...init, headers: { "Cache-Control": "no-store", ...(init?.headers ?? {}) } });
}

export const UuidSchema = z.string().uuid({ message: "Must be a valid id" });

export function parseOrThrow<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new ApiError("INVALID_INPUT", parsed.error.issues.map((i) => (i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message)).join("; "));
  }
  return parsed.data;
}

export async function readJson(request: Request): Promise<unknown> {
  const text = await request.text();
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new ApiError("INVALID_INPUT", "Request body must be valid JSON");
  }
}

type Handler<C> = (request: Request, context: C) => Promise<Response>;

/** Wraps a route handler so every failure returns the standard error envelope. */
export function route<C>(handler: Handler<C>): Handler<C> {
  return async (request, context) => {
    const started = Date.now();
    try {
      return await handler(request, context);
    } catch (error) {
      if (error instanceof ApiError) return errorResponse(error.code, error.message);
      if (error instanceof ActionError) return errorResponse(error.code, error.message);
      const message = error instanceof Error ? error.message : String(error);
      logger.error("api_error", { path: new URL(request.url).pathname, method: request.method, durationMs: Date.now() - started, error: message });
      const dbDown = /ECONNREFUSED|connect|DATABASE_URL|password authentication|getaddrinfo/i.test(message);
      return errorResponse(
        dbDown ? "NOT_CONFIGURED" : "INTERNAL_ERROR",
        dbDown ? "The database is unavailable. Check DATABASE_URL and that Postgres is reachable." : "Something went wrong on our side. Please try again.",
      );
    }
  };
}

/** The organization for this request, or a 404 telling the operator how to seed it. */
export async function requireOrganization() {
  const { getCurrentOrganization } = await import("@/lib/db/queries/organization");
  const org = await getCurrentOrganization();
  if (!org) throw new ApiError("NOT_FOUND", "No organization found. Seed the demo with POST /api/demo/seed.");
  return org;
}

export type IdContext = { params: Promise<{ id: string }> };

export async function idParam(context: IdContext): Promise<string> {
  const { id } = await context.params;
  return parseOrThrow(UuidSchema, id);
}
