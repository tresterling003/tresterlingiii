/**
 * Automatic subject detection, running entirely in the browser (the image is never uploaded).
 *
 * Model: U²-Net-p ("u2netp", ~4.6 MB, Apache-2.0) from the U-2-Net project, run with
 * ONNX Runtime Web (MIT) on WebAssembly. Both are bundled with CreateSpace, so nothing is
 * downloaded from other websites and no API keys are needed. They load only when used.
 */

const SIZE = 320;
const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];

type Ort = typeof import('onnxruntime-web/wasm');
let sessionPromise: Promise<{ ort: Ort; session: import('onnxruntime-web/wasm').InferenceSession }> | null = null;

/** Load the engine and model once (about 20 MB the first time). */
export function loadSegmenter() {
  if (!sessionPromise) {
    sessionPromise = (async () => {
      const [ort, wasmUrl] = await Promise.all([
        import('onnxruntime-web/wasm'),
        import('onnxruntime-web/ort-wasm-simd-threaded.wasm?url').then((m) => m.default),
      ]);
      ort.env.wasm.numThreads = 1; // threads need special server headers that most hosts don't send
      ort.env.wasm.proxy = false;
      ort.env.wasm.wasmPaths = { wasm: wasmUrl };
      // The model is packaged inside a JavaScript file (as base64 text) so every host can serve it.
      const { default: dataUrl } = await import('./models/u2netp.onnx?inline');
      const session = await ort.InferenceSession.create(decodeDataUrl(dataUrl), { executionProviders: ['wasm'] });
      return { ort, session };
    })().catch((e) => {
      sessionPromise = null; // allow a retry
      throw e;
    });
  }
  return sessionPromise;
}

function decodeDataUrl(url: string): Uint8Array {
  const bin = atob(url.slice(url.indexOf(',') + 1));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/**
 * Returns a "probability of subject" map (0–255) at the image's own size.
 * `source` is the image drawn on a canvas.
 */
export async function detectSubject(source: HTMLCanvasElement): Promise<Uint8Array> {
  const { ort, session } = await loadSegmenter();
  const { width: w, height: h } = source;

  // 1. Shrink to the model's input size.
  const small = document.createElement('canvas');
  small.width = SIZE;
  small.height = SIZE;
  const sctx = small.getContext('2d', { willReadFrequently: true })!;
  sctx.drawImage(source, 0, 0, SIZE, SIZE);
  const px = sctx.getImageData(0, 0, SIZE, SIZE).data;

  // 2. Normalize like the model was trained (scale by the brightest value, then mean/std).
  let max = 1;
  for (let i = 0; i < px.length; i += 4) max = Math.max(max, px[i], px[i + 1], px[i + 2]);
  const input = new Float32Array(3 * SIZE * SIZE);
  for (let i = 0, p = 0; p < SIZE * SIZE; i += 4, p++)
    for (let c = 0; c < 3; c++) input[c * SIZE * SIZE + p] = (px[i + c] / max - MEAN[c]) / STD[c];

  // 3. Run the model.
  const feeds = { [session.inputNames[0]]: new ort.Tensor('float32', input, [1, 3, SIZE, SIZE]) };
  const result = await session.run(feeds);
  const out = result[session.outputNames[0]].data as Float32Array;

  // 4. Stretch to 0–255 and scale back up smoothly to the image size.
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of out) (lo = Math.min(lo, v)), (hi = Math.max(hi, v));
  const range = hi - lo || 1;
  const maskImg = sctx.createImageData(SIZE, SIZE);
  for (let p = 0; p < SIZE * SIZE; p++) {
    const v = Math.round(((out[p] - lo) / range) * 255);
    maskImg.data.set([v, v, v, 255], p * 4);
  }
  sctx.putImageData(maskImg, 0, 0);
  const big = document.createElement('canvas');
  big.width = w;
  big.height = h;
  const bctx = big.getContext('2d', { willReadFrequently: true })!;
  bctx.imageSmoothingEnabled = true;
  bctx.imageSmoothingQuality = 'high';
  bctx.drawImage(small, 0, 0, w, h);
  const up = bctx.getImageData(0, 0, w, h).data;
  const prob = new Uint8Array(w * h);
  for (let p = 0; p < w * h; p++) prob[p] = up[p * 4];
  return prob;
}
