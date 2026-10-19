import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { cors, equalHex, hmac, HttpError, json, secret } from "../_shared/http.ts";
import { razorpay } from "../_shared/payments.ts";

// JWT validation is explicit because the gateway may use asymmetric Auth keys.
// Every protected SQL operation still checks auth.uid(), role and ownership.
export async function handle(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(req) });
  if (req.method !== "POST") return json(req, { detail: "Use POST" }, 405);
  try {
    const raw = await req.text();
    if (raw.length > 32768) throw new HttpError(413, "Request is too large");
    let input;
    try {
      input = JSON.parse(raw);
    } catch {
      throw new HttpError(400, "Invalid request");
    }
    const { method = "GET", path = "", data = {}, params = {} } = input;
    if (typeof path !== "string" || !["GET", "POST", "PATCH", "PUT", "DELETE"].includes(method)) {
      throw new HttpError(400, "Invalid operation");
    }
    const route = path.replace(/^\/+|\/+$/g, "");
    const url = secret("SUPABASE_URL"), key = secret("SUPABASE_ANON_KEY");
    const authorization = req.headers.get("authorization") || "";
    const client = createClient(url, key, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    async function rpc(name: string, args: Record<string, unknown> = {}) {
      const { data: result, error } = await client.rpc(name, args);
      if (error) throw new HttpError(error.code === "42501" ? 403 : 400, error.message);
      if (result?.error) throw new HttpError(result.status || 400, result.detail);
      return result;
    }
    if (route === "health" && method === "GET") {
      return json(req, { status: "ok", backend: "supabase" });
    }
    if (route === "pricing" && method === "GET") {
      return json(req, await rpc("chefos_pricing_catalog"));
    }
    const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) throw new HttpError(401, "Sign in to continue");
    const { data: auth, error: authError } = await client.auth.getUser(token);
    if (authError || !auth.user) {
      throw new HttpError(401, "Your session has expired. Sign in again.");
    }
    // Checking a fresh database profile also disables suspended accounts before
    // any service-role payment call can run.
    const { data: profile, error: profileError } = await client.from("chefos_profiles").select(
      "id,role,is_active",
    ).eq("id", auth.user.id).single();
    if (profileError || !profile?.is_active) {
      throw new HttpError(403, "An active Chefos account is required");
    }
    const payload = { ...(method === "GET" ? params : data) };
    const routes: Record<string, string> = {
      "GET menu/preference": "preference.get",
      "POST menu/preference": "preference.save",
      "PATCH menu/preference": "preference.save",
      "GET menu/weekly": "menu.weekly",
      "GET menu/today": "menu.today",
      "GET subscription/active": "subscription.active",
      "GET chefs/assigned": "chef.assigned",
      "GET chefs": "chefs.list",
      "POST chefs/assign": "chef.assign",
      "GET chefs/partner/me": "partner.me",
      "POST chefs/partner/availability": "partner.availability",
      "POST chefs/partner/location": "partner.location",
      "POST chefs/partner/instant/respond": "instant.respond",
      "GET chefs/instant/request/latest": "instant.latest",
      "POST chefs/instant/request": "instant.create",
      "GET service/my-otp": "service.my",
      "POST feedback/submit": "feedback.submit",
      "GET history/instant": "history.instant",
      "GET chefs/partner/history": "history.partner",
    };
    const action = routes[method + " " + route];
    if (action) {
      return json(req, await rpc("chefos_mobile_action", { p_action: action, p_data: payload }));
    }
    const requestMatch = route.match(/^chefs\/instant\/request\/([a-f0-9-]{36})$/i);
    if (method === "GET" && requestMatch) {
      return json(
        req,
        await rpc("chefos_mobile_action", {
          p_action: "instant.detail",
          p_data: { request_id: requestMatch[1] },
        }),
      );
    }
    const serviceMatch = route.match(
      /^chefs\/partner\/service\/([a-f0-9-]{36})\/(journey|start-otp|start-verify|end-otp|end-verify)$/i,
    );
    if (method === "POST" && serviceMatch) {
      const actions: Record<string, string> = {
        journey: "journey",
        "start-otp": "start.request",
        "start-verify": "start.verify",
        "end-otp": "end.request",
        "end-verify": "end.verify",
      };
      return json(
        req,
        await rpc("chefos_service_action", {
          p_id: serviceMatch[1],
          p_action: actions[serviceMatch[2]],
          p_code: data.otp || data.code || null,
        }),
      );
    }
    if (
      method === "GET" && ["subscriptions/price-preview", "instant/price-preview"].includes(route)
    ) {
      const meals = typeof params.meal_type === "string"
        ? params.meal_type.split(",").filter(Boolean)
        : [];
      return json(
        req,
        await rpc("chefos_price_quote", {
          p_chef: params.chef || null,
          p_people: Number(params.people_count || 3),
          p_cycle: route.startsWith("instant") ? "instant" : params.plan_cycle || "monthly",
          p_meals: meals.length || Number(params.meal_count || 1),
        }),
      );
    }
    if (method === "POST" && ["menu/generate", "menu/generate-weekly"].includes(route)) {
      // A deterministic menu is available without paid AI keys. It is labelled
      // honestly and respects vegetarian preferences; never claim AI generated it.
      const preference = await rpc("chefos_mobile_action", { p_action: "preference.get" });
      const dishes = {
        breakfast: [
          "Idli & sambar",
          "Vegetable poha",
          "Moong dal chilla",
          "Masala dosa",
          "Vegetable upma",
          "Stuffed paratha & curd",
          "Ragi dosa",
        ],
        lunch: [
          "Dal tadka, rice & beans",
          "Chole, roti & salad",
          "Rajma chawal",
          "Sambar rice & poriyal",
          "Palak paneer & roti",
          "Vegetable khichdi & curd",
          "Vegetable pulao & raita",
        ],
        dinner: [
          "Mixed vegetable curry & roti",
          "Dal palak & rice",
          "Paneer bhurji & roti",
          "Vegetable stew & appam",
          "Lemon rice & dal",
          "Aloo gobi & phulka",
          "Dal makhani & jeera rice",
        ],
      };
      if (preference.diet_type === "vegan") {
        throw new HttpError(400, "A vegan menu needs a chef review before it can be saved.");
      }
      if (preference.allergies?.length || preference.food_allergies?.length) {
        throw new HttpError(400, "Ask your chef to review allergies before generating a menu.");
      }
      return json(
        req,
        await rpc("chefos_save_menu", { p_dishes: dishes, p_generation: { source: "curated" } }),
      );
    }
    if (method === "POST" && route === "subscription/create") {
      return json(
        req,
        await rpc("chefos_activate_order", { p_order: data.razorpay_order_id || data.order_id }),
      );
    }
    if (method === "POST" && ["payments/create-order", "payments/verify"].includes(route)) {
      if (profile.role !== "customer") throw new HttpError(403, "Customer account required");
      const server = createClient(url, secret("SUPABASE_SERVICE_ROLE_KEY"), {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      async function serverRpc(name: string, args: Record<string, unknown>) {
        const { data: result, error } = await server.rpc(name, args);
        if (error) throw new HttpError(400, error.message);
        return result;
      }
      if (route === "payments/create-order") {
        const prepared = await serverRpc("chefos_server_prepare_order", {
          p_actor: auth.user.id,
          p_booking: data.subscription_payload || data,
        });
        const order = await razorpay("orders", {
          amount: prepared.quote.amount_paise,
          currency: "INR",
          receipt: crypto.randomUUID().replaceAll("-", ""),
          notes: { chefos_user: auth.user.id },
        });
        if (order.amount !== prepared.quote.amount_paise || order.currency !== "INR") {
          throw new HttpError(502, "Payment order amount mismatch");
        }
        const saved = await serverRpc("chefos_server_record_order", {
          p_actor: auth.user.id,
          p_order: order.id,
          p_prepared: prepared,
        });
        return json(req, {
          ...saved,
          key: secret("RAZORPAY_KEY_ID"),
          name: "Chefos",
          description: "Your personal chef service",
        });
      }
      const orderId = String(data.razorpay_order_id || ""),
        paymentId = String(data.razorpay_payment_id || ""),
        signature = String(data.razorpay_signature || "");
      if (!/^order_[a-zA-Z0-9]+$/.test(orderId) || !/^pay_[a-zA-Z0-9]+$/.test(paymentId)) {
        throw new HttpError(400, "Invalid payment reference");
      }
      const expected = await hmac(secret("RAZORPAY_KEY_SECRET"), orderId + "|" + paymentId);
      if (!equalHex(expected, signature)) {
        throw new HttpError(400, "Payment signature could not be verified");
      }
      const saved = await serverRpc("chefos_server_payment", {
        p_actor: auth.user.id,
        p_order: orderId,
      });
      const payment = await razorpay("payments/" + paymentId);
      if (
        payment.status !== "captured" || payment.order_id !== orderId ||
        payment.amount !== saved.amount || payment.currency !== saved.currency
      ) {
        throw new HttpError(
          409,
          "Payment capture is pending. Your plan will activate after capture is confirmed.",
        );
      }
      await serverRpc("chefos_server_capture", {
        p_order: orderId,
        p_payment: paymentId,
        p_amount: payment.amount,
        p_currency: payment.currency,
      });
      return json(req, {
        verified: true,
        subscription: await rpc("chefos_activate_order", { p_order: orderId }),
      });
    }
    throw new HttpError(404, "This operation is not available");
  } catch (error) {
    if (error instanceof HttpError) return json(req, { detail: error.message }, error.status);
    console.error("Chefos API failure", error instanceof Error ? error.name : "Unknown");
    return json(
      req,
      { detail: "The service could not complete this request. Please try again." },
      500,
    );
  }
}
