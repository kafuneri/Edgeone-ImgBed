import { verifyUploadOrReadAuth } from "../_utils/auth.js";
import {
  getBlobStore,
  listStagingBlobs,
  getCustomFolders,
  getPendingDeletes,
  getBlobStat,
} from "../_utils/blob.js";
import { getArchivedManifest } from "../_utils/manifest.js";
import { formatImageUrls } from "../_utils/path.js";

function collectFolderHierarchy(allDirs) {
  const folderSet = new Set();
  for (const d of allDirs) {
    if (!d) continue;
    const segments = d.split("/").filter(Boolean);
    let cur = "";
    for (const seg of segments) {
      cur = cur ? `${cur}/${seg}` : seg;
      folderSet.add(cur);
    }
  }
  return Array.from(folderSet).sort();
}

export async function onRequestGet(context) {
  const request = context.request;
  const env = context.env || {};

  const isAuth = await verifyUploadOrReadAuth(request, env);
  if (!isAuth) {
    return new Response(
      JSON.stringify({ ok: false, error: "未授权，请先登录" }),
      {
        status: 401,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      }
    );
  }

  const store = getBlobStore(env);

  // Read archived manifest, staging blobs, custom folders, and pending deletes in parallel
  const [manifest, stagingBlobs, customFolders, pendingDeletes] = await Promise.all([
    getArchivedManifest(request),
    listStagingBlobs(store),
    getCustomFolders(store),
    getPendingDeletes(store),
  ]);

  const pendingDeleteSet = new Set(pendingDeletes);
  const fileMap = new Map();
  const dirSet = new Set(customFolders);

  // 1. Process archived files (status: archived | pending_delete)
  if (Array.isArray(manifest.files)) {
    for (const item of manifest.files) {
      const relPath = item.path;
      const { url, markdown } = formatImageUrls(request, relPath, env);
      if (item.dir) dirSet.add(item.dir);

      const isPendingDelete = pendingDeleteSet.has(relPath);
      fileMap.set(relPath, {
        path: relPath,
        dir: item.dir || "",
        name: item.name || relPath.split("/").pop(),
        size: item.size || 0,
        sha256: item.sha256 || "",
        updatedAt: item.updatedAt || manifest.updatedAt,
        status: isPendingDelete ? "pending_delete" : "archived",
        readonly: true,
        url,
        markdown,
      });
    }
  }

  // 2. Process staging blobs (status: staging, readonly: false)
  const pendingBlobs = [];
  for (const blob of stagingBlobs) {
    // Blob key format: "img/<relPath>"
    if (!blob.key.startsWith("img/")) continue;
    const relPath = blob.key.slice(4);
    if (!relPath) continue;

    // If already in manifest, keep archived status
    if (fileMap.has(relPath)) continue;
    pendingBlobs.push({ blob, relPath });
  }

  // Fetch real size & last-modified via HEAD in bounded parallel batches
  const BATCH_SIZE = 8;
  for (let i = 0; i < pendingBlobs.length; i += BATCH_SIZE) {
    const batch = pendingBlobs.slice(i, i + BATCH_SIZE);
    const stats = await Promise.all(
      batch.map(({ blob }) => getBlobStat(store, blob.key))
    );
    batch.forEach(({ blob, relPath }, idx) => {
      const parts = relPath.split("/");
      const name = parts.pop();
      const dir = parts.join("/");
      if (dir) dirSet.add(dir);

      const { url, markdown } = formatImageUrls(request, relPath, env);
      const stat = stats[idx];

      fileMap.set(relPath, {
        path: relPath,
        dir,
        name,
        size: stat.size || blob.size || 0,
        updatedAt: stat.updatedAt || blob.uploadedAt || new Date().toISOString(),
        status: "staging",
        readonly: false,
        url,
        markdown,
      });
    });
  }

  const files = Array.from(fileMap.values()).sort((a, b) =>
    a.path.localeCompare(b.path)
  );

  const folders = collectFolderHierarchy(dirSet);
  const totalArchived = files.filter((f) => f.status === "archived").length;
  const totalStaging = files.filter((f) => f.status === "staging").length;
  const totalPendingDelete = files.filter((f) => f.status === "pending_delete").length;

  let origin = env.PUBLIC_BASE_URL;
  if (!origin) {
    const u = new URL(request.url);
    origin = u.origin;
  }

  return new Response(
    JSON.stringify({
      ok: true,
      baseUrl: origin,
      folders,
      files,
      total: files.length,
      totalArchived,
      totalStaging,
      totalPendingDelete,
      manifestUpdatedAt: manifest?.updatedAt || null,
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    }
  );
}
