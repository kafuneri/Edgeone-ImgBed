import { verifyAuth } from "../_utils/auth.js";
import { getBlobStore, getCustomFolders, saveCustomFolders } from "../_utils/blob.js";
import { getArchivedManifest } from "../_utils/manifest.js";
import { sanitizeDir } from "../_utils/path.js";

export async function onRequestPost(context) {
  const request = context.request;
  const env = context.env || {};

  const isAuth = await verifyAuth(request, env);
  if (!isAuth) {
    return new Response(JSON.stringify({ ok: false, error: "未授权" }), {
      status: 401,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  }

  try {
    const body = await request.json();
    const cleanDir = sanitizeDir(body.dir);
    if (!cleanDir) {
      return new Response(JSON.stringify({ ok: false, error: "文件夹名称不能为空" }), {
        status: 400,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      });
    }

    const store = getBlobStore(env);
    const folders = await getCustomFolders(store);

    if (!folders.includes(cleanDir)) {
      folders.push(cleanDir);
      // Automatically include parent folders
      const segments = cleanDir.split("/");
      let parent = "";
      for (let i = 0; i < segments.length - 1; i++) {
        parent = parent ? `${parent}/${segments[i]}` : segments[i];
        if (!folders.includes(parent)) {
          folders.push(parent);
        }
      }
      await saveCustomFolders(store, folders);
    }

    return new Response(JSON.stringify({ ok: true, folders }), {
      status: 200,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: err.message }), {
      status: 400,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  }
}

export async function onRequestDelete(context) {
  const request = context.request;
  const env = context.env || {};

  const isAuth = await verifyAuth(request, env);
  if (!isAuth) {
    return new Response(JSON.stringify({ ok: false, error: "未授权" }), {
      status: 401,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  }

  try {
    const url = new URL(request.url);
    let targetDir = url.searchParams.get("dir");
    if (!targetDir) {
      try {
        const body = await request.json();
        targetDir = body.dir;
      } catch {}
    }

    const cleanDir = sanitizeDir(targetDir);
    if (!cleanDir) {
      return new Response(JSON.stringify({ ok: false, error: "目标文件夹无效" }), {
        status: 400,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      });
    }

    const store = getBlobStore(env);
    const [manifest, blobs, customFolders] = await Promise.all([
      getArchivedManifest(request),
      store.list({ prefix: `img/${cleanDir}/`, consistency: "strong" }),
      getCustomFolders(store),
    ]);

    // Check if archived files exist in this dir
    const hasArchived = manifest.files.some(
      (f) => f.dir === cleanDir || f.dir.startsWith(`${cleanDir}/`)
    );
    if (hasArchived) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "该文件夹下包含已归档文件，禁止删除。请在 GitHub 仓库中管理。",
        }),
        {
          status: 409,
          headers: { "Content-Type": "application/json; charset=utf-8" },
        }
      );
    }

    // Check if staging blobs exist in this dir
    if (blobs.blobs && blobs.blobs.length > 0) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "该文件夹非空（包含暂存图片），无法删除。",
        }),
        {
          status: 409,
          headers: { "Content-Type": "application/json; charset=utf-8" },
        }
      );
    }

    // Filter out target folder and its subfolders
    const newFolders = customFolders.filter(
      (f) => f !== cleanDir && !f.startsWith(`${cleanDir}/`)
    );
    await saveCustomFolders(store, newFolders);

    return new Response(JSON.stringify({ ok: true, folders: newFolders }), {
      status: 200,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: err.message }), {
      status: 400,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  }
}
