import { getBlobStore } from "../_utils/blob.js";
import { MIME_MAP, getExtension } from "../_utils/path.js";

/**
 * Public Fallback Image Serving:
 * Triggered ONLY when static file in /public/img/... does not exist.
 */
function extractRelPath(context) {
  const pathSegments = context.params?.path;
  let relPath = Array.isArray(pathSegments)
    ? pathSegments.join("/")
    : pathSegments || "";

  if (!relPath) {
    const url = new URL(context.request.url);
    const prefix = "/img/";
    const idx = url.pathname.indexOf(prefix);
    if (idx !== -1) {
      relPath = url.pathname.slice(idx + prefix.length);
    }
  }

  try {
    relPath = decodeURIComponent(relPath);
  } catch {
    return "";
  }
  relPath = relPath.replace(/^\/+|\/+$/g, "");
  if (!relPath || relPath.includes("..") || relPath.includes("./") || relPath.includes("//")) {
    return "";
  }
  return relPath;
}

function buildResponseHeaders(relPath) {
  const ext = getExtension(relPath);
  const contentType = MIME_MAP[ext] || "application/octet-stream";
  return {
    "Content-Type": contentType,
    "Cache-Control": "public, max-age=600",
    "X-Image-Source": "blob",
    "X-Content-Type-Options": "nosniff",
    "Access-Control-Allow-Origin": "*",
  };
}

export async function onRequestHead(context) {
  const relPath = extractRelPath(context);
  if (!relPath) {
    return new Response(null, { status: 404 });
  }

  const store = getBlobStore(context.env || {});
  const blobKey = `img/${relPath}`;
  let meta = null;

  for (const consistency of ["eventual", "strong"]) {
    try {
      meta = await store.getMetadata(blobKey, { consistency });
      if (meta) break;
    } catch {
      // Fall back to strong consistency.
    }
  }

  if (!meta) {
    return new Response(null, { status: 404 });
  }

  const headers = buildResponseHeaders(relPath);
  if (meta.etag) headers.ETag = meta.etag;
  return new Response(null, { status: 200, headers });
}

export async function onRequestGet(context) {
  const relPath = extractRelPath(context);
  if (!relPath) {
    return new Response("Not Found", {
      status: 404,
      headers: {
        "Content-Type": "text/plain",
        "Cache-Control": "public, max-age=60",
      },
    });
  }

  const store = getBlobStore(context.env || {});
  const blobKey = `img/${relPath}`;
  let stream = null;
  let lastErr = null;

  // 1. Try reading stream with eventual consistency (CDN cached), fallback to strong consistency.
  for (const consistency of ["eventual", "strong"]) {
    try {
      stream = await store.get(blobKey, {
        type: "stream",
        consistency,
      });
      if (stream) {
        lastErr = null;
        break;
      }
    } catch (err) {
      lastErr = err;
      console.warn(`[img] Could not retrieve blob '${blobKey}' (${consistency}):`, err?.message || err);
    }
  }

  if (!stream) {
    if (lastErr) {
      return new Response(`Blob Read Error: ${lastErr.message || "stream failed"}`, {
        status: 502,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-store",
        },
      });
    }
    return new Response("Image Not Found", {
      status: 404,
      headers: {
        "Content-Type": "text/plain",
        "Cache-Control": "public, max-age=60",
      },
    });
  }

  return new Response(stream, {
    status: 200,
    headers: buildResponseHeaders(relPath),
  });
}
