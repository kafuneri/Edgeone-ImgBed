/**
 * Manifest helper for reading static archived files
 */
import manifestData from "../../public/_meta/manifest.json" with { type: "json" };

/**
 * Get manifest containing all statically archived files
 */
export async function getArchivedManifest(request) {
  // If static JSON import succeeded, use it directly
  if (manifestData && Array.isArray(manifestData.files)) {
    return manifestData;
  }

  // Fallback to fetch if needed
  try {
    if (request && request.url) {
      const manifestUrl = new URL("/_meta/manifest.json", request.url);
      const res = await fetch(manifestUrl.toString(), {
        headers: { "Cache-Control": "no-cache" },
      });
      if (res.ok) {
        return await res.json();
      }
    }
  } catch {}

  return {
    updatedAt: new Date().toISOString(),
    total: 0,
    files: [],
  };
}

export function isArchived(relPath, manifest) {
  if (!manifest || !Array.isArray(manifest.files)) return false;
  const target = relPath.replace(/^\/+/, "");
  return manifest.files.some((f) => f.path === target);
}
