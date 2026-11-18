const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const babel = require("@babel/core");
const code = babel.transformSync(fs.readFileSync(path.join(__dirname, "../src/api/recordingQueue.js"), "utf8"), {
  babelrc: false, configFile: false, plugins: [require.resolve("@babel/plugin-transform-modules-commonjs")],
}).code;
function fixture() {
  const files = new Map(), calls = [], receipts = new Set();
  let owner = "chef-one", online = true, failReceipt = false, alreadyUploaded = false;
  const FileSystem = {
    documentDirectory: "private/", FileSystemUploadType: { BINARY_CONTENT: 0 },
    makeDirectoryAsync: async (p) => files.set(p, "directory"),
    getInfoAsync: async (p) => ({ exists: files.has(p), size: typeof files.get(p) === "number" ? files.get(p) : 1000 }),
    readDirectoryAsync: async (p) => [...files.keys()].filter((f) => f.startsWith(p) && f !== p).map((f) => f.slice(p.length)),
    readAsStringAsync: async (p) => files.get(p), writeAsStringAsync: async (p, s) => files.set(p, s),
    copyAsync: async ({ from, to }) => { assert(files.has(from)); files.set(to, files.get(from)); },
    moveAsync: async ({ from, to }) => { files.set(to, files.get(from)); files.delete(from); },
    deleteAsync: async (p) => { calls.push(["delete", p]); files.delete(p); },
    uploadAsync: async (_url, p) => { assert(files.has(p)); calls.push(["upload", p]); return { status: alreadyUploaded ? 409 : 200 }; },
  };
  const api = { post: async (route, data) => {
    calls.push([route, data]); if (!online) throw new Error("offline");
    if (route.includes("ticket")) return { data: { uploaded: receipts.has(data.id), upload_url: "https://upload.test/signed" } };
    if (failReceipt) throw new Error("receipt interrupted"); receipts.add(data.id); return { data: { confirmed: true } };
  } };
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, Map, JSON, Error, require: (name) => {
    if (name === "expo-file-system") return FileSystem;
    if (name === "react-native") return { Platform: { OS: "android" } };
    if (name === "./client") return { api };
    if (name === "./supabase") return { requireSupabase: () => ({ auth: { getSession: async () => ({ data: { session: { user: { id: owner } } } }) } }) };
    throw new Error(name);
  } });
  return { ...module.exports, files, calls, receipts,
    setOwner: (v) => owner = v, setOnline: (v) => online = v, setFailReceipt: (v) => failReceipt = v, setAlreadyUploaded: (v) => alreadyUploaded = v };
}
(async () => {
  const f = fixture(), segment = { id: "clip-one", capture_token: "capture-one", started_at: "2026-11-13T07:00:00Z", ended_at: "2026-11-13T07:00:15Z" };
  f.files.set("camera/cache.mp4", 1000);
  const clip = await f.retainSegment("chef-one", segment, "camera/cache.mp4");
  assert(f.files.has(clip.file)); assert.equal((await f.pendingSegments("chef-one")).length, 1);
  f.setOnline(false); await assert.rejects(f.uploadPending("chef-one"), /offline/); assert(f.files.has(clip.file));
  f.setOnline(true); f.setFailReceipt(true); await assert.rejects(f.uploadPending("chef-one"), /receipt interrupted/); assert(f.files.has(clip.file));
  f.setAlreadyUploaded(true); f.setFailReceipt(false); await f.uploadPending("chef-one");
  assert(f.receipts.has(segment.id)); assert(!f.files.has(clip.file)); assert.equal((await f.pendingSegments("chef-one")).length, 0);
  // Interrupted file copy can recover from the cache reference in the manifest.
  const g = fixture(); g.files.set("camera/cache.mp4", 1000);
  const recovered = await g.retainSegment("chef-one", segment, "camera/cache.mp4");
  g.files.delete(recovered.file); g.files.set(recovered.source, 1000);
  await g.uploadPending("chef-one"); assert(g.receipts.has(segment.id));
  // A crash after remote confirmation/local-file deletion still clears the manifest.
  const h = fixture(); h.files.set("camera/cache.mp4", 1000);
  const interrupted = await h.retainSegment("chef-one", segment, "camera/cache.mp4");
  h.files.delete(interrupted.file); h.receipts.add(segment.id); await h.uploadPending("chef-one");
  assert.equal((await h.pendingSegments("chef-one")).length, 0);
  const isolated = fixture(); isolated.setOwner("different-chef");
  await assert.rejects(isolated.uploadPending("chef-one"), /owner/); assert.equal(isolated.calls.length, 0);
  console.log("PASS: durable video manifests; offline retention; interrupted upload receipt recovery; cache-copy recovery; confirmed-file cleanup recovery; account isolation.");
})().catch((e) => { console.error(e); process.exitCode = 1; });
