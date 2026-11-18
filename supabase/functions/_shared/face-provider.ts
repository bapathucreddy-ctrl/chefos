import { HttpError, secret } from "./http.ts";
export function faceProviderConfigured() {
  return Boolean(Deno.env.get("CHEFOS_FACE_PROVIDER_URL") && Deno.env.get("CHEFOS_FACE_PROVIDER_KEY") && Deno.env.get("CHEFOS_FACE_WEBHOOK_SECRET") && Deno.env.get("CHEFOS_FACE_ALLOWED_ORIGINS"));
}
export async function beginFaceCheck(challenge: { challenge_id: string; enrollment_reference: string; expires_at: string }) {
  if (!faceProviderConfigured()) throw new HttpError(503, "Chef identity verification is awaiting secure configuration.");
  const endpoint = new URL(secret("CHEFOS_FACE_PROVIDER_URL"));
  if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password || /^(localhost|127\.|10\.|192\.168\.|169\.254\.|\[)/i.test(endpoint.hostname)) throw new HttpError(503, "The identity provider endpoint is not configured securely.");
  const response = await fetch(endpoint, {
    method: "POST", redirect: "error", signal: AbortSignal.timeout(20000),
    headers: { Authorization: "Bearer " + secret("CHEFOS_FACE_PROVIDER_KEY"), "Content-Type": "application/json" },
    body: JSON.stringify({ ...challenge, callback_url: secret("SUPABASE_URL") + "/functions/v1/chefos-face-webhook", return_url: "chefos-chef://verification/complete" }),
  });
  if (!response.ok) throw new HttpError(502, "Identity verification could not start. Please retry.");
  const result = await response.json();
  if (typeof result.id !== "string" || result.id.length < 1 || result.id.length > 200 || typeof result.verification_url !== "string") throw new HttpError(502, "Identity provider response was incomplete.");
  const verification = new URL(result.verification_url);
  const allowed = secret("CHEFOS_FACE_ALLOWED_ORIGINS").split(",").map((v) => v.trim());
  if (verification.protocol !== "https:" || verification.username || verification.password || !allowed.includes(verification.origin)) throw new HttpError(502, "Identity provider returned an unapproved verification site.");
  return { provider_session: result.id, verification_url: verification.href };
}
