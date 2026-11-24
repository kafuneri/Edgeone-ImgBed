import { verifyAuth } from "../../_utils/auth.js";

export async function onRequestGet(context) {
  const request = context.request;
  const env = context.env || {};
  const isAuth = await verifyAuth(request, env);

  return new Response(
    JSON.stringify({
      ok: true,
      authenticated: isAuth,
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    }
  );
}
