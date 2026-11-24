import { verifyUploadOrReadAuth } from "../_utils/auth.js";
import { getBlobStore, checkBlobExists, getCustomFolders, saveCustomFolders } from "../_utils/blob.js";
import { getArchivedManifest, isArchived } from "../_utils/manifest.js";
import { resolveImagePath, formatImageUrls, mimeToExt } from "../_utils/path.js";

const CURL_MAX_SIZE_BYTES = 950 * 1024; // 950 KB limit for direct function body

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
    const contentLength = Number(request.headers.get("content-length") || 0);
    if (contentLength > CURL_MAX_SIZE_BYTES) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: `上传内容大小 (${(contentLength / 1024).toFixed(1)} KB) 超过函数直接上传上限 950 KB。大于 950 KB 的图片请使用 /api/upload/presign 接口获取客户端直传 URL。`,
        }),
        {
          status: 413,
          headers: { "Content-Type": "application/json; charset=utf-8" },
        }
      );
    }

    const reqUrl = new URL(request.url);
    const dirParam = reqUrl.searchParams.get("dir") || "";
    let nameParam = reqUrl.searchParams.get("name") || "";
    const overwriteParam = reqUrl.searchParams.get("overwrite") === "true";

    const contentType = request.headers.get("content-type") || "";
    let fileBuffer;
    let fallbackExt = "webp";

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("file");
      if (!file || typeof file === "string") {
        return new Response(JSON.stringify({ ok: false, error: "未找到上传的文件字段 'file'" }), {
          status: 400,
          headers: { "Content-Type": "application/json; charset=utf-8" },
        });
      }
      if (file.size > CURL_MAX_SIZE_BYTES) {
        return new Response(
          JSON.stringify({
            ok: false,
            error: "文件大小超过单步直传上限 950 KB，请走预签名直传",
          }),
          {
            status: 413,
            headers: { "Content-Type": "application/json; charset=utf-8" },
          }
        );
      }
      if (!nameParam && file.name) {
        nameParam = file.name;
      }
      fallbackExt = mimeToExt(file.type, "webp");
      fileBuffer = await file.arrayBuffer();
    } else {
      // Raw binary body
      fallbackExt = mimeToExt(contentType, "webp");
      fileBuffer = await request.arrayBuffer();
    }

    if (!fileBuffer || fileBuffer.byteLength === 0) {
      return new Response(JSON.stringify({ ok: false, error: "上传内容为空" }), {
        status: 400,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      });
    }

    const { relPath, blobKey, dir, mime } = resolveImagePath(dirParam, nameParam, fallbackExt);

    const store = getBlobStore(env);
    const manifest = await getArchivedManifest(request);

    // Conflict check
    if (isArchived(relPath, manifest)) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: `目标文件 '${relPath}' 已归档只读，禁止覆盖！`,
        }),
        {
          status: 409,
          headers: { "Content-Type": "application/json; charset=utf-8" },
        }
      );
    }

    if (!overwriteParam) {
      const exists = await checkBlobExists(store, blobKey);
      if (exists) {
        return new Response(
          JSON.stringify({
            ok: false,
            error: `暂存区已存在同名图片 '${relPath}'，如需覆盖请添加 ?overwrite=true 参数`,
          }),
          {
            status: 409,
            headers: { "Content-Type": "application/json; charset=utf-8" },
          }
        );
      }
    }

    // Write to Blob
    await store.set(blobKey, fileBuffer, {
      cacheControl: "public, max-age=600",
    });

    // Auto record folder if non-empty
    if (dir) {
      const folders = await getCustomFolders(store);
      if (!folders.includes(dir)) {
        folders.push(dir);
        await saveCustomFolders(store, folders);
      }
    }

    const { url, markdown } = formatImageUrls(request, relPath, env);

    return new Response(
      JSON.stringify({
        ok: true,
        path: relPath,
        url,
        markdown,
        size: fileBuffer.byteLength,
        status: "staging",
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
