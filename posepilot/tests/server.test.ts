import { describe, expect, it, vi } from 'vitest';
// @ts-expect-error plain ESM server module
import { buildProviderRequest, mapHttpError, parseProviderResponse, resolveProvider, generateImage } from '../server/providers.mjs';
// @ts-expect-error plain ESM server module
import { createApiHandler, createLimiter } from '../server/api.mjs';
import { EventEmitter } from 'node:events';

const PNG = 'data:image/png;base64,' + Buffer.from('fake-png-bytes').toString('base64');

function mockRes() {
  const res = new EventEmitter() as EventEmitter & { statusCode: number; headers: Record<string, string>; body: string; writableEnded: boolean; setHeader: (k: string, v: string) => void; end: (b: string) => void };
  res.statusCode = 200;
  res.headers = {};
  res.body = '';
  res.writableEnded = false;
  res.setHeader = (k, v) => { res.headers[k] = v; };
  res.end = (b) => { res.body = b; res.writableEnded = true; };
  return res;
}
function mockReq(method: string, url: string, body?: unknown) {
  const req = new EventEmitter() as EventEmitter & { method: string; url: string; headers: Record<string, string>; socket: { remoteAddress: string }; destroy: () => void };
  req.method = method;
  req.url = url;
  req.headers = {};
  req.socket = { remoteAddress: '10.0.0.1' };
  req.destroy = () => {};
  setTimeout(() => { if (body !== undefined) req.emit('data', Buffer.from(JSON.stringify(body))); req.emit('end'); });
  return req;
}
async function call(handler: (req: unknown, res: unknown) => Promise<void>, method: string, url: string, body?: unknown) {
  const res = mockRes();
  await handler(mockReq(method, url, body), res);
  return { status: res.statusCode, json: JSON.parse(res.body) };
}

describe('provider configuration', () => {
  it('is not configured without keys, and says how to fix it', () => {
    const c = resolveProvider({});
    expect(c.configured).toBe(false);
    expect(c.reason).toMatch(/OPENAI_API_KEY|GEMINI_API_KEY/);
  });
  it('auto-detects providers from keys', () => {
    expect(resolveProvider({ OPENAI_API_KEY: 'k' })).toMatchObject({ configured: true, id: 'openai', model: 'gpt-image-1' });
    expect(resolveProvider({ GEMINI_API_KEY: 'k' })).toMatchObject({ configured: true, id: 'gemini', model: 'gemini-2.5-flash-image' });
    expect(resolveProvider({ AI_PROVIDER: 'none', OPENAI_API_KEY: 'k' }).configured).toBe(false);
  });
});

describe('provider requests', () => {
  it('OpenAI: multipart edit with every reference image and high input fidelity', async () => {
    const cfg = resolveProvider({ OPENAI_API_KEY: 'sk-test' });
    const { url, init } = buildProviderRequest(cfg, { prompt: 'pose please', images: [{ name: 'original', dataUrl: PNG }, { name: 'guide', dataUrl: PNG }] }, {});
    expect(url).toBe('https://api.openai.com/v1/images/edits');
    expect(init.headers.Authorization).toBe('Bearer sk-test');
    const form = init.body as FormData;
    expect(form.getAll('image[]')).toHaveLength(2);
    expect(form.get('prompt')).toBe('pose please');
    expect(form.get('input_fidelity')).toBe('high');
    expect(form.get('background')).toBe('transparent');
  });
  it('Gemini: inline images + text, image output requested, key in header (never in URL)', () => {
    const cfg = resolveProvider({ GEMINI_API_KEY: 'g-test' });
    const { url, init } = buildProviderRequest(cfg, { prompt: 'p', images: [{ name: 'a', dataUrl: PNG }] }, {});
    expect(url).toContain('/models/gemini-2.5-flash-image:generateContent');
    expect(url).not.toContain('g-test');
    expect(init.headers['x-goog-api-key']).toBe('g-test');
    const body = JSON.parse(init.body);
    expect(body.contents[0].parts[1].inline_data.mime_type).toBe('image/png');
    expect(body.generationConfig.responseModalities).toEqual(['IMAGE']);
  });
  it('parses both response formats and refuses empty answers', () => {
    expect(parseProviderResponse('openai', { data: [{ b64_json: 'AAA' }] }).dataUrl).toBe('data:image/png;base64,AAA');
    expect(parseProviderResponse('gemini', { candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: 'BBB' } }] } }] }).dataUrl).toBe('data:image/png;base64,BBB');
    expect(() => parseProviderResponse('gemini', { candidates: [{ finishReason: 'SAFETY', content: { parts: [] } }] })).toThrow(/content rules/);
    expect(() => parseProviderResponse('openai', { data: [] })).toThrow(/did not return an image/);
  });
  it('maps HTTP failures to helpful messages', () => {
    expect(mapHttpError('openai', 401, '').code).toBe('auth');
    expect(mapHttpError('openai', 429, '').code).toBe('quota');
    expect(mapHttpError('openai', 400, '{"error":{"message":"Your request was rejected by the safety system"}}').code).toBe('blocked');
    expect(mapHttpError('gemini', 503, '').code).toBe('provider_down');
  });
  it('turns network failures and timeouts into errors, never fake images', async () => {
    const cfg = resolveProvider({ OPENAI_API_KEY: 'k' });
    const failing = vi.fn().mockRejectedValue(new TypeError('fetch failed'));
    await expect(generateImage(cfg, { prompt: 'x', images: [{ name: 'a', dataUrl: PNG }] }, {}, new AbortController().signal, failing)).rejects.toMatchObject({ code: 'unreachable' });
    const ctrl = new AbortController();
    ctrl.abort({ code: 'timeout' });
    await expect(generateImage(cfg, { prompt: 'x', images: [{ name: 'a', dataUrl: PNG }] }, {}, ctrl.signal, failing)).rejects.toMatchObject({ code: 'timeout' });
  });
});

describe('API handler', () => {
  it('status never exposes the key', async () => {
    const h = createApiHandler({ OPENAI_API_KEY: 'sk-secret-value' });
    const r = await call(h, 'GET', '/api/status');
    expect(r.json.ai.configured).toBe(true);
    expect(JSON.stringify(r.json)).not.toContain('sk-secret-value');
  });
  it('generation without a provider returns 503 with an explanation', async () => {
    const r = await call(createApiHandler({}), 'POST', '/api/generate-pose', { prompt: 'x', images: [{ name: 'a', dataUrl: PNG }] });
    expect(r.status).toBe(503);
    expect(r.json.error.code).toBe('not_configured');
  });
  it('validates input', async () => {
    const h = createApiHandler({ OPENAI_API_KEY: 'k' }, { fetchImpl: vi.fn() });
    expect((await call(h, 'POST', '/api/generate-pose', { prompt: '', images: [] })).status).toBe(400);
  });
  it('passes the provider image through on success', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [{ b64_json: 'QUJD' }] }), { status: 200 }));
    const h = createApiHandler({ OPENAI_API_KEY: 'k' }, { fetchImpl });
    const r = await call(h, 'POST', '/api/generate-pose', { prompt: 'jump', images: [{ name: 'a', dataUrl: PNG }] });
    expect(r.status).toBe(200);
    expect(r.json.image).toBe('data:image/png;base64,QUJD');
    expect(fetchImpl).toHaveBeenCalledOnce();
  });
  it('rate-limits per computer', () => {
    let t = 0;
    const lim = createLimiter(2, () => t);
    expect(lim('a').ok).toBe(true);
    expect(lim('a').ok).toBe(true);
    expect(lim('a').ok).toBe(false);
    expect(lim('b').ok).toBe(true);
    t = 3600_001;
    expect(lim('a').ok).toBe(true);
  });
});
