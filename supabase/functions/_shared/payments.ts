import { HttpError, secret } from "./http.ts";
export async function razorpay(path: string, body?: Record<string, unknown>, environment: "production" | "test" = "production") {
  const prefix = environment === "test" ? "RAZORPAY_TEST_" : "RAZORPAY_";
  const key = secret(prefix + "KEY_ID");
  if (environment === "test" && !key.startsWith("rzp_test_")) throw new HttpError(503, "Configure Razorpay test-mode keys for Chefos test.");
  const response = await fetch("https://api.razorpay.com/v1/" + path, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: "Basic " +
        btoa(key + ":" + secret(prefix + "KEY_SECRET")),
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
