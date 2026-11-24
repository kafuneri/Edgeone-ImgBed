/**
 * Client-side image compression and format conversion pipeline.
 * Supports WASM AVIF encoding in a Web Worker with automatic Canvas WebP fallback.
 */

const AVIF_WORKER_URL = new URL("./avif-worker.js?v=1.5.0", import.meta.url).href;
const DEFAULT_AVIF_TIMEOUT_MS = 15000;

const SKIP_EXTS = new Set(["svg", "gif", "ico", "mp4", "mkv", "mp3", "m4a", "txt", "sh", "zip", "jxl"]);
const SKIP_MIMES = new Set([
  "image/svg+xml",
  "image/gif",
  "image/x-icon",
  "image/vnd.microsoft.icon",
  "video/mp4",
  "video/x-matroska",
  "audio/mpeg",
  "audio/mp4",
  "audio/x-m4a",
  "text/plain",
  "text/x-sh",
  "text/x-shellscript",
  "application/zip",
  "application/x-zip-compressed",
  "image/jxl",
]);

let workerInstance = null;
let workerQueue = Promise.resolve();
let nextRequestId = 1;

function getExt(name = "") {
  const idx = name.lastIndexOf(".");
  return idx >= 0 ? name.slice(idx + 1).toLowerCase() : "";
}

function shouldSkipCompression(file) {
  const mime = (file.type || "").split(";")[0].trim().toLowerCase();
  const ext = getExt(file.name);
  if (SKIP_MIMES.has(mime) || SKIP_EXTS.has(ext)) return true;
  if (mime && !mime.startsWith("image/")) return true;
  return false;
}

function normalizeTargetFormat(options) {
  if (options.targetFormat === "avif" || options.targetFormat === "webp" || options.targetFormat === "original") {
    return options.targetFormat;
  }
  if (options.convertToWebp === false) return "original";
  return "avif";
}

function fitDimensions(width, height, maxDimension) {
  const maxSide = Math.max(width, height);
  if (!maxDimension || maxSide <= maxDimension) {
    return { width, height, resized: false };
  }
  const scale = maxDimension / maxSide;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
    resized: true,
  };
}

async function decodeImageSource(file) {
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(file);
    return {
      source: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      cleanup: () => {
        if (typeof bitmap.close === "function") bitmap.close();
      },
    };
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Failed to decode image"));
      el.src = objectUrl;
    });
    return {
      source: img,
      width: img.naturalWidth || img.width,
      height: img.naturalHeight || img.height,
      cleanup: () => URL.revokeObjectURL(objectUrl),
    };
  } catch (err) {
    URL.revokeObjectURL(objectUrl);
    throw err;
  }
}

function renderToCanvas(source, width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("2D canvas context unavailable");
  ctx.drawImage(source, 0, 0, width, height);
  return { canvas, ctx };
}

function canvasToBlob(canvas, mimeType, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error(`Canvas toBlob failed for ${mimeType}`));
          return;
        }
        resolve(blob);
      },
      mimeType,
      quality
    );
  });
}

function resetWorker() {
  if (workerInstance) {
    try {
      workerInstance.terminate();
    } catch {
      // Ignore worker termination errors.
    }
    workerInstance = null;
  }
}

function runSingleAvifTask({ rgba, width, height, encodeOptions, timeoutMs, reuseRgba }) {
  return new Promise((resolve, reject) => {
    if (typeof Worker === "undefined") {
      reject(new Error("Web Worker unavailable"));
      return;
    }

    let settled = false;
    const id = nextRequestId++;
    const timer = setTimeout(() => {
      cleanup();
      resetWorker();
      reject(new Error(`AVIF worker timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    if (!workerInstance) {
      workerInstance = new Worker(AVIF_WORKER_URL, { type: "module" });
    }

    const onMessage = (event) => {
      const msg = event.data || {};
      if (msg.id !== id) return;
      cleanup();
      if (msg.ok && msg.buffer instanceof ArrayBuffer) {
        resolve(new Blob([msg.buffer], { type: "image/avif" }));
      } else {
        reject(new Error(msg.error || "AVIF encoding failed"));
      }
    };

    const onError = (err) => {
      cleanup();
      resetWorker();
      reject(new Error(err?.message || "AVIF worker error"));
    };

    const cleanup = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (workerInstance) {
        workerInstance.removeEventListener("message", onMessage);
        workerInstance.removeEventListener("error", onError);
      }
    };

    workerInstance.addEventListener("message", onMessage);
    workerInstance.addEventListener("error", onError);

    const transferBuffer = reuseRgba ? rgba.slice().buffer : rgba.buffer;
    workerInstance.postMessage(
      {
        id,
        buffer: transferBuffer,
        width,
        height,
        options: encodeOptions,
      },
      [transferBuffer]
    );
  });
}

function encodeAvifInWorker(params) {
  const task = workerQueue.then(
    () => runSingleAvifTask(params),
    () => runSingleAvifTask(params)
  );
  workerQueue = task.catch(() => {});
  return task;
}

async function encodeWithAvif(decoded, file, opts) {
  const { enableCompress, targetBytes, maxDimension, timeoutMs } = opts;
  const maxDim = enableCompress ? maxDimension : Math.max(decoded.width, decoded.height);
  const firstDim = fitDimensions(decoded.width, decoded.height, maxDim);
  const { canvas, ctx } = renderToCanvas(decoded.source, firstDim.width, firstDim.height);
  const rgba = ctx.getImageData(0, 0, firstDim.width, firstDim.height).data;

  if (!enableCompress) {
    const blob = await encodeAvifInWorker({
      rgba,
      width: firstDim.width,
      height: firstDim.height,
      encodeOptions: { quality: 68, speed: 6 },
      timeoutMs,
      reuseRgba: false,
    });
    return { blob, resized: firstDim.resized };
  }

  let blob = await encodeAvifInWorker({
    rgba,
    width: firstDim.width,
    height: firstDim.height,
    encodeOptions: { quality: 62, speed: 6 },
    timeoutMs,
    reuseRgba: true,
  });

  if (blob.size > targetBytes) {
    blob = await encodeAvifInWorker({
      rgba,
      width: firstDim.width,
      height: firstDim.height,
      encodeOptions: { quality: 48, speed: 6 },
      timeoutMs,
      reuseRgba: false,
    });
  }

  if (blob.size > targetBytes) {
    const step3Max = Math.min(maxDimension || 1280, 1280);
    const step3Dim = fitDimensions(decoded.width, decoded.height, step3Max);
    const step3Canvas =
      step3Dim.width === firstDim.width && step3Dim.height === firstDim.height
        ? canvas
        : renderToCanvas(decoded.source, step3Dim.width, step3Dim.height).canvas;
    const step3Ctx = step3Canvas.getContext("2d", { willReadFrequently: true });
    const step3Rgba = step3Ctx.getImageData(0, 0, step3Dim.width, step3Dim.height).data;
    blob = await encodeAvifInWorker({
      rgba: step3Rgba,
      width: step3Dim.width,
      height: step3Dim.height,
      encodeOptions: { quality: 45, speed: 6 },
      timeoutMs,
      reuseRgba: false,
    });
    return { blob, resized: firstDim.resized || step3Dim.resized };
  }

  return { blob, resized: firstDim.resized };
}

async function encodeWithWebp(decoded, opts) {
  const { enableCompress, targetBytes, maxDimension } = opts;
  const maxDim = enableCompress ? maxDimension : Math.max(decoded.width, decoded.height);
  const firstDim = fitDimensions(decoded.width, decoded.height, maxDim);
  const { canvas } = renderToCanvas(decoded.source, firstDim.width, firstDim.height);

  if (!enableCompress) {
    const blob = await canvasToBlob(canvas, "image/webp", 0.9);
    return { blob, resized: firstDim.resized };
  }

  const qualities = [0.85, 0.72, 0.58];
  let blob = await canvasToBlob(canvas, "image/webp", qualities[0]);
  for (let i = 1; i < qualities.length && blob.size > targetBytes; i++) {
    blob = await canvasToBlob(canvas, "image/webp", qualities[i]);
  }

  let resized = firstDim.resized;
  if (blob.size > targetBytes) {
    const stepDim = fitDimensions(decoded.width, decoded.height, Math.min(maxDimension || 1280, 1280));
    const smallCanvas =
      stepDim.width === firstDim.width && stepDim.height === firstDim.height
        ? canvas
        : renderToCanvas(decoded.source, stepDim.width, stepDim.height).canvas;
    resized = resized || stepDim.resized;
    for (const q of [0.75, 0.6]) {
      blob = await canvasToBlob(smallCanvas, "image/webp", q);
      if (blob.size <= targetBytes) break;
    }
  }

  return { blob, resized };
}

async function encodeOriginalFormat(decoded, file, opts) {
  const { enableCompress, targetBytes, maxDimension } = opts;
  const origExt = getExt(file.name);
  const origMime = (file.type || "").toLowerCase();

  if (origExt === "avif" || origMime === "image/avif") {
    return encodeWithAvif(decoded, file, opts);
  }

  if (origExt === "webp" || origMime === "image/webp") {
    return encodeWithWebp(decoded, opts);
  }

  const outMime = origMime === "image/jpeg" || origExt === "jpg" || origExt === "jpeg" ? "image/jpeg" : "image/png";
  const maxDim = enableCompress ? maxDimension : Math.max(decoded.width, decoded.height);
  const firstDim = fitDimensions(decoded.width, decoded.height, maxDim);
  const { canvas } = renderToCanvas(decoded.source, firstDim.width, firstDim.height);

  if (outMime === "image/png") {
    let blob = await canvasToBlob(canvas, "image/png");
    let resized = firstDim.resized;
    if (enableCompress && blob.size > targetBytes) {
      const stepDim = fitDimensions(decoded.width, decoded.height, Math.min(maxDimension || 1280, 1280));
      if (stepDim.width < firstDim.width || stepDim.height < firstDim.height) {
        const smallCanvas = renderToCanvas(decoded.source, stepDim.width, stepDim.height).canvas;
        blob = await canvasToBlob(smallCanvas, "image/png");
        resized = true;
      }
    }
    return { blob, resized };
  }

  let blob = await canvasToBlob(canvas, outMime, enableCompress ? 0.88 : 0.92);
  let resized = firstDim.resized;
  if (enableCompress && blob.size > targetBytes) {
    for (const q of [0.76, 0.64]) {
      blob = await canvasToBlob(canvas, outMime, q);
      if (blob.size <= targetBytes) break;
    }
  }
  if (enableCompress && blob.size > targetBytes) {
    const stepDim = fitDimensions(decoded.width, decoded.height, Math.min(maxDimension || 1280, 1280));
    if (stepDim.width < firstDim.width || stepDim.height < firstDim.height) {
      const smallCanvas = renderToCanvas(decoded.source, stepDim.width, stepDim.height).canvas;
      resized = true;
      for (const q of [0.78, 0.64]) {
        blob = await canvasToBlob(smallCanvas, outMime, q);
        if (blob.size <= targetBytes) break;
      }
    }
  }
  return { blob, resized };
}

function makePassThroughResult(file, fallbackUsed = false) {
  const origExt = getExt(file.name) || "bin";
  return {
    blob: file,
    compressed: false,
    originalSize: file.size,
    finalSize: file.size,
    ext: origExt,
    codec: "original",
    fallbackUsed,
  };
}

/**
 * Compress and optionally convert an uploaded image.
 * Returns { blob, compressed, originalSize, finalSize, ext, codec, fallbackUsed }.
 */
export async function compressImage(file, options = {}) {
  const targetFormat = normalizeTargetFormat(options);
  const enableCompress = options.enableCompress !== false;
  const thresholdBytes = Number.isFinite(options.thresholdBytes) ? options.thresholdBytes : 0.5 * 1024 * 1024;
  const targetBytes = Number.isFinite(options.targetBytes) ? options.targetBytes : 0.95 * 1024 * 1024;
  const maxDimension = Number.isFinite(options.maxDimension) ? options.maxDimension : 2048;
  const timeoutMs = Number.isFinite(options.avifTimeoutMs) ? options.avifTimeoutMs : DEFAULT_AVIF_TIMEOUT_MS;

  if (!file || shouldSkipCompression(file)) {
    return makePassThroughResult(file);
  }

  const origExt = getExt(file.name) || "png";
  const origMime = (file.type || "").toLowerCase();
  const isAlreadyAvif = origExt === "avif" || origMime === "image/avif";
  const isAlreadyWebp = origExt === "webp" || origMime === "image/webp";

  if (targetFormat === "original" && (!enableCompress || file.size <= thresholdBytes)) {
    // Still check dimensions when enableCompress is on? Avoid decode if both <= threshold and not oversized?
    // Decode below checks maxDimension only if enableCompress; if !enableCompress skip decode entirely.
    if (!enableCompress) {
      return makePassThroughResult(file);
    }
  }

  let decoded;
  try {
    decoded = await decodeImageSource(file);
  } catch (err) {
    console.warn("Image decode failed, skipping compression:", err);
    return makePassThroughResult(file);
  }

  try {
    const exceedsMaxDim = enableCompress && Math.max(decoded.width, decoded.height) > maxDimension;
    const isSameAsTarget =
      targetFormat === "original" ||
      (targetFormat === "avif" && isAlreadyAvif) ||
      (targetFormat === "webp" && isAlreadyWebp);

    if (isSameAsTarget && (!enableCompress || (file.size <= thresholdBytes && !exceedsMaxDim))) {
      return makePassThroughResult(file);
    }

    const encodeOpts = { enableCompress, targetBytes, maxDimension, timeoutMs };

    if (targetFormat === "original") {
      const res = await encodeOriginalFormat(decoded, file, encodeOpts);
      if (res.blob.size >= file.size && !res.resized) {
        return makePassThroughResult(file);
      }
      return {
        blob: res.blob,
        compressed: res.blob.size < file.size || res.resized,
        originalSize: file.size,
        finalSize: res.blob.size,
        ext: origExt,
        codec: "original",
        fallbackUsed: false,
      };
    }

    if (targetFormat === "webp") {
      const res = await encodeWithWebp(decoded, encodeOpts);
      if (res.blob.size >= file.size && !res.resized) {
        return makePassThroughResult(file);
      }
      return {
        blob: res.blob,
        compressed: res.blob.size < file.size || res.resized,
        originalSize: file.size,
        finalSize: res.blob.size,
        ext: "webp",
        codec: "webp",
        fallbackUsed: false,
      };
    }

    // Primary path: WASM AVIF with automatic fallback to Canvas WebP.
    let avifFailed = false;
    try {
      const avifRes = await encodeWithAvif(decoded, file, encodeOpts);
      if (avifRes.blob.size < file.size || avifRes.resized) {
        return {
          blob: avifRes.blob,
          compressed: avifRes.blob.size < file.size || avifRes.resized,
          originalSize: file.size,
          finalSize: avifRes.blob.size,
          ext: "avif",
          codec: "avif",
          fallbackUsed: false,
        };
      }
      console.warn("AVIF output was not smaller than original; trying WebP fallback.");
      avifFailed = true;
    } catch (avifErr) {
      console.warn("AVIF Worker encoding failed; falling back to WebP:", avifErr);
      avifFailed = true;
    }

    if (avifFailed) {
      try {
        const webpRes = await encodeWithWebp(decoded, encodeOpts);
        if (webpRes.blob.size < file.size || webpRes.resized) {
          return {
            blob: webpRes.blob,
            compressed: webpRes.blob.size < file.size || webpRes.resized,
            originalSize: file.size,
            finalSize: webpRes.blob.size,
            ext: "webp",
            codec: "webp",
            fallbackUsed: true,
          };
        }
      } catch (webpErr) {
        console.warn("WebP fallback encoding failed; keeping original file:", webpErr);
      }
    }

    return makePassThroughResult(file, false);
  } finally {
    decoded.cleanup();
  }
}
