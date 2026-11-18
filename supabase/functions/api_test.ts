import { handle } from "./chefos-api/handler.ts";
import { handle as webhook } from "./chefos-payments-webhook/handler.ts";
import { equalHex, hmac } from "./_shared/http.ts";
function assert(value: unknown, message = "Assertion failed"): asserts value {
  if (!value) throw new Error(message);
}
const env = {
  SUPABASE_URL: "https://gvkzgipicojtlzwdnthk.supabase.co",
  SUPABASE_ANON_KEY: "test-public",
  SUPABASE_SERVICE_ROLE_KEY: "test-service",
  RAZORPAY_KEY_SECRET: "test-secret",
  RAZORPAY_KEY_ID: "test-id",
  RAZORPAY_WEBHOOK_SECRET: "test-webhook",
};
for (const [k, v] of Object.entries(env)) Deno.env.set(k, v);
function request(path: string, data = {}, authorized = true, method = "POST") {
  return new Request("https://example.test/functions/v1/chefos-api", {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(authorized ? { Authorization: "Bearer test-token" } : {}),
    },
    ...(method === "POST"
      ? {
        body: JSON.stringify({
          method: path.startsWith("GET ") ? "GET" : "POST",
          path: path.replace(/^GET /, ""),
          data,
        }),
      }
      : {}),
  });
}
function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
Deno.test("API requires authentication, rejects malformed bodies and methods", async () => {
  assert((await handle(request("chefs", {}, false))).status === 401);
  assert((await handle(request("chefs", {}, false, "GET"))).status === 405);
  assert(
    (await handle(new Request("https://example.test", { method: "POST", body: "bad" }))).status ===
      400,
  );
  assert(
    (await handle(new Request("https://example.test", { method: "POST", body: "x".repeat(32769) })))
      .status === 413,
  );
});
Deno.test("Auth verification rejects invalid tokens and suspended profiles before privileged calls", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = () => Promise.resolve(response({ msg: "Invalid JWT" }, 401));
    assert((await handle(request("payments/create-order"))).status === 401);
    globalThis.fetch = (input) =>
      Promise.resolve(
        String(input).includes("/auth/v1/user")
          ? response({ id: "customer", email: "a@example.test" })
          : response({ id: "customer", role: "customer", is_active: false }),
      );
    assert((await handle(request("payments/create-order"))).status === 403);
  } finally {
    globalThis.fetch = original;
  }
});
Deno.test("Diet profile routes preserve owner scope and return edit conflicts", async () => {
  const original = globalThis.fetch;
  let role = "customer", conflict = false, savedArgs: Record<string, unknown> = {};
  try {
    globalThis.fetch = async (input, init) => {
      const url = String(input);
      if (url.includes("/auth/v1/user")) return response({ id: "customer" });
      if (url.includes("/chefos_profiles")) return response({ id: "customer", role, is_active: true });
      if (url.includes("/chefos_diet_profile")) {
        savedArgs = JSON.parse(String(init?.body));
        if (conflict) return response({ code: "40001", message: "Profile changed elsewhere" }, 400);
        return response({ profile: savedArgs.p_profile, revision: 1, ready: true });
      }
      return response({ message: "Unexpected request" }, 500);
    };
    assert((await handle(request("GET preferences/diet"))).status === 200);
    assert(savedArgs.p_profile === null);
    const write = () => new Request("https://example.test/functions/v1/chefos-api", {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer test-token" },
      body: JSON.stringify({ method: "PUT", path: "preferences/diet", data: { profile: { age: 30 }, revision: 0, user_id: "someone-else" } }),
    });
    assert((await handle(write())).status === 200);
    assert(savedArgs.p_expected_revision === 0 && !Object.hasOwn(savedArgs, "user_id"));
    conflict = true;
    assert((await handle(write())).status === 409);
    role = "chef";
    assert((await handle(write())).status === 403);
  } finally { globalThis.fetch = original; }
});

Deno.test("Payment mismatch never reaches capture or activation", async () => {
  const original = globalThis.fetch;
  let captured = false;
  try {
    globalThis.fetch = (input) => {
      const url = String(input);
      if (url.includes("/auth/v1/user")) {
        return Promise.resolve(response({ id: "customer", email: "a@example.test" }));
      }
      if (url.includes("/chefos_profiles")) {
        return Promise.resolve(response({ id: "customer", role: "customer", is_active: true }));
      }
      if (url.includes("/chefos_server_payment")) {
        return Promise.resolve(
          response({ order_id: "order_test", amount: 429000, currency: "INR" }),
        );
      }
      if (url.includes("api.razorpay.com")) {
        return Promise.resolve(
          response({
            id: "pay_test",
            order_id: "order_test",
            amount: 1,
            currency: "INR",
            status: "captured",
          }),
        );
      }
      captured = true;
      return Promise.resolve(response({}));
    };
    const signature = await hmac("test-secret", "order_test|pay_test");
    const result = await handle(
      request("payments/verify", {
        razorpay_order_id: "order_test",
        razorpay_payment_id: "pay_test",
        razorpay_signature: signature,
      }),
    );
    assert(result.status === 409);
    assert(!captured);
  } finally {
    globalThis.fetch = original;
  }
});
Deno.test("Webhook rejects forged signatures and acknowledges irrelevant signed events", async () => {
  const body = JSON.stringify({ event: "order.created" });
  assert(
    (await webhook(
      new Request("https://example.test", {
        method: "POST",
        body,
        headers: { "x-razorpay-signature": "0".repeat(64) },
      }),
    )).status === 401,
  );
  assert(
    (await webhook(
      new Request("https://example.test", {
        method: "POST",
        body,
        headers: { "x-razorpay-signature": await hmac("test-webhook", body) },
      }),
    )).status === 200,
  );
  assert(!equalHex("x".repeat(64), "x".repeat(64)));
  assert(
    equalHex(
      await hmac("key", "message"),
      "6e9ef29b75fffc5b7abae527d58fdadb2fe42e7219011976917343065f58ed4a",
    ),
  );
});
