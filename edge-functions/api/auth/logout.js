import { buildLogoutCookie } from "../../_utils/auth.js";

export async function onRequestPost(context) {
  const request = context.request;
  const isHttps = request.url.startsWith("https://");
  const cookie = buildLogoutCookie(isHttps);

  return new Response(
    JSON.stringify({ ok: true, message: "已安全登出" }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Set-Cookie": cookie,
      },
    }
  );
}
