// Browser side of the AI integration. The browser never sees an API key: it only talks to PosePilot's own
// server (/api/*), which holds the key and calls the provider.

export interface AiStatus {
  reachable: boolean;
  configured: boolean;
  provider?: string;
  label?: string;
  model?: string;
  costNote?: string;
  transparency?: boolean;
  maxPerHour?: number;
  reason?: string;
}

export class AiError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
  /** Errors that will repeat for every pose, so a job should stop instead of trying the next one. */
  get fatal() {
    return ['not_configured', 'auth', 'quota', 'rate_limited', 'unreachable', 'offline', 'cancelled'].includes(this.code);
  }
}

export async function fetchAiStatus(): Promise<AiStatus> {
  try {
    const res = await fetch('./api/status', { cache: 'no-store' });
    if (!res.ok) throw new Error(String(res.status));
    const j = await res.json();
    return { reachable: true, ...j.ai };
  } catch {
    return {
      reachable: false,
      configured: false,
      reason: 'This copy of PosePilot is running without its server (for example from static hosting), so AI drawing generation is unavailable. Rig mode and every editing tool still work.',
    };
  }
}

export interface PoseRequest {
  prompt: string;
  images: { name: string; dataUrl: string }[];
  quality?: 'low' | 'medium' | 'high';
  transparent?: boolean;
}

export async function requestPose(body: PoseRequest, signal: AbortSignal): Promise<{ image: string; provider: string; model: string }> {
  if (!navigator.onLine) throw new AiError('offline', 'This Chromebook is offline. Reconnect to use AI generation — your work is saved locally.');
  let res: Response;
  try {
    res = await fetch('./api/generate-pose', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });
  } catch (e) {
    if (signal.aborted) throw new AiError('cancelled', 'Generation cancelled.');
    throw new AiError('unreachable', 'Could not reach the PosePilot server. Check your connection — your work is safe.');
  }
  let j: { ok?: boolean; image?: string; provider?: string; model?: string; error?: { code: string; message: string } };
  try {
    j = await res.json();
  } catch {
    throw new AiError('server_error', `The PosePilot server returned an unexpected response (HTTP ${res.status}).`);
  }
  if (!res.ok || !j.ok || !j.image) throw new AiError(j.error?.code || 'server_error', j.error?.message || `Generation failed (HTTP ${res.status}).`);
  return { image: j.image, provider: j.provider!, model: j.model! };
}
