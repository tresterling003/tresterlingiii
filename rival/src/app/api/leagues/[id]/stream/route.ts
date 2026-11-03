import type { NextRequest } from "next/server";
import { getUserId } from "@/lib/auth";
import { getLeagueVersion } from "@/lib/league";

/**
 * Live sync via Server-Sent Events. Every write that affects a league bumps
 * leagues.version inside the same database transaction; this stream watches
 * that counter and tells connected devices to refetch. Streams last ~55s
 * (serverless limit) and the browser's EventSource reconnects automatically.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const POLL_MS = 1500;
const LIFETIME_MS = 55_000;

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const uid = await getUserId();
  if (!uid) return new Response("unauthenticated", { status: 401 });
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) return new Response("not found", { status: 404 });
  const initial = await getLeagueVersion(uid, params.id);
  if (initial === null) return new Response("not found", { status: 404 });

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let last = initial;
      let closed = false;
      const send = (s: string) => {
        if (!closed) controller.enqueue(enc.encode(s));
      };
      const close = () => {
        if (closed) return;
        closed = true;
        try { controller.close(); } catch {}
      };
      req.signal.addEventListener("abort", close);
      send(`retry: 1000\nevent: version\ndata: ${last}\n\n`);
      const started = Date.now();
      let lastBeat = Date.now();
      while (!closed && Date.now() - started < LIFETIME_MS) {
        await new Promise((r) => setTimeout(r, POLL_MS));
        if (closed) break;
        try {
          const v = await getLeagueVersion(uid, params.id);
          if (v === null) {
            send("event: gone\ndata: {}\n\n");
            break;
          }
          if (v !== last) {
            last = v;
            send(`event: version\ndata: ${v}\n\n`);
          } else if (Date.now() - lastBeat > 15_000) {
            send(": keep-alive\n\n");
            lastBeat = Date.now();
          }
        } catch {
          break; // transient DB error: let the client reconnect
        }
      }
      close();
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}
