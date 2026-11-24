#!/usr/bin/env node
import fs from "node:fs/promises";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getStore } from "@edgeone/pages-blob";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..");
const PUBLIC_DIR = path.join(ROOT_DIR, "public");
const IMG_DIR = path.join(PUBLIC_DIR, "img");
const MANIFEST_PATH = path.join(PUBLIC_DIR, "_meta", "manifest.json");

const ALLOWED_EXTS = new Set([
  ".webp", ".png", ".jpg", ".jpeg", ".gif", ".avif", ".jxl", ".svg", ".ico",
  ".mp4", ".mkv", ".mp3", ".m4a", ".txt", ".sh", ".zip",
]);

const args = process.argv.slice(2);
const isDryRun = args.includes("--dry-run");
const isManifestOnly = args.includes("--manifest-only");

const BLOB_CLEANUP_MIN_AGE_MS = 10 * 60 * 1000; // 10 minutes safety buffer for recent deploys

async function computeShortSha256(filePath) {
  const buf = await fs.readFile(filePath);
  return crypto.createHash("sha256").update(buf).digest("hex").slice(0, 16);
}

async function scanDirectory(dir, relPrefix = "") {
  try {
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
  } catch (err) {
    if (err.code === "ENOENT") return [];
    throw err;
  }
}

async function updateManifest() {
  await fs.mkdir(path.dirname(MANIFEST_PATH), { recursive: true });
  const files = await scanDirectory(IMG_DIR);
  files.sort((a, b) => a.path.localeCompare(b.path));

  const manifest = {
    version: "2.0",
    updatedAt: new Date().toISOString(),
    total: files.length,
    files,
  };

  await fs.writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2), "utf-8");
  console.log(`[manifest] 静态索引已刷新: 共 ${files.length} 个文件落盘。`);
  return files;
}

const PENDING_DELETES_KEY = "_meta/pending-deletes.json";

async function readPendingDeletesFromBlob(store) {
  try {
    const data = await store.get(PENDING_DELETES_KEY, { type: "json", consistency: "strong" });
    if (data && Array.isArray(data.paths)) {
      return data.paths.map((p) => String(p || "").trim().replace(/^\/+/, "")).filter(Boolean);
    }
    return [];
  } catch {
    return [];
  }
}

async function removeEmptyParentDirs(filePath) {
  let dir = path.dirname(filePath);
  while (dir.startsWith(IMG_DIR) && dir !== IMG_DIR) {
    try {
      const entries = await fs.readdir(dir);
      if (entries.length > 0) break;
      await fs.rmdir(dir);
      dir = path.dirname(dir);
    } catch {
      break;
    }
  }
}

async function processPendingDeletes(store, existingBlobs) {
  const pendingDeletes = await readPendingDeletesFromBlob(store);
  if (pendingDeletes.length === 0) return;

  console.log(`[delete-queue] 发现 ${pendingDeletes.length} 个待删除已归档文件，开始清理...`);
  const existingBlobKeys = new Set(existingBlobs.map((b) => b.key));
  const processedPaths = new Set();

  for (const relPath of pendingDeletes) {
    const targetPath = path.resolve(IMG_DIR, relPath);
    if (!targetPath.startsWith(`${IMG_DIR}${path.sep}`)) {
      console.warn(`[delete-queue] 跳过非法路径: ${relPath}`);
      continue;
    }

    if (isDryRun) {
      console.log(`[dry-run] 将删除静态文件: ${targetPath}`);
      continue;
    }

    try {
      await fs.unlink(targetPath);
      await removeEmptyParentDirs(targetPath);
      console.log(`[delete-queue] 🗑️ 已从仓库删除: public/img/${relPath}`);
      processedPaths.add(relPath);
    } catch (err) {
      if (err.code === "ENOENT") {
        console.log(`[delete-queue] 文件已不存在，直接移出队列: public/img/${relPath}`);
        processedPaths.add(relPath);
      } else {
        console.error(`[delete-queue] ❌ 删除失败 ${relPath}:`, err.message);
      }
    }

    // Also remove any lingering Blob copy if present
    const blobKey = `img/${relPath}`;
    if (existingBlobKeys.has(blobKey)) {
      try {
        await store.delete(blobKey);
        console.log(`[delete-queue] 🗑️ 已同步清理 Blob 副本: ${blobKey}`);
      } catch {}
    }
  }

  if (!isDryRun && processedPaths.size > 0) {
    // Re-read to avoid losing items added/removed concurrently during this run
    const latestQueue = await readPendingDeletesFromBlob(store);
    const remaining = latestQueue.filter((p) => !processedPaths.has(p));
    await store.setJSON(PENDING_DELETES_KEY, { paths: remaining });
    console.log(`[delete-queue] 已更新待删除队列，剩余 ${remaining.length} 项。`);
  }
}

async function readExistingManifest() {
  try {
    const raw = await fs.readFile(MANIFEST_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    return {
      updatedAt: parsed.updatedAt || null,
      files: Array.isArray(parsed.files) ? parsed.files : [],
    };
  } catch (err) {
    if (err.code === "ENOENT") return { updatedAt: null, files: [] };
    throw err;
  }
}

async function main() {
  console.log("=== EdgeOne ImgBed 自动归档工作流 ===");

  if (isManifestOnly) {
    console.log("[mode] 仅刷新 manifest.json");
    await updateManifest();
    return;
  }

  const projectId = process.env.EO_PROJECT_ID;
  const token = process.env.EO_API_TOKEN;
  const storeName = process.env.BLOB_STORE_NAME || "blog-images";

  if (!projectId || !token) {
    console.warn("[warn] 未检测到 EO_PROJECT_ID 或 EO_API_TOKEN，跳过 Blob 外部拉取，仅刷新本地 manifest。");
    await updateManifest();
    return;
  }

  const store = getStore({
    name: storeName,
    projectId,
    token,
    consistency: "strong",
  });

  const existingManifest = await readExistingManifest();
  const archivedSet = new Set(existingManifest.files.map((f) => f.path));

  console.log(`[blob] 正在从 Blob Store '${storeName}' 获取文件列表...`);
  const listRes = await store.list({ prefix: "img/", consistency: "strong" });
  const blobs = (listRes.blobs || []).filter((b) => b.key.startsWith("img/") && b.key.length > 4);
  console.log(`[blob] 发现 ${blobs.length} 个 Blob 文件。`);

  const previouslyArchivedBlobs = [];
  const pendingBlobs = [];
  for (const blob of blobs) {
    const relPath = blob.key.slice(4);
    if (archivedSet.has(relPath)) {
      previouslyArchivedBlobs.push(blob);
    } else {
      pendingBlobs.push(blob);
    }
  }

  // 1. Delete blobs that were already archived in a previous run (safe delay ensures CDN propagation)
  if (previouslyArchivedBlobs.length > 0) {
    const updatedTime = existingManifest.updatedAt ? Date.parse(existingManifest.updatedAt) : 0;
    const manifestAgeMs = Number.isFinite(updatedTime) ? Date.now() - updatedTime : Infinity;

    if (isDryRun) {
      console.log(`[dry-run] 将清理上次已归档的 ${previouslyArchivedBlobs.length} 个旧 Blob 副本。`);
    } else if (manifestAgeMs < BLOB_CLEANUP_MIN_AGE_MS) {
      const waitMins = Math.ceil((BLOB_CLEANUP_MIN_AGE_MS - manifestAgeMs) / 60000);
      console.log(
        `[cleanup] 上次归档距今不足 10 分钟，暂跳过 ${previouslyArchivedBlobs.length} 个旧 Blob 清理（约 ${waitMins} 分钟后再运行可安全释放）。`
      );
    } else {
      console.log(`[cleanup] 正在清理上次已归档的 ${previouslyArchivedBlobs.length} 个旧 Blob 副本...`);
      for (const blob of previouslyArchivedBlobs) {
        try {
          await store.delete(blob.key);
          console.log(`[cleanup] 🗑️ 已释放旧 Blob: ${blob.key}`);
        } catch (delErr) {
          console.warn(`[cleanup] 删除旧 Blob ${blob.key} 失败:`, delErr.message);
        }
      }
    }
  }

  // 2. Download newly staged blobs into public/img/ (kept in Blob until next run so CDN sync has zero 404 window)
  if (pendingBlobs.length === 0) {
    console.log("[blob] 暂无新文件需要归档。");
  } else {
    console.log(`[download] 发现 ${pendingBlobs.length} 个待归档新文件，开始下载落盘（本次保留 Blob 副本至下次运行再清理）...`);
    for (const blob of pendingBlobs) {
      const destPath = path.join(PUBLIC_DIR, blob.key);

      if (isDryRun) {
        console.log(`[dry-run] 将下载 ${blob.key} -> ${destPath}`);
        continue;
      }

      try {
        await fs.mkdir(path.dirname(destPath), { recursive: true });
        const buf = await store.get(blob.key, {
          type: "arrayBuffer",
          consistency: "strong",
        });

        if (buf) {
          await fs.writeFile(destPath, Buffer.from(buf));
          console.log(`[download] ✅ 已落盘: ${blob.key} (${buf.byteLength} bytes)`);
        }
      } catch (err) {
        console.error(`[download] ❌ 下载 ${blob.key} 失败:`, err.message);
      }
    }
  }

  // 3. Process pending-delete archived files from Blob queue
  await processPendingDeletes(store, blobs);

  // 4. Update manifest with newly downloaded & deleted files
  await updateManifest();
  console.log("=== 归档任务执行完成 ===");
}

main().catch((err) => {
  console.error("归档脚本异常退出:", err);
  process.exit(1);
});
