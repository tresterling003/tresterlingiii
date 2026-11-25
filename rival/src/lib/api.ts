import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { ZodError, type ZodSchema } from "zod";
import { AppError } from "./errors";

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { "cache-control": "no-store" } });
}

/** CSRF defence for cookie-authenticated mutations: Origin must match our host. */
function assertSameOrigin(req: NextRequest) {
  if (req.method === "GET" || req.method === "HEAD") return;
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    if (!origin || !host || new URL(origin).host !== host) throw new Error();
  } catch {
    throw new AppError("forbidden", "Request blocked.", 403);
  }
}

export async function body<T>(req: NextRequest, schema: ZodSchema<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new AppError("invalid", "Invalid request.");
  }
  return schema.parse(raw);
}

type Handler<C> = (req: NextRequest, ctx: C) => Promise<Response>;

export function route<C = any>(handler: Handler<C>): Handler<C> {
  return async (req, ctx) => {
    try {
      assertSameOrigin(req);
      return await handler(req, ctx);
    } catch (e) {
      // Let Next.js's own control-flow errors (dynamic usage, redirects) through.
      if ((e as { digest?: string })?.digest) throw e;
      if (e instanceof AppError) return json({ error: { code: e.code, message: e.message } }, e.status);
      if (e instanceof ZodError) {
        const i = e.issues[0];
        return json({ error: { code: "invalid", message: i?.message ?? "Invalid input." } }, 400);
      }
      console.error(e);
      return json({ error: { code: "server_error", message: "Something went wrong on our end. Try again." } }, 500);
    }
  };
}
