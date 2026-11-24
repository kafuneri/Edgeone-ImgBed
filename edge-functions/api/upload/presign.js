import { verifyUploadOrReadAuth } from "../../_utils/auth.js";
import { getBlobStore, checkBlobExists, getCustomFolders, saveCustomFolders } from "../../_utils/blob.js";
import { getArchivedManifest, isArchived } from "../../_utils/manifest.js";
import { resolveImagePath, formatImageUrls, mimeToExt } from "../../_utils/path.js";

const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25 MiB hard limit

export async function onRequestPost(context) {
  const request = context.request;
  const env = context.env || {};

  const isAuth = await verifyUploadOrReadAuth(request, env);
  if (!isAuth) {
    return new Response(JSON.stringify({ ok: false, error: "未授权" }), {
      status: 401,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  }

  try {
    const body = await request.json();
    const { dir, name, contentType, size, overwrite } = body || {};

    if (size && Number(size) > MAX_FILE_SIZE_BYTES) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "文件大小超过限制（单文件不得超过 25 MiB）",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json; charset=utf-8" },
        }
      );
    }

    const targetExt = contentType ? mimeToExt(contentType, "") : "";

    // Resolve and sanitize path (align extension with actual contentType when known)
    const { relPath, blobKey, dir: cleanDir, mime } = resolveImagePath(
      dir,
      name,
      targetExt || "webp",
      targetExt
    );

    const store = getBlobStore(env);
    const manifest = await getArchivedManifest(request);

    // 1. Conflict check: Manifest (strict non-overwrite)
    if (isArchived(relPath, manifest)) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: `目标文件 '${relPath}' 已处于归档只读状态，严禁覆盖以防破坏历史博文引用！`,
        }),
        {
          status: 409,
          headers: { "Content-Type": "application/json; charset=utf-8" },
        }
      );
    }

    // 2. Conflict check: Staging Blob
    if (!overwrite) {
      const existsInBlob = await checkBlobExists(store, blobKey);
      if (existsInBlob) {
        return new Response(
          JSON.stringify({
            ok: false,
            error: `暂存区已存在同名图片 '${relPath}'，如需覆盖请开启 overwrite 选项。`,
          }),
          {
            status: 409,
            headers: { "Content-Type": "application/json; charset=utf-8" },
          }
        );
      }
    }

    // 3. Issue presigned PUT URL (do not lock contentType in signature so client can freely stream binary)
    const presignResult = await store.createUploadUrl(blobKey, {
      expireSeconds: 600,
    });

    // Auto record folder if non-empty
    if (cleanDir) {
      const folders = await getCustomFolders(store);
      if (!folders.includes(cleanDir)) {
        folders.push(cleanDir);
        await saveCustomFolders(store, folders);
      }
    }

    const { url, markdown } = formatImageUrls(request, relPath, env);

    return new Response(
      JSON.stringify({
        ok: true,
        uploadUrl: presignResult.url,
        method: "PUT",
        headers: {
          "Content-Type": mime,
        },
        path: relPath,
        url,
        markdown,
        expiresAt: presignResult.expiresAt,
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
