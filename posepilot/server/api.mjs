// PosePilot HTTP API (framework-free so it can be mounted in Vite dev/preview and in server/index.mjs).
//   GET  /api/status        -> which AI provider (if any) is configured; never returns the key
//   POST /api/generate-pose -> one pose image from reference images + prompt
// Student artwork is held in memory only for the duration of the request and is never written to disk.
import { resolveProvider, generateImage, ProviderError } from './providers.mjs';

const MAX_BODY = 16 * 1024 * 1024;

function send(res, status, body) {
  if (res.writableEnded) return;
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(body));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new ProviderError('too_large', 'The drawing is too large to send. PosePilot shrinks images automatically — try re-importing it.', 413));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); }
      catch { reject(new ProviderError('bad_request', 'Request body is not valid JSON.', 400)); }
    });
    req.on('error', reject);
  });
}

/** Simple per-client sliding-window limiter so one classroom cannot drain a teacher's quota by accident. */
export function createLimiter(maxPerHour, now = () => Date.now()) {
  const hits = new Map();
  return (key) => {
    if (!maxPerHour) return { ok: true };
    const t = now();
    const list = (hits.get(key) || []).filter((x) => t - x < 3600_000);
    if (list.length >= maxPerHour) {
      hits.set(key, list);
      return { ok: false, retryInMin: Math.ceil((3600_000 - (t - list[0])) / 60000) };
    }
    list.push(t);
    hits.set(key, list);
    return { ok: true };
  };
}

export function createApiHandler(env = process.env, { fetchImpl } = {}) {
  const maxPerHour = Number(env.POSEPILOT_MAX_PER_HOUR ?? 60);
  const timeoutMs = Number(env.POSEPILOT_TIMEOUT_MS ?? 120000);
  const limiter = createLimiter(maxPerHour);

  return async function handle(req, res) {
    const path = (req.url || '').split('?')[0];
    const cfg = resolveProvider(env);
    try {
      if (req.method === 'GET' && path === '/api/status') {
        return send(res, 200, {
          ok: true,
          ai: cfg.configured
            ? { configured: true, provider: cfg.id, label: cfg.label, model: cfg.model, costNote: cfg.costNote, transparency: cfg.supportsTransparency, maxPerHour }
            : { configured: false, reason: cfg.reason },
        });
      }
      if (req.method === 'POST' && path === '/api/generate-pose') {
        if (!cfg.configured) throw new ProviderError('not_configured', cfg.reason, 503);
        const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || 'local';
        const lim = limiter(ip);
        if (!lim.ok) throw new ProviderError('rate_limited', `This computer has reached the class limit of ${maxPerHour} AI generations per hour. Try again in about ${lim.retryInMin} min, or use Rig mode.`, 429);
        const body = await readJson(req);
        if (typeof body.prompt !== 'string' || !body.prompt.trim()) throw new ProviderError('bad_request', 'Missing prompt.', 400);
        if (!Array.isArray(body.images) || body.images.length < 1 || body.images.length > 4)
          throw new ProviderError('bad_request', 'Send between 1 and 4 reference images.', 400);

        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort({ code: 'timeout' }), timeoutMs);
        res.on('close', () => { if (!res.writableEnded) ctrl.abort({ code: 'cancelled' }); });
        try {
          const out = await generateImage(cfg, { prompt: body.prompt.slice(0, 4000), images: body.images, quality: body.quality, transparent: body.transparent }, env, ctrl.signal, fetchImpl);
          return send(res, 200, { ok: true, image: out.dataUrl, provider: cfg.id, model: cfg.model, note: out.note || null });
        } finally {
          clearTimeout(timer);
        }
      }
      return send(res, 404, { ok: false, error: { code: 'not_found', message: 'Unknown API route.' } });
    } catch (e) {
      const err = e instanceof ProviderError ? e : new ProviderError('server_error', 'Something went wrong on the PosePilot server.', 500);
      if (!(e instanceof ProviderError)) console.error('[posepilot]', e);
      return send(res, err.status, { ok: false, error: { code: err.code, message: err.message } });
    }
  };
}
