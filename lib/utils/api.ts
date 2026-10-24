import "server-only";
import { ConvexError } from "convex/values";
import { NextResponse } from "next/server";
import { z } from "zod";
import { isConvexConfigured } from "@/lib/convex/config";
import { logger } from "./logger";

/*
 * The JSON API is a thin layer over Convex functions (convex/nextjs fetchQuery and friends),
 * kept for scripts and integrations. The UI talks to Convex directly over its live subscription.
 */

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

/** Throws NOT_FOUND when a Convex query returned null. */
export function found<T>(value: T | null | undefined, what: string): T {
  if (value === null || value === undefined) throw new ApiError("NOT_FOUND", `${what} not found`);
  return value;
}

function convexErrorCode(data: unknown): { code: ErrorCode; message: string } | null {
  if (data && typeof data === "object" && "code" in data && typeof data.code === "string" && data.code in STATUS) {
    const message = "message" in data && typeof data.message === "string" ? data.message : data.code;
    return { code: data.code as ErrorCode, message };
  }
  return null;
}

type Handler<C> = (request: Request, context: C) => Promise<Response>;

/** Wraps a route handler so every failure returns the standard error envelope. */
export function route<C>(handler: Handler<C>): Handler<C> {
  return async (request, context) => {
    const started = Date.now();
    try {
      if (!isConvexConfigured()) throw new ApiError("NOT_CONFIGURED", "NEXT_PUBLIC_CONVEX_URL is not set. Run `npx convex dev` once to create a deployment.");
      return await handler(request, context);
    } catch (error) {
      if (error instanceof ApiError) return errorResponse(error.code, error.message);
      if (error instanceof ConvexError) {
        const known = convexErrorCode(error.data);
        if (known) return errorResponse(known.code, known.message);
      }
      const message = error instanceof Error ? error.message : String(error);
      logger.error("api_error", { path: new URL(request.url).pathname, method: request.method, durationMs: Date.now() - started, error: message });
      const unreachable = /fetch failed|ECONNREFUSED|ENOTFOUND|getaddrinfo/i.test(message);
      return errorResponse(
        unreachable ? "NOT_CONFIGURED" : "INTERNAL_ERROR",
        unreachable ? "Convex is unreachable. Check NEXT_PUBLIC_CONVEX_URL and that the deployment is running." : "Something went wrong on our side. Please try again.",
      );
    }
  };
}

export type IdContext = { params: Promise<{ id: string }> };

const IdSchema = z.string().trim().min(1).max(64).regex(/^[a-z0-9]+$/, { message: "Must be a valid id" });

export async function idParam(context: IdContext): Promise<string> {
  const { id } = await context.params;
  return parseOrThrow(IdSchema, id);
}
