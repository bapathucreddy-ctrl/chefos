import { HttpError } from "./http.ts";
import { validateVideo } from "./video.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.118.0";
export async function recordingRequest(server: SupabaseClient, actor: string, action: "ticket" | "confirm", data: Record<string, unknown>) {
  const rpc = async (operation: string, args: Record<string, unknown>) => {
    const { data: output, error } = await server.rpc("chefos_server_recording", { p_actor: actor, p_action: operation, p_data: args });
    if (error) throw new HttpError(error.code === "42501" ? 403 : 400, error.message); return output;
  };
  const clip = await rpc(action === "ticket" ? "ticket" : "metadata", data);
  const bucket = server.storage.from("chefos-recordings");
  if (action === "ticket") {
    if (clip.uploaded) return { id: clip.id, uploaded: true };
    const { data: signed, error } = await bucket.createSignedUploadUrl(clip.object_key, { upsert: false });
    if (error) throw new HttpError(503, "Secure recording upload is unavailable. Keep the local recording and retry.");
    return { id: clip.id, uploaded: false, upload_url: signed.signedUrl };
  }
  if (clip.uploaded) return { confirmed: true };
  const { data: info, error } = await bucket.info(clip.object_key);
  if (error || !info) throw new HttpError(409, "Recording upload has not finished yet.");
  const size = info.size ?? info.metadata?.size;
  const mime = info.contentType ?? info.metadata?.mimetype;
  if (size !== clip.bytes || !["video/mp4", "video/quicktime"].includes(String(mime))) throw new HttpError(400, "Uploaded recording does not match the capture.");
  const { data: blob, error: downloadError } = await bucket.download(clip.object_key);
  if (downloadError || !blob || blob.size > 15728640) throw new HttpError(409, "Recording upload could not be checked yet.");
  validateVideo(new Uint8Array(await blob.arrayBuffer()), (Date.parse(clip.ended_at) - Date.parse(clip.started_at)) / 1000);
  return await rpc("confirm", { id: clip.id, actual_bytes: size });
}
export async function purgeRecordings(server: SupabaseClient) {
  const { data: clips, error } = await server.rpc("chefos_server_purge_recordings");
  if (error || !clips?.length) return { purged: 0 };
  const { error: storageError } = await server.storage.from("chefos-recordings").remove(clips.map((c: { object_key: string }) => c.object_key));
  if (storageError) return { purged: 0, retry: true };
  const { error: markError } = await server.rpc("chefos_server_purge_recordings", { p_done: clips.map((c: { id: string }) => c.id) });
  if (markError) return { purged: 0, retry: true };
  return { purged: clips.length };
}
