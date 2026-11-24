import { verifyAuth } from "../../_utils/auth.js";

const DEFAULT_REPO = "kafuneri/Edgeone-ImgBed";
const DEFAULT_WORKFLOW = "archive-blob.yml";
const DEFAULT_REF = "main";

export async function onRequestPost(context) {
  const { request, env = {} } = context;

  const isAuth = await verifyAuth(request, env);
  if (!isAuth) {
    return new Response(JSON.stringify({ ok: false, error: "未授权" }), {
      status: 401,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  }

  const token = env.GITHUB_TOKEN || env.GH_TOKEN;
  if (!token) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: "未配置 GITHUB_TOKEN 环境变量，请在 EdgeOne Pages 控制台添加具备 Actions 读写权限的 Token",
      }),
      {
        status: 400,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      }
    );
  }

  const repo = env.GITHUB_REPO || DEFAULT_REPO;
  const workflow = env.GITHUB_WORKFLOW || DEFAULT_WORKFLOW;
  const ref = env.GITHUB_BRANCH || DEFAULT_REF;

  const endpoint = `https://api.github.com/repos/${repo}/actions/workflows/${encodeURIComponent(workflow)}/dispatches`;

  try {
    const ghRes = await fetch(endpoint, {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "User-Agent": "EdgeOne-ImgBed",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ref }),
    });

    if (!ghRes.ok) {
      const errText = await ghRes.text();
      let detail = errText;
      try {
        const parsed = JSON.parse(errText);
        if (parsed?.message) detail = parsed.message;
      } catch {
        // Keep raw response text.
      }
      return new Response(
        JSON.stringify({
          ok: false,
          error: `GitHub API (${ghRes.status}): ${detail || "触发失败"}`,
        }),
        {
          status: ghRes.status >= 400 && ghRes.status < 600 ? ghRes.status : 502,
          headers: { "Content-Type": "application/json; charset=utf-8" },
        }
      );
    }

    return new Response(
      JSON.stringify({
        ok: true,
        repo,
        workflow,
        ref,
        message: "已触发 GitHub Actions 归档任务",
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: err?.message || "请求 GitHub API 失败",
      }),
      {
        status: 502,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      }
    );
  }
}
