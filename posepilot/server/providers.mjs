// Image-generation provider adapters. Each adapter turns a PosePilot pose request
// (text prompt + reference images) into one provider-specific HTTP call and returns a PNG/JPEG.
//
// A provider is only "configured" when its API key is present in the server environment.
// Nothing here ever fabricates an image: every result comes from the provider's response.

export class ProviderError extends Error {
  /** @param {string} code @param {string} message @param {number} [status] */
  constructor(code, message, status = 502) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

const PROVIDERS = {
  openai: {
    label: 'OpenAI Images (edit with reference images)',
    keyVar: 'OPENAI_API_KEY',
    modelVar: 'OPENAI_IMAGE_MODEL',
    defaultModel: 'gpt-image-1',
    // Approximate public list prices, late 2025. Always confirm on the provider's pricing page.
    costNote: 'About $0.04–$0.25 per pose (depends on quality setting and input image size). Check current OpenAI pricing.',
    supportsTransparency: true,
  },
  gemini: {
    label: 'Google Gemini image model (image + text to image)',
    keyVar: 'GEMINI_API_KEY',
    modelVar: 'GEMINI_IMAGE_MODEL',
    defaultModel: 'gemini-2.5-flash-image',
    costNote: 'About $0.04 per pose (≈1,290 output tokens per image). Check current Google AI pricing.',
    supportsTransparency: false,
  },
};

/** Resolve which provider the server is configured for. */
export function resolveProvider(env) {
  const wanted = (env.AI_PROVIDER || '').trim().toLowerCase();
  let id = null;
  if (wanted && wanted !== 'auto') {
    if (wanted === 'none' || wanted === 'off') id = null;
    else if (PROVIDERS[wanted]) id = wanted;
    else return { configured: false, id: null, reason: `AI_PROVIDER "${wanted}" is not supported. Use "openai" or "gemini".` };
  } else if (env.OPENAI_API_KEY) id = 'openai';
  else if (env.GEMINI_API_KEY) id = 'gemini';

  if (!id) {
    return {
      configured: false,
      id: null,
      reason: 'No AI provider is configured on this server. Set OPENAI_API_KEY or GEMINI_API_KEY (see README → "Turning on AI drawing generation"). Rig mode works without it.',
    };
  }
  const p = PROVIDERS[id];
  const key = (env[p.keyVar] || '').trim();
  if (!key) return { configured: false, id, reason: `${p.keyVar} is not set on the server.` };
  return {
    configured: true,
    id,
    key,
    label: p.label,
    model: (env[p.modelVar] || '').trim() || p.defaultModel,
    costNote: p.costNote,
    supportsTransparency: p.supportsTransparency,
  };
}

function splitDataUrl(dataUrl) {
  const m = /^data:(image\/(png|jpeg|webp));base64,(.+)$/s.exec(dataUrl || '');
  if (!m) throw new ProviderError('bad_request', 'Reference images must be PNG, JPEG or WebP data URLs.', 400);
  return { mime: m[1], b64: m[3] };
}

/** Map an HTTP failure from a provider to a message a student/teacher can act on. */
export function mapHttpError(providerId, status, bodyText) {
  const lower = (bodyText || '').toLowerCase();
  if (status === 401 || status === 403)
    return new ProviderError('auth', `The ${providerId} API key on the server was rejected (HTTP ${status}). A teacher or admin needs to check the key.`, 502);
  if (status === 429)
    return new ProviderError('quota', 'The AI service says the usage limit or quota has been reached. Wait a minute and try again, or use Rig mode.', 429);
  if (lower.includes('safety') || lower.includes('moderation') || lower.includes('content_policy') || lower.includes('blocked'))
    return new ProviderError('blocked', 'The AI service declined this request under its content rules. Try rewording the motion description.', 422);
  if (status === 400 || status === 404) {
    let detail = '';
    try { detail = JSON.parse(bodyText)?.error?.message || ''; } catch { /* not JSON */ }
    return new ProviderError('rejected', `The AI service rejected the request${detail ? `: ${detail.slice(0, 240)}` : ` (HTTP ${status})`}.`, 502);
  }
  if (status >= 500) return new ProviderError('provider_down', `The AI service is having problems right now (HTTP ${status}). Your work is safe — try again shortly.`, 503);
  return new ProviderError('provider_error', `Unexpected response from the AI service (HTTP ${status}).`, 502);
}

/**
 * Build the provider HTTP request. Exported separately so it can be unit-tested without network access.
 * @param {ReturnType<typeof resolveProvider>} cfg
 * @param {{prompt:string, images:{name:string,dataUrl:string}[], quality?:string, transparent?:boolean}} req
 * @param {Record<string,string|undefined>} env
 */
export function buildProviderRequest(cfg, req, env = {}) {
  const images = req.images.map((im) => ({ name: im.name, ...splitDataUrl(im.dataUrl) }));
  if (cfg.id === 'openai') {
    const form = new FormData();
    form.append('model', cfg.model);
    form.append('prompt', req.prompt);
    form.append('n', '1');
    form.append('size', '1024x1024');
    const quality = ['low', 'medium', 'high'].includes(req.quality || '') ? req.quality : env.OPENAI_IMAGE_QUALITY || 'medium';
    form.append('quality', quality);
    if (req.transparent !== false) form.append('background', 'transparent');
    const fidelity = env.OPENAI_INPUT_FIDELITY ?? 'high';
    if (fidelity) form.append('input_fidelity', fidelity);
    for (const im of images) {
      const ext = im.mime.split('/')[1];
      form.append('image[]', new Blob([Buffer.from(im.b64, 'base64')], { type: im.mime }), `${im.name}.${ext}`);
    }
    return {
      url: (env.OPENAI_BASE_URL || 'https://api.openai.com/v1') + '/images/edits',
      init: { method: 'POST', headers: { Authorization: `Bearer ${cfg.key}` }, body: form },
    };
  }
  if (cfg.id === 'gemini') {
    const parts = [{ text: req.prompt }];
    for (const im of images) parts.push({ inline_data: { mime_type: im.mime, data: im.b64 } });
    return {
      url: `${env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta'}/models/${encodeURIComponent(cfg.model)}:generateContent`,
      init: {
        method: 'POST',
        headers: { 'x-goog-api-key': cfg.key, 'content-type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts }],
          generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: '1:1' } },
        }),
      },
    };
  }
  throw new ProviderError('not_configured', 'No AI provider configured.', 503);
}

/** Pull the generated image out of a provider response body. */
export function parseProviderResponse(providerId, json) {
  if (providerId === 'openai') {
    const b64 = json?.data?.[0]?.b64_json;
    if (!b64) throw new ProviderError('no_image', 'The AI service answered but did not return an image.', 502);
    return { dataUrl: `data:image/png;base64,${b64}`, note: json?.data?.[0]?.revised_prompt };
  }
  if (providerId === 'gemini') {
    const cand = json?.candidates?.[0];
    const parts = cand?.content?.parts || [];
    const img = parts.find((p) => p.inlineData || p.inline_data);
    if (!img) {
      const text = parts.map((p) => p.text).filter(Boolean).join(' ').slice(0, 300);
      const reason = cand?.finishReason || json?.promptFeedback?.blockReason;
      if (reason && /SAFETY|PROHIBITED|BLOCK/i.test(reason))
        throw new ProviderError('blocked', 'The AI service declined this request under its content rules. Try rewording the motion description.', 422);
      throw new ProviderError('no_image', `The AI service did not return an image${text ? ` (it said: "${text}")` : ''}.`, 502);
    }
    const d = img.inlineData || img.inline_data;
    return { dataUrl: `data:${d.mimeType || d.mime_type || 'image/png'};base64,${d.data}` };
  }
  throw new ProviderError('not_configured', 'No AI provider configured.', 503);
}

/** Perform one generation. `signal` cancels the upstream call when the student presses Cancel. */
export async function generateImage(cfg, req, env, signal, fetchImpl = fetch) {
  const { url, init } = buildProviderRequest(cfg, req, env);
  let res;
  try {
    res = await fetchImpl(url, { ...init, signal });
  } catch (e) {
    if (signal?.aborted) {
      const r = signal.reason;
      if (r && r.code === 'timeout') throw new ProviderError('timeout', 'The AI service took too long to answer. Try again, or use Rig mode.', 504);
      throw new ProviderError('cancelled', 'Generation was cancelled.', 499);
    }
    throw new ProviderError('unreachable', 'The server could not reach the AI service. Check the internet connection or try again later.', 503);
  }
  const text = await res.text();
  if (!res.ok) throw mapHttpError(cfg.id, res.status, text);
  let json;
  try { json = JSON.parse(text); } catch { throw new ProviderError('provider_error', 'The AI service returned an unreadable response.', 502); }
  return parseProviderResponse(cfg.id, json);
}
