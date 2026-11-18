import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { equalHex, hmac, secret } from "../_shared/http.ts";
export async function handle(req: Request) {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  try {
    const raw = await req.text(); if (raw.length > 8192) return new Response("Too large", { status: 413 });
    const timestamp = req.headers.get("x-chefos-timestamp") || "", signature = req.headers.get("x-chefos-signature") || "";
    if (!/^\d{10}$/.test(timestamp) || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300 ||
      !equalHex(signature, await hmac(secret("CHEFOS_FACE_WEBHOOK_SECRET"), timestamp + "." + raw))) return new Response("Invalid signature", { status: 401 });
    const event = JSON.parse(raw);
    const client = createClient(secret("SUPABASE_URL"), secret("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false, autoRefreshToken: false } });
    const { error } = await client.rpc("chefos_server_face_result", { p_data: event });
    return new Response(error ? "Verification event was not accepted" : "Recorded", { status: error ? 409 : 200 });
  } catch { return new Response("Verification service unavailable", { status: 503 }); }
}
if (import.meta.main) Deno.serve(handle);
