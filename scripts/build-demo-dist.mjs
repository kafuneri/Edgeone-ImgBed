#!/usr/bin/env node
import fs from "node:fs/promises";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..");
const PUBLIC_DIR = path.join(ROOT_DIR, "public");
const DEMO_SRC_IMG_DIR = path.join(PUBLIC_DIR, "img", "public");
const DIST_DIR = path.join(ROOT_DIR, "dist");

async function computeShortSha256(filePath) {
  const buf = await fs.readFile(filePath);
  return crypto.createHash("sha256").update(buf).digest("hex").slice(0, 16);
}

async function scanDemoFiles(dir, relPrefix = "public") {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relPath = relPrefix ? `${relPrefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      files.push(...(await scanDemoFiles(fullPath, relPath)));
    } else if (entry.isFile()) {
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
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

function buildDemoMockScript(seedFiles) {
  return `// Auto-generated pure-static demo API mock (no real backend or credentials)
(function () {
  const ORIGIN = window.location.origin;
  const SEED_FILES = ${JSON.stringify(seedFiles, null, 2)};
  const NOW = new Date().toISOString();

  let demoAuth = true;
  let folders = Array.from(new Set(SEED_FILES.map((f) => f.dir).filter(Boolean))).sort();
  let files = SEED_FILES.map((f, idx) => {
    // Show all 3 states in demo: mostly archived, plus 1 staging & 1 pending_delete
    let status = "archived";
    if (SEED_FILES.length >= 4 && idx === SEED_FILES.length - 1) status = "staging";
    else if (SEED_FILES.length >= 4 && idx === SEED_FILES.length - 2) status = "pending_delete";
    const encoded = f.path.split("/").map(encodeURIComponent).join("/");
    const url = ORIGIN + "/img/" + encoded;
    return {
      path: f.path,
      dir: f.dir,
      name: f.name,
      size: f.size,
      sha256: f.sha256,
      updatedAt: f.updatedAt || NOW,
      status,
      readonly: status !== "staging",
      url,
      markdown: "![" + f.name + "](" + url + ")",
    };
  });

  const pendingUploads = new Map();

  function jsonRes(data, status) {
    return new Response(JSON.stringify(data), {
      status: status || 200,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  }

  function rebuildFoldersFromFiles() {
    const set = new Set(folders);
    for (const f of files) {
      if (!f.dir) continue;
      const segs = f.dir.split("/");
      let acc = "";
      for (const s of segs) {
        acc = acc ? acc + "/" + s : s;
        set.add(acc);
      }
    }
    folders = Array.from(set).sort();
  }

  const realFetch = window.fetch.bind(window);
  window.fetch = async function (input, init) {
    const reqUrl = typeof input === "string" ? input : input?.url || "";
    const parsed = new URL(reqUrl, ORIGIN);
    const pathname = parsed.pathname;
    const method = ((init && init.method) || (typeof input === "object" && input.method) || "GET").toUpperCase();

    if (pathname.startsWith("/__demo_upload/")) {
      const relPath = decodeURIComponent(pathname.slice("/__demo_upload/".length));
      const body = init && init.body;
      let blobUrl = "";
      let size = 1024;
      if (body instanceof Blob) {
        blobUrl = URL.createObjectURL(body);
        size = body.size;
      }
      const parts = relPath.split("/");
      const name = parts.pop();
      const dir = parts.join("/");
      const fallbackUrl = blobUrl || ORIGIN + "/img/" + relPath.split("/").map(encodeURIComponent).join("/");
      files = files.filter((f) => f.path !== relPath);
      files.push({
        path: relPath,
        dir,
        name,
        size,
        sha256: "demo" + Date.now().toString(16),
        updatedAt: new Date().toISOString(),
        status: "staging",
        readonly: false,
        url: fallbackUrl,
        markdown: "![" + name + "](" + fallbackUrl + ")",
      });
      rebuildFoldersFromFiles();
      return new Response("", { status: 200 });
    }

    if (!pathname.startsWith("/api/")) {
      return realFetch(input, init);
    }

    let bodyObj = null;
    if (init && typeof init.body === "string") {
      try { bodyObj = JSON.parse(init.body); } catch {}
    }

    if (pathname === "/api/auth/me") {
      return jsonRes({ ok: true, authenticated: demoAuth });
    }
    if (pathname === "/api/auth/login" && method === "POST") {
      demoAuth = true;
      return jsonRes({ ok: true, token: "demo-session-token", message: "Demo 登录成功" });
    }
    if (pathname === "/api/auth/logout" && method === "POST") {
      demoAuth = false;
      return jsonRes({ ok: true });
    }

    if (pathname === "/api/files" && method === "GET") {
      rebuildFoldersFromFiles();
      const sorted = [...files].sort((a, b) => a.path.localeCompare(b.path));
      return jsonRes({
        ok: true,
        baseUrl: ORIGIN,
        folders,
        files: sorted,
        total: sorted.length,
        totalArchived: sorted.filter((f) => f.status === "archived").length,
        totalStaging: sorted.filter((f) => f.status === "staging").length,
        totalPendingDelete: sorted.filter((f) => f.status === "pending_delete").length,
        manifestUpdatedAt: NOW,
      });
    }

    if (pathname === "/api/gallery" && method === "GET") {
      const publicFiles = files.filter((f) => f.status !== "pending_delete" && (f.dir === "public" || f.dir.startsWith("public/")));
      return jsonRes({
        ok: true,
        enabled: true,
        dirs: ["public"],
        updatedAt: NOW,
        files: publicFiles,
      });
    }

    if (pathname === "/api/folders" && method === "POST") {
      const dir = String(bodyObj?.dir || "").trim().replace(/^\\/+|\\/+$/g, "");
      if (dir && !folders.includes(dir)) {
        const segs = dir.split("/");
        let acc = "";
        for (const s of segs) {
          acc = acc ? acc + "/" + s : s;
          if (!folders.includes(acc)) folders.push(acc);
        }
        folders.sort();
      }
      return jsonRes({ ok: true, folders });
    }

    if (pathname === "/api/folders" && method === "DELETE") {
      const target = String(parsed.searchParams.get("dir") || bodyObj?.dir || "").trim().replace(/^\\/+|\\/+$/g, "");
      folders = folders.filter((f) => f !== target && !f.startsWith(target + "/"));
      return jsonRes({ ok: true, folders });
    }

    if (pathname === "/api/upload/presign" && method === "POST") {
      const dir = String(bodyObj?.dir || "").trim().replace(/^\\/+|\\/+$/g, "");
      const name = String(bodyObj?.name || "demo.webp").trim();
      const relPath = dir ? dir + "/" + name : name;
      const url = ORIGIN + "/img/" + relPath.split("/").map(encodeURIComponent).join("/");
      pendingUploads.set(relPath, true);
      return jsonRes({
        ok: true,
        uploadUrl: ORIGIN + "/__demo_upload/" + encodeURIComponent(relPath),
        method: "PUT",
        headers: { "Content-Type": bodyObj?.contentType || "application/octet-stream" },
        path: relPath,
        url,
        markdown: "![" + name + "](" + url + ")",
      });
    }

    if (pathname === "/api/upload" && method === "POST") {
      const dir = String(parsed.searchParams.get("dir") || "").trim().replace(/^\\/+|\\/+$/g, "");
      const name = String(parsed.searchParams.get("name") || "demo_" + Date.now() + ".webp").trim();
      const relPath = dir ? dir + "/" + name : name;
      const url = ORIGIN + "/img/" + relPath.split("/").map(encodeURIComponent).join("/");
      files.push({
        path: relPath,
        dir,
        name,
        size: 2048,
        sha256: "demo" + Date.now().toString(16),
        updatedAt: new Date().toISOString(),
        status: "staging",
        readonly: false,
        url,
        markdown: "![" + name + "](" + url + ")",
      });
      rebuildFoldersFromFiles();
      return jsonRes({ ok: true, path: relPath, url, markdown: "![" + name + "](" + url + ")", status: "staging" });
    }

    if (pathname === "/api/blob/move" && method === "POST") {
      const fromPath = String(bodyObj?.fromPath || "").replace(/^\\/+/, "");
      const toDir = String(bodyObj?.toDir || "").trim().replace(/^\\/+|\\/+$/g, "");
      const target = files.find((f) => f.path === fromPath);
      if (!target) return jsonRes({ ok: false, error: "Not found" }, 404);
      const toName = String(bodyObj?.toName || target.name).trim();
      const newPath = toDir ? toDir + "/" + toName : toName;
      target.path = newPath;
      target.dir = toDir;
      target.name = toName;
      rebuildFoldersFromFiles();
      return jsonRes({ ok: true, oldPath: fromPath, newPath, url: target.url, markdown: target.markdown });
    }

    if (pathname === "/api/blob/delete" && method === "POST") {
      const p = String(bodyObj?.path || "").replace(/^\\/+/, "");
      files = files.filter((f) => f.path !== p);
      return jsonRes({ ok: true, message: "Demo 已删除暂存文件" });
    }

    if (pathname === "/api/archive/delete-queue" && method === "POST") {
      const action = bodyObj?.action === "remove" ? "remove" : "add";
      const list = Array.isArray(bodyObj?.paths) ? bodyObj.paths : bodyObj?.path ? [bodyObj.path] : [];
      const set = new Set(list.map((p) => String(p).replace(/^\\/+/, "")));
      files.forEach((f) => {
        if (!set.has(f.path)) return;
        if (action === "add" && f.status === "archived") f.status = "pending_delete";
        if (action === "remove" && f.status === "pending_delete") f.status = "archived";
      });
      return jsonRes({ ok: true, action, affected: set.size });
    }

    if (pathname === "/api/archive/trigger" && method === "POST") {
      files = files.filter((f) => f.status !== "pending_delete");
      files.forEach((f) => {
        if (f.status === "staging") {
          f.status = "archived";
          f.readonly = true;
        }
      });
      return jsonRes({ ok: true, message: "Demo 模式：已模拟完成归档与待删除清理" });
    }

    return jsonRes({ ok: false, error: "Demo mode: unsupported endpoint" }, 404);
  };
})();
`;
}

async function main() {
  await fs.rm(DIST_DIR, { recursive: true, force: true });
  await fs.mkdir(path.join(DIST_DIR, "img", "public"), { recursive: true });
  await fs.mkdir(path.join(DIST_DIR, "_meta"), { recursive: true });

  // Copy assets and demo media
  await fs.cp(path.join(PUBLIC_DIR, "assets"), path.join(DIST_DIR, "assets"), { recursive: true });
  await fs.cp(DEMO_SRC_IMG_DIR, path.join(DIST_DIR, "img", "public"), { recursive: true });

  const demoFiles = await scanDemoFiles(DEMO_SRC_IMG_DIR, "public");
  const manifest = {
    version: "2.0",
    updatedAt: new Date().toISOString(),
    total: demoFiles.length,
    files: demoFiles,
  };
  await fs.writeFile(path.join(DIST_DIR, "_meta", "manifest.json"), JSON.stringify(manifest, null, 2), "utf-8");

  // Write demo-mock.js
  await fs.writeFile(path.join(DIST_DIR, "assets", "demo-mock.js"), buildDemoMockScript(demoFiles), "utf-8");

  // Inject demo-mock.js into dist/index.html & dist/gallery.html
  const indexHtml = await fs.readFile(path.join(PUBLIC_DIR, "index.html"), "utf-8");
  const demoIndexHtml = indexHtml.replace(
    /<script type="module" src="\/assets\/app\.js\?v=([^"]+)"><\/script>/,
    '<script src="/assets/demo-mock.js?v=$1"></script>\n  <script type="module" src="/assets/app.js?v=$1"></script>'
  );
  await fs.writeFile(path.join(DIST_DIR, "index.html"), demoIndexHtml, "utf-8");

  const galleryHtml = await fs.readFile(path.join(PUBLIC_DIR, "gallery.html"), "utf-8");
  const demoGalleryHtml = galleryHtml.replace(
    /<script type="module" src="\/assets\/gallery\.js\?v=([^"]+)"><\/script>/,
    '<script src="/assets/demo-mock.js?v=$1"></script>\n  <script type="module" src="/assets/gallery.js?v=$1"></script>'
  );
  await fs.writeFile(path.join(DIST_DIR, "gallery.html"), demoGalleryHtml, "utf-8");

  console.log(`[demo-dist] ✅ Built pure static demo in ${DIST_DIR} with ${demoFiles.length} media files.`);
}

main().catch((err) => {
  console.error("[demo-dist] Failed:", err);
  process.exit(1);
});
