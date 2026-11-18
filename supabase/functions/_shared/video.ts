import { HttpError } from "./http.ts";
// Validate a complete ISO-BMFF video, not just an easily forged ftyp prefix.
// This checks container/track/duration integrity; camera provenance still relies
// on the authenticated recording workflow and is not device attestation.
export function validateVideo(bytes: Uint8Array, expectedSeconds: number) {
  const bad = () => new HttpError(400, "A complete camera video matching the captured duration is required.");
  if (bytes.length < 128 || bytes.length > 15728640 || !Number.isFinite(expectedSeconds) || expectedSeconds <= 0 || expectedSeconds > 90) throw bad();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let brand = false, media = false, video = false, duration = 0, boxes = 0;
  const text = (at: number) => String.fromCharCode(...bytes.slice(at, at + 4));
  function scan(start: number, stop: number, depth = 0) {
    if (depth > 5) throw bad();
    for (let at = start; at < stop;) {
      if (++boxes > 10000 || at + 8 > stop) throw bad();
      let size = view.getUint32(at), header = 8;
      const type = text(at + 4);
      if (size === 1) {
        if (at + 16 > stop) throw bad();
        const large = view.getBigUint64(at + 8);
        if (large > BigInt(bytes.length)) throw bad();
        size = Number(large); header = 16;
      } else if (size === 0) size = stop - at;
      if (size < header || at + size > stop) throw bad();
      const payload = at + header, end = at + size;
      if (depth === 0 && type === "ftyp" && size >= 16) brand = true;
      if (depth === 0 && type === "mdat" && size > 100) media = true;
      if (type === "mvhd" && depth === 1) {
        if (end - payload < 20) throw bad();
        const version = bytes[payload];
        const scaleAt = payload + (version === 1 ? 20 : 12), durationAt = scaleAt + 4;
        if (![0, 1].includes(version) || durationAt + (version === 1 ? 8 : 4) > end) throw bad();
        const scale = view.getUint32(scaleAt), ticks = version === 1 ? Number(view.getBigUint64(durationAt)) : view.getUint32(durationAt);
        if (!scale || !Number.isSafeInteger(ticks)) throw bad();
        duration = ticks / scale;
      }
      if (type === "hdlr" && depth === 3 && end - payload >= 12 && text(payload + 8) === "vide") video = true;
      if (["moov", "trak", "mdia"].includes(type)) scan(payload, end, depth + 1);
      at = end;
    }
  }
  scan(0, bytes.length);
  if (!brand || !media || !video || duration <= 0 || duration > 90 || Math.abs(duration - expectedSeconds) > 10) throw bad();
  return { duration };
}
