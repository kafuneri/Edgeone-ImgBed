import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const wasmPath = fileURLToPath(new URL("../public/assets/avif/avif_enc.wasm", import.meta.url));
const moduleUrl = new URL("../public/assets/avif/avif_enc.js", import.meta.url).href;

function makeRgbaPattern(width, height) {
  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const checker = ((x >> 3) ^ (y >> 3)) & 1;
      rgba[idx] = checker ? (x * 4) & 0xff : (255 - x * 3) & 0xff;
      rgba[idx + 1] = (y * 4) & 0xff;
      rgba[idx + 2] = checker ? 180 : 60;
      rgba[idx + 3] = 255;
    }
  }
  return rgba;
}

function assertAvifHeader(bytes) {
  assert.ok(bytes instanceof Uint8Array, "output should be Uint8Array");
  assert.ok(bytes.byteLength > 32, `output too small: ${bytes.byteLength}`);
  const header = Buffer.from(bytes.slice(4, 32)).toString("ascii");
  assert.equal(header.slice(0, 4), "ftyp", `expected ftyp box, got ${header.slice(0, 8)}`);
  assert.ok(header.includes("avif"), `expected avif brand in ftyp box, got ${header}`);
}

test("WASM AVIF encoder initializes and encodes 64x64 RGBA buffer across repeated calls", async () => {
  const { default: avifEnc } = await import(moduleUrl);
  const wasmBinary = readFileSync(wasmPath);
  const encoder = await avifEnc({
    wasmBinary,
    locateFile: (p) => fileURLToPath(new URL(`../public/assets/avif/${p}`, import.meta.url)),
  });

  const rgba = makeRgbaPattern(64, 64);
  const baseOptions = {
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

  const outHigh = encoder.encode(rgba, 64, 64, { ...baseOptions, quality: 62 });
  assert.ok(outHigh, "first AVIF encode returned null");
  const copyHigh = new Uint8Array(outHigh);
  assertAvifHeader(copyHigh);

  const outLow = encoder.encode(rgba, 64, 64, { ...baseOptions, quality: 35 });
  assert.ok(outLow, "second AVIF encode returned null");
  const copyLow = new Uint8Array(outLow);
  assertAvifHeader(copyLow);

  assert.notEqual(copyHigh.byteLength, copyLow.byteLength, "quality change should alter encoded size");
});
