import { environmentClient } from "../_shared/environment.ts";
import type { Environment } from "../_shared/environment.ts";
import { cors, secret } from "../_shared/http.ts";
export async function handle(req: Request, environment: Environment = "production") {
  const headers = { ...cors(req), "Access-Control-Allow-Methods": "GET,POST,OPTIONS", "Cache-Control": "no-store" };
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (!["GET", "POST"].includes(req.method)) return new Response("Method not allowed", { status: 405, headers });
  try {
    const token = req.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
    if (!token) return new Response("Sign in to view recordings", { status: 401, headers });
    const client = environmentClient(secret("SUPABASE_URL"), secret("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false, autoRefreshToken: false } }, environment);
    const { data: user, error: authError } = await client.auth.getUser(token);
    if (authError || !user.user) return new Response("Session expired", { status: 401, headers });
    let data;
    if (req.method === "GET") data = Object.fromEntries(new URL(req.url).searchParams);
    else { const body = await req.text(); if (body.length > 2048) return new Response("Too large", { status: 413, headers }); data = JSON.parse(body); }
    const { data: clip, error } = await client.rpc("chefos_server_recording", { p_actor: user.user.id, p_action: "view", p_data: data });
    if (error) return new Response(error.message, { status: error.code === "42501" ? 403 : 404, headers });
    const { data: blob, error: downloadError } = await client.storage.from("chefos-recordings").download(clip.object_key);
    if (downloadError || !blob) return new Response("Recording unavailable", { status: 404, headers });
    return new Response(blob, { headers: { ...headers, "Content-Type": "application/octet-stream", "Content-Disposition": `inline; filename="chefos-${clip.id}.mp4"` } });
  } catch { return new Response("Recording service unavailable", { status: 503, headers }); }
}
if (import.meta.main) Deno.serve((request) => handle(request));
