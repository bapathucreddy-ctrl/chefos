import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { equalHex, hmac, secret } from "../_shared/http.ts";

export async function handle(req: Request): Promise<Response> {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  try {
    const body = await req.text();
    if (body.length > 65536) return new Response("Too large", { status: 413 });
    const signature = req.headers.get("x-razorpay-signature") || "";
    if (!equalHex(signature, await hmac(secret("RAZORPAY_WEBHOOK_SECRET"), body))) {
      return new Response("Invalid signature", { status: 401 });
    }
    const event = JSON.parse(body);
    if (event.event !== "payment.captured") return new Response("Ignored", { status: 200 });
    const payment = event.payload?.payment?.entity;
    if (!payment || payment.status !== "captured") {
      return new Response("Invalid payment", { status: 400 });
    }
    const client = createClient(secret("SUPABASE_URL"), secret("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error } = await client.rpc("chefos_server_capture", {
      p_order: payment.order_id,
      p_payment: payment.id,
      p_amount: payment.amount,
      p_currency: payment.currency,
    });
    if (error) {
      console.error("Capture could not be recorded", error.code);
      return new Response("Retry later", { status: 503 });
    }
    // The account-scoped activation RPC is retried by the customer app. A webhook
    // never substitutes an arbitrary user identity or changes the saved booking.
    return new Response("Recorded", { status: 200 });
  } catch {
    return new Response("Webhook processing unavailable", { status: 503 });
  }
}
