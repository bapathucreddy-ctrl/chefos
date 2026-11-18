import { generateMenu, MenuInput, menuProviderConfigured } from "./menu-provider.ts";
export type MenuRpc = (name: string, args?: Record<string, unknown>) => Promise<any>;
export async function processMenuJob(rpc: MenuRpc, jobId?: string) {
  if (!menuProviderConfigured()) return { processed: false, awaiting_configuration: true };
  const job = await rpc("chefos_server_claim_menu", { p_job: jobId || null });
  if (!job) return { processed: false };
  try {
    const result = await generateMenu(job.input as MenuInput);
    const saved = await rpc("chefos_server_finish_menu", {
      p_job: job.id, p_claim: job.claim_token, p_document: result.document, p_provider: result.provider,
    });
    return { processed: true, saved: Boolean(saved.saved) };
  } catch {
    // Provider bodies and profile measurements must never reach logs/errors.
    try { await rpc("chefos_server_finish_menu", { p_job: job.id, p_claim: job.claim_token, p_failed: true }); }
    catch { /* An expired lease is reclaimed by the next worker. */ }
    return { processed: true, saved: false };
  }
}
