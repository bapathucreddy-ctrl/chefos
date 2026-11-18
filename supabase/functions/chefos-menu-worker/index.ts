import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { environmentClient } from "../_shared/environment.ts";
import { equalHex, hmac, secret } from "../_shared/http.ts";
import { processMenuJob } from "../_shared/menu-jobs.ts";
import { purgeRecordings } from "../_shared/recordings.ts";
import { purgeSelfies } from "../_shared/selfies.ts";
export async function handle(req: Request) {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  try {
    const supplied = req.headers.get("authorization")?.replace(/^Bearer /i, "") || "";
    if (!supplied || supplied.length > 256 || !equalHex(await hmac(secret("CHEFOS_JOB_SECRET"), "worker"), await hmac(supplied, "worker"))) return new Response("Unauthorized", { status: 401 });
    const client = createClient(secret("SUPABASE_URL"), secret("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false, autoRefreshToken: false } });
    const rpc = async (name: string, args = {}) => {
      const { data, error } = await client.rpc(name, args); if (error) throw new Error("Menu job database operation failed"); return data;
    };
    await rpc("chefos_server_enqueue_weeks");
    const production = { ...await processMenuJob(rpc), ...await purgeRecordings(client), ...await purgeSelfies(client) };
    let test;
    try {
      const testClient = environmentClient(secret("SUPABASE_URL"), secret("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false, autoRefreshToken: false } }, "test");
      const testRpc = async (name: string, args = {}) => { const { data, error } = await testClient.rpc(name, args); if (error) throw new Error("Test worker database operation failed"); return data; };
      await testRpc("chefos_server_enqueue_weeks");
      test = { ...await processMenuJob(testRpc), ...await purgeRecordings(testClient), ...await purgeSelfies(testClient) };
    } catch { test = { retry: true }; }
    return Response.json({ ...production, test });
  } catch { return new Response("Worker awaiting configuration or retry", { status: 503 }); }
}
if (import.meta.main) Deno.serve(handle);
