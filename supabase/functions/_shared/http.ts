export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}
export function cors(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") || "";
  const allowed =
    (Deno.env.get("CHEFOS_ALLOWED_ORIGINS") || "http://localhost:5173,http://127.0.0.1:5173,http://localhost:5175,http://127.0.0.1:5175,http://localhost:8085,http://127.0.0.1:8085").split(
      ",",
    ).map((x) => x.trim());
  return {
    ...(allowed.includes(origin) ? { "Access-Control-Allow-Origin": origin } : {}),
    "Access-Control-Allow-Headers": "authorization,apikey,content-type,x-client-info",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Vary": "Origin",
  };
}
export function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(req), "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
export async function hmac(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return Array.from(
    new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value))),
  ).map((x) => x.toString(16).padStart(2, "0")).join("");
}
export function equalHex(a: string, b: string): boolean {
  if (!/^[a-f0-9]{64}$/i.test(a) || !/^[a-f0-9]{64}$/i.test(b)) return false;
  let diff = 0;
  for (let i = 0; i < 64; i++) {
    diff |= a.toLowerCase().charCodeAt(i) ^ b.toLowerCase().charCodeAt(i);
  }
  return diff === 0;
}
export function secret(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new HttpError(503, "This service is awaiting secure configuration.");
  return value;
}
