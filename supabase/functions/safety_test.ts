import { validateVideo } from "./_shared/video.ts";
import { handle as faceWebhook } from "./chefos-face-webhook/index.ts";
import { handle as recordingView } from "./chefos-recordings/index.ts";
import { hmac } from "./_shared/http.ts";
function assert(ok: unknown): asserts ok { if (!ok) throw new Error("Assertion failed"); }
function rejects(fn: () => unknown) { try { fn(); } catch { return; } throw new Error("Expected rejection"); }
const str = (s: string) => new TextEncoder().encode(s);
function box(type: string, ...parts: Uint8Array[]) {
  const size = 8 + parts.reduce((n, p) => n + p.length, 0), bytes = new Uint8Array(size);
  new DataView(bytes.buffer).setUint32(0, size); bytes.set(str(type), 4);
  let at = 8; for (const p of parts) { bytes.set(p, at); at += p.length; } return bytes;
}
function video(duration = 15, handler = "vide") {
  const header = new Uint8Array(100), view = new DataView(header.buffer); view.setUint32(12, 1000); view.setUint32(16, duration * 1000);
  const hdlr = new Uint8Array(24); hdlr.set(str(handler), 8);
  const parts = [box("ftyp", str("isom0000")), box("mdat", new Uint8Array(256)), box("moov", box("mvhd", header), box("trak", box("mdia", box("hdlr", hdlr))))];
  const bytes = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let at = 0;
  for (const p of parts) { bytes.set(p, at); at += p.length; } return bytes;
}
Deno.test("recording proof rejects fake headers, missing video, truncation and false durations", () => {
  assert(validateVideo(video(), 15).duration === 15);
  assert(validateVideo(video(0.3), 0.5).duration === 0.3);
  rejects(() => validateVideo(box("ftyp", new Uint8Array(300)), 15));
  rejects(() => validateVideo(video(15, "soun"), 15));
  rejects(() => validateVideo(video().slice(0, -3), 15));
  rejects(() => validateVideo(video(60), 15));
  rejects(() => validateVideo(video(0), 15));
  const corrupt = video(); new DataView(corrupt.buffer).setUint32(0, 999999); rejects(() => validateVideo(corrupt, 15));
});
Deno.test("face webhook requires current signed payload and never trusts client passed flags", async () => {
  const names = ["CHEFOS_FACE_WEBHOOK_SECRET", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
  const saved = names.map((n) => Deno.env.get(n)), oldFetch = globalThis.fetch;
  Deno.env.set(names[0], "test-face-secret"); Deno.env.set(names[1], "https://chefos-test.supabase.co"); Deno.env.set(names[2], "test-service-key");
  let calls = 0;
  try {
    globalThis.fetch = async (url, init) => {
      calls++; assert(String(url).includes("/rpc/chefos_server_face_result"));
      assert(JSON.parse(String(init?.body)).p_data.event_id === "signed-test-event");
      return Response.json({ recorded: true });
    };
    const body = JSON.stringify({ event_id: "signed-test-event", match: true, liveness: true }), timestamp = String(Math.floor(Date.now() / 1000));
    const req = (ts: string, signature: string) => new Request("https://chefos.test/face", { method: "POST", headers: { "x-chefos-timestamp": ts, "x-chefos-signature": signature }, body });
    assert((await faceWebhook(req(timestamp, "client-passed-true"))).status === 401); assert(calls === 0);
    const expired = String(Number(timestamp) - 600);
    assert((await faceWebhook(req(expired, await hmac("test-face-secret", expired + "." + body)))).status === 401); assert(calls === 0);
    assert((await faceWebhook(req(timestamp, await hmac("test-face-secret", timestamp + "." + body)))).status === 200); assert(Number(calls) === 1);
  } finally { globalThis.fetch = oldFetch; names.forEach((n, i) => saved[i] === undefined ? Deno.env.delete(n) : Deno.env.set(n, saved[i]!)); }
});
Deno.test("private recording playback rejects unauthenticated requests", async () => {
  assert((await recordingView(new Request("https://chefos.test/recordings?id=arbitrary"))).status === 401);
});
