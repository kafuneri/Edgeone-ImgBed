/**
 * Dedicated Web Worker for single-threaded WASM AVIF encoding (@jsquash/avif).
 * Keeps heavy libaom encoding off the UI thread and requires no COOP/COEP headers.
 */

const DEFAULT_AVIF_OPTIONS = {
  quality: 62,
  qualityAlpha: -1,
  denoiseLevel: 0,
  tileColsLog2: 0,
  tileRowsLog2: 0,
  speed: 6,
  subsample: 1,
  chromaDeltaQ: false,
  sharpness: 0,
  tune: 0,
  enableSharpYUV: false,
  bitDepth: 8,
  lossless: false,
};

let encoderPromise = null;

async function getEncoder() {
  if (!encoderPromise) {
    encoderPromise = import("./avif/avif_enc.js")
      .then(({ default: avifEnc }) =>
        avifEnc({
          locateFile: (path) => new URL(`./avif/${path}`, import.meta.url).href,
        })
      )
      .catch((err) => {
        encoderPromise = null;
        throw err;
      });
  }
  return encoderPromise;
}

self.onmessage = async (event) => {
  const { id, buffer, width, height, options } = event.data || {};
  try {
    if (!(buffer instanceof ArrayBuffer) || !width || !height) {
      throw new Error("Invalid AVIF encode payload");
    }
    const encoder = await getEncoder();
    const rgba = new Uint8Array(buffer);
    const encodeOptions = {
      ...DEFAULT_AVIF_OPTIONS,
      ...(options || {}),
    };
    const output = encoder.encode(rgba, width, height, encodeOptions);
    if (!output || output.byteLength === 0) {
      throw new Error("AVIF encoder returned empty output");
    }
    // Copy out of WASM linear memory before transferring ownership back.
    const outBuffer = new Uint8Array(output).buffer;
    self.postMessage({ id, ok: true, buffer: outBuffer }, [outBuffer]);
  } catch (err) {
    self.postMessage({
      id,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
};
