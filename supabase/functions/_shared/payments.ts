import { HttpError, secret } from "./http.ts";
export async function razorpay(path: string, body?: Record<string, unknown>) {
  const response = await fetch("https://api.razorpay.com/v1/" + path, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: "Basic " +
        btoa(secret("RAZORPAY_KEY_ID") + ":" + secret("RAZORPAY_KEY_SECRET")),
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(15000),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new HttpError(
      502,
      "The payment provider could not complete this request. Please retry or contact support.",
    );
  }
  return data;
}
