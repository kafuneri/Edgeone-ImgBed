import { verifyPassword, createSessionToken, buildLoginCookie } from "../../_utils/auth.js";

export async function onRequestPost(context) {
  const request = context.request;
  const env = context.env || {};

  try {
    const body = await request.json();
    const password = body?.password;

    if (!password || !verifyPassword(password, env)) {
      return new Response(
        JSON.stringify({ ok: false, error: "密码错误，请重新输入" }),
        {
          status: 401,
          headers: { "Content-Type": "application/json; charset=utf-8" },
        }
      );
    }

    const token = await createSessionToken(env);

    // Determine if connection is genuinely HTTPS
    const host = request.headers.get("host") || "";
    const isLocalhost = host.includes("localhost") || host.includes("127.0.0.1");
    const forwardedProto = request.headers.get("x-forwarded-proto");
    const isHttps =
      !isLocalhost &&
      (forwardedProto === "https" ||
        (request.url.startsWith("https://") && !request.url.includes("localhost")));

    const cookie = buildLoginCookie(token, isHttps);

    return new Response(
      JSON.stringify({
        ok: true,
        token,
        message: "登录成功",
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Set-Cookie": cookie,
        },
      }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, error: err.message || "请求解析失败" }),
      {
        status: 400,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      }
    );
  }
}
