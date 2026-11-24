/**
 * Path and Filename Security Validation and Sanitization
 */

export const ALLOWED_EXTS = new Set([
  "webp", "png", "jpg", "jpeg", "gif", "avif", "jxl", "svg", "ico",
  "mp4", "mkv", "mp3", "m4a", "txt", "sh", "zip",
]);

export const MIME_MAP = {
  webp: "image/webp",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  avif: "image/avif",
  jxl: "image/jxl",
  svg: "image/svg+xml",
  ico: "image/x-icon",
  mp4: "video/mp4",
  mkv: "video/x-matroska",
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  txt: "text/plain; charset=utf-8",
  sh: "text/plain; charset=utf-8",
  zip: "application/zip",
};

const MIME_TO_EXT = {
  "image/webp": "webp",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/gif": "gif",
  "image/avif": "avif",
  "image/jxl": "jxl",
  "image/svg+xml": "svg",
  "image/x-icon": "ico",
  "image/vnd.microsoft.icon": "ico",
  "video/mp4": "mp4",
  "video/x-matroska": "mkv",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/m4a": "m4a",
  "text/plain": "txt",
  "text/x-sh": "sh",
  "text/x-shellscript": "sh",
  "application/x-sh": "sh",
  "application/zip": "zip",
  "application/x-zip-compressed": "zip",
  "multipart/x-zip": "zip",
};

/**
 * Map a Content-Type header value to a supported file extension
 */
export function mimeToExt(contentType = "", fallback = "webp") {
  const cleanMime = String(contentType).split(";")[0].trim().toLowerCase();
  if (!cleanMime || cleanMime === "application/octet-stream") {
    return fallback;
  }
  if (MIME_TO_EXT[cleanMime]) {
    return MIME_TO_EXT[cleanMime];
  }
  const sub = cleanMime.split("/").pop();
  if (sub && ALLOWED_EXTS.has(sub)) {
    return sub === "jpeg" ? "jpg" : sub;
  }
  return fallback;
}

/**
 * Clean and validate folder directory path
 * Prohibits '..', '.', '\', '//'
 * Max 5 levels of directories
 */
export function sanitizeDir(rawDir = "") {
  if (!rawDir) return "";
  let clean = String(rawDir).trim().replace(/\\/g, "/");

  // Remove leading and trailing slashes
  clean = clean.replace(/^\/+|\/+$/g, "");
  if (!clean) return "";

  // Prohibit illegal path traversal characters
  if (clean.includes("..") || clean.includes("./") || clean.includes("/.")) {
    throw new Error("Invalid directory path: Directory traversal characters ('..', '.') are not allowed");
  }
  if (clean.includes("//")) {
    throw new Error("Invalid directory path: Consecutive slashes are not allowed");
  }

  const segments = clean.split("/");
  if (segments.length > 5) {
    throw new Error("Directory depth exceeds maximum limit of 5 levels");
  }

  // Segment character validation: letters, numbers, _, -, and common CJK chars
  const validSegmentPattern = /^[\w\-\u4e00-\u9fa5]{1,64}$/;
  for (const seg of segments) {
    if (!validSegmentPattern.test(seg)) {
      throw new Error(`Invalid directory name '${seg}': Only alphanumeric, underscore, hyphen and Chinese characters (1-64 chars) are permitted`);
    }
  }

  return segments.join("/");
}

/**
 * Extract extension from a filename
 */
export function getExtension(name = "") {
  const idx = name.lastIndexOf(".");
  if (idx === -1 || idx === name.length - 1) return "";
  return name.slice(idx + 1).toLowerCase();
}

/**
 * Clean and validate file name
 */
export function sanitizeFileName(rawName = "", defaultExt = "webp") {
  let name = String(rawName).trim().replace(/\\/g, "/");
  // If user provided a path in filename, strip leading directories
  if (name.includes("/")) {
    name = name.split("/").pop();
  }

  let ext = getExtension(name);
  let base = ext ? name.slice(0, name.lastIndexOf(".")) : name;

  if (!ext) {
    ext = defaultExt.replace(/^\./, "").toLowerCase();
  }

  if (!ALLOWED_EXTS.has(ext)) {
    throw new Error(`File extension '.${ext}' is not supported. Allowed: ${Array.from(ALLOWED_EXTS).join(", ")}`);
  }

  // Clean base name: alphanumeric, hyphen, underscore, Chinese
  base = base.replace(/[^\w\-\u4e00-\u9fa5]/g, "_").slice(0, 64);
  if (!base) {
    base = `img_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  }

  return `${base}.${ext}`;
}

/**
 * Validate and construct complete paths:
 * Returns: { relPath, blobKey, dir, name, ext, mime }
 */
export function resolveImagePath(dir = "", name = "", defaultExt = "webp", enforceExt = "") {
  const cleanDir = sanitizeDir(dir);
  let cleanName = sanitizeFileName(name, defaultExt);

  const currentExt = getExtension(cleanName);
  if (enforceExt && ALLOWED_EXTS.has(enforceExt.toLowerCase())) {
    const cleanEnforce = enforceExt.toLowerCase() === "jpeg" ? "jpg" : enforceExt.toLowerCase();
    if (!(currentExt === "sh" && cleanEnforce === "txt")) {
      cleanName = cleanName.replace(/\.[^.]+$/, `.${cleanEnforce}`);
    }
  }

  const ext = getExtension(cleanName);
  const mime = MIME_MAP[ext] || "application/octet-stream";

  const relPath = cleanDir ? `${cleanDir}/${cleanName}` : cleanName;
  const blobKey = `img/${relPath}`;

  return {
    dir: cleanDir,
    name: cleanName,
    ext,
    mime,
    relPath,
    blobKey,
  };
}

/**
 * Build absolute public URL and Markdown snippet
 */
export function formatImageUrls(request, relPath, env = {}) {
  let origin = env.PUBLIC_BASE_URL;
  if (!origin) {
    const url = new URL(request.url);
    origin = url.origin;
  }
  // Trim trailing slash
  origin = origin.replace(/\/+$/, "");
  const encodedRelPath = relPath
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");
  const fullUrl = `${origin}/img/${encodedRelPath}`;
  const fileName = relPath.split("/").pop();
  const ext = getExtension(fileName);

  let markdown;
  if (ext === "mp4" || ext === "mkv") {
    markdown = `<video src="${fullUrl}" controls width="100%"></video>`;
  } else if (ext === "mp3" || ext === "m4a") {
    markdown = `<audio src="${fullUrl}" controls></audio>`;
  } else if (ext === "txt" || ext === "sh" || ext === "zip") {
    markdown = `[${fileName}](${fullUrl})`;
  } else {
    markdown = `![${fileName}](${fullUrl})`;
  }

  return { url: fullUrl, markdown };
}
