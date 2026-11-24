import { verifyAuth } from "../../_utils/auth.js";
import { getBlobStore } from "../../_utils/blob.js";
import { getArchivedManifest, isArchived } from "../../_utils/manifest.js";

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
    const targetPath = body?.path;
    if (!targetPath) {
      return new Response(JSON.stringify({ ok: false, error: "缺少删除目标 path" }), {
        status: 400,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      });
    }

    const cleanPath = targetPath.replace(/^\/+/, "");
    const manifest = await getArchivedManifest(request);

    // Check if archived
    if (isArchived(cleanPath, manifest)) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "该文件属于已归档只读图片，界面上禁止直接删除！如需删除请在 GitHub 仓库中删除对应文件并重新构建。",
        }),
        {
          status: 403,
          headers: { "Content-Type": "application/json; charset=utf-8" },
        }
      );
    }

    const store = getBlobStore(env);
    await store.delete(`img/${cleanPath}`);

    return new Response(
      JSON.stringify({ ok: true, message: `已成功删除暂存图片 '${cleanPath}'` }),
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
