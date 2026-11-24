import { getArchivedManifest } from "../_utils/manifest.js";
import { formatImageUrls } from "../_utils/path.js";

function getPublicGalleryDirs(env = {}) {
  const raw =
    env.PUBLIC_GALLERY_DIRS ||
    (typeof process !== "undefined" && process?.env?.PUBLIC_GALLERY_DIRS) ||
    "";
  return String(raw)
    .split(",")
    .map((d) => d.trim().replace(/^\/+|\/+$/g, ""))
    .filter(Boolean);
}

function isDirAllowed(fileDir, allowedDirs) {
  const cleanDir = String(fileDir || "").replace(/^\/+|\/+$/g, "");
  return allowedDirs.some((allowed) => cleanDir === allowed || cleanDir.startsWith(`${allowed}/`));
}

export async function onRequestGet(context) {
  const { request, env = {} } = context;
  const allowedDirs = getPublicGalleryDirs(env);

  if (allowedDirs.length === 0) {
    return new Response(
      JSON.stringify({
        ok: true,
        enabled: false,
        dirs: [],
        files: [],
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "public, max-age=120",
        },
      }
    );
  }

  const manifest = await getArchivedManifest(request);
  const files = (manifest.files || [])
    .filter((item) => isDirAllowed(item.dir, allowedDirs))
    .map((item) => {
      const { url, markdown } = formatImageUrls(request, item.path, env);
      return {
        path: item.path,
        dir: item.dir || "",
        name: item.name || item.path.split("/").pop(),
        size: item.size || 0,
        updatedAt: item.updatedAt || manifest.updatedAt,
        url,
        markdown,
      };
    });

  return new Response(
    JSON.stringify({
      ok: true,
      enabled: true,
      dirs: allowedDirs,
      updatedAt: manifest.updatedAt || null,
      files,
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "public, max-age=300",
      },
    }
  );
}
