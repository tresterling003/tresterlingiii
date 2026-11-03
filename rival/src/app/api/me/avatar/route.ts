import { route, json } from "@/lib/api";
import { requireUserId } from "@/lib/auth";
import { withUser } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { avatarUrl } from "@/lib/avatar";

const MAX = 300_000;

/** Detect the real image type from its magic bytes (never trust the header). */
function sniff(b: Buffer): "image/jpeg" | "image/png" | "image/webp" | null {
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (b.length > 12 && b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return null;
}

export const POST = route(async (req) => {
  const uid = await requireUserId();
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > MAX) throw new AppError("invalid", "That image is too large.");
  const buf = Buffer.from(await req.arrayBuffer());
  if (buf.length === 0 || buf.length > MAX) throw new AppError("invalid", "That image is too large.");
  const type = sniff(buf);
  if (!type) throw new AppError("invalid", "Use a JPEG, PNG or WebP image.");
  const r = await withUser(uid, (tx) => tx.one<{ ts: string }>("select set_avatar($1, $2) as ts", [buf, type]));
  return json({ avatarUrl: avatarUrl(uid, r!.ts) });
});

export const DELETE = route(async () => {
  const uid = await requireUserId();
  await withUser(uid, (tx) => tx.query("select delete_avatar()"));
  return json({ ok: true });
});
