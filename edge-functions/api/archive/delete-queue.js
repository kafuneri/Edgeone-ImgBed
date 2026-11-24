import { verifyAuth } from "../../_utils/auth.js";
import { getBlobStore, getPendingDeletes, savePendingDeletes } from "../../_utils/blob.js";
import { getArchivedManifest, isArchived } from "../../_utils/manifest.js";

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

export async function onRequestPost(context) {
  const { request, env = {} } = context;

  const isAuth = await verifyAuth(request, env);
  if (!isAuth) {
    return jsonResponse({ ok: false, error: "未授权" }, 401);
  }

  try {
    const body = await request.json();
    const action = body?.action === "remove" ? "remove" : "add";
    const rawPaths = Array.isArray(body?.paths)
      ? body.paths
      : body?.path
      ? [body.path]
      : [];

    const cleanPaths = Array.from(
      new Set(
        rawPaths
          .map((p) => String(p || "").trim().replace(/^\/+/, ""))
          .filter(Boolean)
      )
    );

    if (cleanPaths.length === 0) {
      return jsonResponse({ ok: false, error: "缺少有效的目标路径" }, 400);
    }

    const store = getBlobStore(env);
    const current = await getPendingDeletes(store);

    if (action === "add") {
      const manifest = await getArchivedManifest(request);
      const validPaths = cleanPaths.filter((p) => isArchived(p, manifest));
      if (validPaths.length === 0) {
        return jsonResponse({ ok: false, error: "未找到对应的已归档文件" }, 404);
      }
      const next = await savePendingDeletes(store, [...current, ...validPaths]);
      return jsonResponse({
        ok: true,
        action: "add",
        affected: validPaths.length,
        pendingDeletes: next,
      });
    }

    const removeSet = new Set(cleanPaths);
    const next = await savePendingDeletes(
      store,
      current.filter((p) => !removeSet.has(p))
    );
    return jsonResponse({
      ok: true,
      action: "remove",
      affected: cleanPaths.length,
      pendingDeletes: next,
    });
  } catch (err) {
    return jsonResponse({ ok: false, error: err.message }, 400);
  }
}
