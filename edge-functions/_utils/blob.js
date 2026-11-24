import { getStore } from "@edgeone/pages-blob";

const DEFAULT_STORE_NAME = "blog-images";
const FOLDERS_KEY = "_meta/folders.json";
const PENDING_DELETES_KEY = "_meta/pending-deletes.json";

/**
 * Obtain a Store instance within Edge Functions
 */
export function getBlobStore(env = {}) {
  const storeName = env.BLOB_STORE_NAME || DEFAULT_STORE_NAME;
  return getStore(storeName);
}

/**
 * List all staging images from Blob with strong consistency
 */
export async function listStagingBlobs(store) {
  try {
    const result = await store.list({ prefix: "img/", consistency: "strong" });
    return result.blobs || [];
  } catch (err) {
    console.error("[blob] listStagingBlobs error:", err);
    return [];
  }
}

/**
 * Retrieve user-created empty/custom folders list from Blob
 */
export async function getCustomFolders(store) {
  try {
    const data = await store.get(FOLDERS_KEY, { type: "json", consistency: "strong" });
    if (data && Array.isArray(data.folders)) {
      return data.folders;
    }
    return [];
  } catch {
    return [];
  }
}

/**
 * Save user-created empty/custom folders list to Blob
 */
export async function saveCustomFolders(store, folders) {
  const uniqueFolders = Array.from(new Set(folders.filter(Boolean))).sort();
  await store.setJSON(FOLDERS_KEY, { folders: uniqueFolders });
  return uniqueFolders;
}

/**
 * Retrieve pending-delete archived file paths from Blob
 */
export async function getPendingDeletes(store) {
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

/**
 * Save pending-delete archived file paths to Blob
 */
export async function savePendingDeletes(store, paths) {
  const uniquePaths = Array.from(
    new Set(paths.map((p) => String(p || "").trim().replace(/^\/+/, "")).filter(Boolean))
  ).sort();
  await store.setJSON(PENDING_DELETES_KEY, { paths: uniquePaths });
  return uniquePaths;
}

/**
 * Check whether a Blob key exists with strong consistency
 */
export async function checkBlobExists(store, key) {
  try {
    const meta = await store.getMetadata(key, { consistency: "strong" });
    return meta !== null;
  } catch {
    return false;
  }
}

/**
 * Retrieve real size (bytes) and last-modified timestamp for a Blob key via HEAD
 */
export async function getBlobStat(store, key) {
  try {
    const meta = await store.getMetadata(key, { consistency: "strong" });
    if (!meta || !meta.headers) return { size: 0, updatedAt: null };
    const size = Number(meta.headers["content-length"] || 0);
    const lastMod = meta.headers["last-modified"];
    const updatedAt = lastMod ? new Date(lastMod).toISOString() : null;
    return {
      size: Number.isFinite(size) ? size : 0,
      updatedAt,
    };
  } catch {
    return { size: 0, updatedAt: null };
  }
}
