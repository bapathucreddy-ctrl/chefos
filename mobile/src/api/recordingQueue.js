import * as FileSystem from "expo-file-system";
import { Platform } from "react-native";
import { api } from "./client";
import { requireSupabase, isTestEnvironment } from "./supabase";

const locks = new Map();
const directory = (owner) => `${FileSystem.documentDirectory}kitchen-recordings/${isTestEnvironment ? "test/" : ""}${owner}/`;
async function currentOwner(owner) {
  const { data } = await requireSupabase().auth.getSession();
  if (data.session?.user?.id !== owner) throw new Error("Sign in to the recording owner's account to upload pending footage.");
}
// Each segment has its own durable manifest. Uploads never rewrite a shared
// ledger, and the local video is deleted only after a server receipt.
export async function retainSegment(owner, segment, uri) {
  const dir = directory(owner);
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  const file = `${dir}${segment.id}.mp4`, manifest = `${dir}${segment.id}.json`;
  const info = await FileSystem.getInfoAsync(uri);
  if (!info.exists || !info.size) throw new Error("The recording could not be saved. Keep this screen open and retry.");
  const entry = { ...segment, bytes: info.size, file, source: uri };
  await FileSystem.writeAsStringAsync(manifest + ".tmp", JSON.stringify(entry));
  await FileSystem.moveAsync({ from: manifest + ".tmp", to: manifest });
  await FileSystem.copyAsync({ from: uri, to: file });
  await FileSystem.deleteAsync(uri, { idempotent: true });
  return entry;
}
export async function pendingSegments(owner) {
  if (Platform.OS === "web" || !owner) return [];
  const dir = directory(owner), info = await FileSystem.getInfoAsync(dir);
  if (!info.exists) return [];
  const files = await FileSystem.readDirectoryAsync(dir), result = [];
  for (const name of files.filter((f) => f.endsWith(".json"))) {
    // A damaged manifest is retained and reported, never silently discarded.
    result.push(JSON.parse(await FileSystem.readAsStringAsync(dir + name)));
  }
  return result.sort((a, b) => a.started_at.localeCompare(b.started_at));
}
export function uploadPending(owner) {
  if (locks.has(owner)) return locks.get(owner);
  const task = (async () => {
    await currentOwner(owner);
    for (const clip of await pendingSegments(owner)) {
      await currentOwner(owner);
      const { file, source, ...metadata } = clip;
      const { data: ticket } = await api.post("recordings/ticket/", metadata);
      if (!ticket.uploaded) {
        if (!(await FileSystem.getInfoAsync(file)).exists) {
          if (!source || !(await FileSystem.getInfoAsync(source)).exists) throw new Error("A saved recording file is missing. Contact Chefos support before clearing app storage.");
          await FileSystem.copyAsync({ from: source, to: file });
        }
        const result = await FileSystem.uploadAsync(ticket.upload_url, file, {
          httpMethod: "PUT", uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
          headers: { "Content-Type": "video/mp4", "x-upsert": "false" },
        });
        // An immutable object may already exist after an interrupted receipt.
        if (![200, 201, 400, 409].includes(result.status)) throw new Error("Recording upload is pending. Your saved footage will retry.");
        await currentOwner(owner);
        await api.post("recordings/confirm/", { id: clip.id });
      }
      await FileSystem.deleteAsync(file, { idempotent: true });
      if (source) await FileSystem.deleteAsync(source, { idempotent: true });
      await FileSystem.deleteAsync(`${directory(owner)}${clip.id}.json`, { idempotent: true });
    }
    return (await pendingSegments(owner)).length;
  })().finally(() => locks.delete(owner));
  locks.set(owner, task); return task;
}
