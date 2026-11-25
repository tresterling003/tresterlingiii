import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { ZodError, type ZodSchema } from "zod";
import { AppError } from "./errors";

export function json(data: unknown, init?: number | ResponseInit) {
  const opts = typeof init === "number" ? { status: init } : init;
  return NextResponse.json(data, {
    ...opts,
    headers: { "cache-control": "no-store", ...(opts?.headers ?? {}) },
  });
}

/**
 * CSRF defence for cookie-authenticated mutations: the browser always sends
 * Origin on cross-site POST/PATCH/DELETE; it must match our own host.
 */
export function assertSameOrigin(req: NextRequest) {
  if (req.method === "GET" || req.method === "HEAD") return;
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (!origin || !host) throw new AppError("forbidden", "Request blocked.", 403);
  try {
    if (new URL(origin).host !== host) throw new Error();
  } catch {
    throw new AppError("forbidden", "Request blocked.", 403);
  }
}

export async function parseBody<T>(req: NextRequest, schema: ZodSchema<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new AppError("invalid", "Invalid request.");
  }
  return schema.parse(raw);
}

type Handler<C> = (req: NextRequest, ctx: C) => Promise<Response>;

/** Wraps a route handler with origin checks and consistent error responses. */
export function route<C = unknown>(handler: Handler<C>): Handler<C> {
  return async (req, ctx) => {
    try {
      assertSameOrigin(req);
      return await handler(req, ctx);
    } catch (e) {
      if (e instanceof AppError) return json({ error: { code: e.code, message: e.message } }, e.status);
      if (e instanceof ZodError) {
        const issue = e.issues[0];
        return json({ error: { code: "invalid", message: issue?.message ?? "Invalid input." } }, 400);
      }
      console.error(e);
      return json({ error: { code: "server_error", message: "Something went wrong on our end. Try again." } }, 500);
    }
  };
}
