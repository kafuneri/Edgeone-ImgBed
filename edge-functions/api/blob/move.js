import { verifyAuth } from "../../_utils/auth.js";
import { getBlobStore, checkBlobExists, getCustomFolders, saveCustomFolders } from "../../_utils/blob.js";
import { getArchivedManifest, isArchived } from "../../_utils/manifest.js";
import { resolveImagePath, formatImageUrls, sanitizeDir } from "../../_utils/path.js";

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
    const { fromPath, toDir, toName, overwrite } = body || {};

    if (!fromPath) {
      return new Response(JSON.stringify({ ok: false, error: "缺少原文件路径 fromPath" }), {
        status: 400,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      });
    }

    const cleanFrom = fromPath.replace(/^\/+/, "");
    const manifest = await getArchivedManifest(request);

    // 1. Check if fromPath is archived
    if (isArchived(cleanFrom, manifest)) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "已归档图片属于只读状态，严禁移动或重命名以防破坏历史博文！如需调整请直接在 GitHub 仓库中操作。",
        }),
        {
          status: 403,
          headers: { "Content-Type": "application/json; charset=utf-8" },
        }
      );
    }

    const store = getBlobStore(env);
    const oldBlobKey = `img/${cleanFrom}`;
    const existsOld = await checkBlobExists(store, oldBlobKey);
    if (!existsOld) {
      return new Response(
        JSON.stringify({ ok: false, error: `暂存区未找到源文件 '${cleanFrom}'` }),
        {
          status: 404,
          headers: { "Content-Type": "application/json; charset=utf-8" },
        }
      );
    }

    // 2. Resolve destination path
    const fallbackName = cleanFrom.split("/").pop();
    const fallbackExt = fallbackName.includes(".")
      ? fallbackName.split(".").pop()
      : "webp";
    const targetName = toName || fallbackName;
    const { relPath: toRelPath, blobKey: toBlobKey, dir: cleanToDir } = resolveImagePath(
      toDir !== undefined ? toDir : "",
      targetName,
      fallbackExt
    );

    if (toRelPath === cleanFrom) {
      return new Response(
        JSON.stringify({ ok: false, error: "目标路径与原路径相同，无需移动" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json; charset=utf-8" },
        }
      );
    }

    // 3. Destination conflict checks
    if (isArchived(toRelPath, manifest)) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: `目标文件 '${toRelPath}' 已在已归档静态列表中存在，禁止覆盖！`,
        }),
        {
          status: 409,
          headers: { "Content-Type": "application/json; charset=utf-8" },
        }
      );
    }

    if (!overwrite) {
      const existsDest = await checkBlobExists(store, toBlobKey);
      if (existsDest) {
        return new Response(
          JSON.stringify({
            ok: false,
            error: `目标文件 '${toRelPath}' 已在暂存区存在，如需覆盖请开启 overwrite 选项`,
          }),
          {
            status: 409,
            headers: { "Content-Type": "application/json; charset=utf-8" },
          }
        );
      }
    }

    // 4. Perform Move: Get binary with strong consistency -> Set to new key -> Delete old key
    const fileBuf = await store.get(oldBlobKey, {
      type: "arrayBuffer",
      consistency: "strong",
    });

    if (!fileBuf) {
      return new Response(
        JSON.stringify({ ok: false, error: "读取源文件内容失败" }),
        {
          status: 500,
          headers: { "Content-Type": "application/json; charset=utf-8" },
        }
      );
    }

    await store.set(toBlobKey, fileBuf, {
      cacheControl: "public, max-age=600",
    });
    await store.delete(oldBlobKey);

    // Auto record new dir if specified
    if (cleanToDir) {
      const folders = await getCustomFolders(store);
      if (!folders.includes(cleanToDir)) {
        folders.push(cleanToDir);
        await saveCustomFolders(store, folders);
      }
    }

    const { url, markdown } = formatImageUrls(request, toRelPath, env);

    return new Response(
      JSON.stringify({
        ok: true,
        oldPath: cleanFrom,
        newPath: toRelPath,
        url,
        markdown,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      }
    );
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: err.message }), {
      status: 400,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  }
}
