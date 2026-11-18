import type { SupabaseClient } from "npm:@supabase/supabase-js@2.118.0";
import { HttpError } from "./http.ts";
import { compareSelfie } from "./selfie-provider.ts";

const BUCKET = "chefos-selfies";

export async function selfieHash(photo: Blob): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await photo.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function validateSelfie(bytes: Uint8Array) {
  if (bytes.length < 100 || bytes.length > 5242880 || bytes[0] !== 255 || bytes[1] !== 216 ||
    bytes.at(-2) !== 255 || bytes.at(-1) !== 217) {
    throw new HttpError(400, "Take a clear JPEG selfie under 5 MB.");
  }
  // Provider face detection and liveness perform the image-content validation.
}

async function rpc(server: SupabaseClient, name: string, args: Record<string, unknown>) {
  const { data, error } = await server.rpc(name, args);
  if (error) throw new HttpError(error.code === "42501" ? 403 : error.code === "40001" ? 409 : 400, error.message);
  return data;
}

export async function selfieUploadTicket(server: SupabaseClient, actor: string, attemptId: string) {
  const attempt = await rpc(server, "chefos_selfie_ticket", { p_actor: actor, p_id: attemptId });
  if (["passed", "failed"].includes(attempt.state)) return { id: attempt.id, state: attempt.state };
  const { data, error } = await server.storage.from(BUCKET).createSignedUploadUrl(attempt.object_key, { upsert: false });
  if (error) throw new HttpError(503, "Secure selfie upload is unavailable. Please retry.");
  return { id: attempt.id, upload_url: data.signedUrl, expires_at: attempt.expires_at };
}

export async function verifySelfie(server: SupabaseClient, actor: string, attemptId: string) {
  const attempt = await rpc(server, "chefos_selfie_ticket", { p_actor: actor, p_id: attemptId });
  if (["passed", "failed"].includes(attempt.state)) return { id: attempt.id, state: attempt.state };
  const bucket = server.storage.from(BUCKET);
  const { data: info, error: infoError } = await bucket.info(attempt.object_key);
  const bytes = info?.size ?? info?.metadata?.size;
  const mime = info?.contentType ?? info?.metadata?.mimetype;
  if (infoError || typeof bytes !== "number" || !Number.isInteger(bytes) || bytes < 100 || bytes > 5242880 || mime !== "image/jpeg") {
    throw new HttpError(400, "Your selfie upload is incomplete. Take a fresh selfie and retry.");
  }
  const { data: photo, error: downloadError } = await bucket.download(attempt.object_key);
  if (downloadError || !photo || photo.size !== bytes) throw new HttpError(409, "The selfie could not be read yet. Please retry.");
  validateSelfie(new Uint8Array(await photo.arrayBuffer()));
  const hash = await selfieHash(photo);
  const claim = await rpc(server, "chefos_selfie_claim", { p_actor: actor, p_id: attemptId, p_hash: hash });
  if (["passed", "failed"].includes(claim.state)) return { id: attempt.id, state: claim.state };
  try {
    let reference: Blob | undefined;
    if (claim.reference_object) {
      const downloaded = await bucket.download(claim.reference_object);
      if (downloaded.error || !downloaded.data || await selfieHash(downloaded.data) !== claim.reference_hash) {
        throw new HttpError(503, "Your registration selfie needs support review.");
      }
      reference = downloaded.data;
    }
    const result = await compareSelfie(attemptId, photo, reference);
    if (!claim.session_id && result.liveness) {
      // A separate server-only object protects the reference from upload tokens.
      const copied = await bucket.copy(attempt.object_key, claim.reference_key);
      if (copied.error) {
        const existing = await bucket.download(claim.reference_key);
        if (existing.error || !existing.data || await selfieHash(existing.data) !== hash) {
          throw new HttpError(503, "Your registration selfie could not be secured. Please retry.");
        }
      }
    }
    const saved = await rpc(server, "chefos_selfie_finish", {
      p_actor: actor, p_id: attemptId, p_claim: claim.claim_token, p_result: result,
    });
    // A scheduled cleanup also handles upload-token replays and interrupted calls.
    await bucket.remove([attempt.object_key]);
    return { id: attemptId, state: saved.state };
  } catch (error) {
    await rpc(server, "chefos_selfie_release", { p_actor: actor, p_id: attemptId, p_claim: claim.claim_token }).catch(() => {});
    throw error;
  }
}

export async function purgeSelfies(server: SupabaseClient) {
  const { data: attempts, error } = await server.rpc("chefos_selfie_cleanup");
  if (error || !attempts?.length) return { selfies_cleaned: 0 };
  const keys = attempts.flatMap((attempt: { object_key: string; orphan_reference?: string }) =>
    [attempt.object_key, attempt.orphan_reference].filter((key): key is string => Boolean(key)));
  const removed = await server.storage.from(BUCKET).remove(keys);
  if (removed.error) return { selfies_cleaned: 0 };
  const marked = await server.rpc("chefos_selfie_cleanup", { p_done: attempts.map((attempt: { id: string }) => attempt.id) });
  return { selfies_cleaned: marked.error ? 0 : attempts.length };
}
