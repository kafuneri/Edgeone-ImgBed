#!/usr/bin/env node
import fs from "node:fs/promises";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..");
const IMG_DIR = path.join(ROOT_DIR, "public", "img");
const META_DIR = path.join(ROOT_DIR, "public", "_meta");
const MANIFEST_PATH = path.join(META_DIR, "manifest.json");

const ALLOWED_EXTS = new Set([
  ".webp", ".png", ".jpg", ".jpeg", ".gif", ".avif", ".jxl", ".svg", ".ico",
  ".mp4", ".mkv", ".mp3", ".m4a", ".txt", ".sh", ".zip",
]);

async function computeShortSha256(filePath) {
  const buf = await fs.readFile(filePath);
  return crypto.createHash("sha256").update(buf).digest("hex").slice(0, 16);
}

async function scanDirectory(dir, relPrefix = "") {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  let files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relPath = relPrefix ? `${relPrefix}/${entry.name}` : entry.name;

    if (entry.isDirectory()) {
      const subFiles = await scanDirectory(fullPath, relPath);
      files.push(...subFiles);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (ALLOWED_EXTS.has(ext)) {
        const [stats, sha256] = await Promise.all([
          fs.stat(fullPath),
          computeShortSha256(fullPath),
        ]);
        const dirPart = path.dirname(relPath);
        files.push({
          path: relPath.replace(/\\/g, "/"),
          dir: dirPart === "." ? "" : dirPart.replace(/\\/g, "/"),
          name: entry.name,
          size: stats.size,
          sha256,
          updatedAt: stats.mtime.toISOString(),
        });
      }
    }
  }

  return files;
}

async function main() {
  try {
    await fs.mkdir(IMG_DIR, { recursive: true });
    await fs.mkdir(META_DIR, { recursive: true });

    const files = await scanDirectory(IMG_DIR);
    // Sort alphabetically by path
    files.sort((a, b) => a.path.localeCompare(b.path));

    const manifest = {
      version: "2.0",
      updatedAt: new Date().toISOString(),
      total: files.length,
      files,
    };

    await fs.writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2), "utf-8");
    console.log(`[manifest] Successfully generated ${MANIFEST_PATH} with ${files.length} files.`);
  } catch (err) {
    console.error("[manifest] Error generating manifest:", err);
    process.exit(1);
  }
}

main();
