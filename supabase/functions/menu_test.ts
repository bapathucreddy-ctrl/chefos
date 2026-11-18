import { generateMenu, MenuInput, validateMenu } from "./_shared/menu-provider.ts";
import { processMenuJob } from "./_shared/menu-jobs.ts";
import { handle as worker } from "./chefos-menu-worker/index.ts";
const input: MenuInput = { start_date: "2026-11-13", end_date: "2026-11-19", meals: ["lunch"], people_count: 3,
  profile: { age: 30, height_cm: 175, weight_kg: 70, diet: "vegetarian", cuisines: ["south_indian"], allergens: [], non_veg_days: [] } };
const sample = () => ({ days: Array.from({ length: 7 }, (_, i) => ({ date: `2026-11-${13 + i}`, meals: { lunch: {
  title: `Rice dish ${i + 1}`, cuisine: "south_indian", servings: 3, cooking_minutes: 35,
  ingredients: [{ name: "rice", quantity: 200, unit: "g", allergens: [] as string[] }], steps: ["Wash and cook the rice."], storage_notes: "Serve promptly.",
} } })) });
function assert(ok: unknown): asserts ok { if (!ok) throw new Error("Assertion failed"); }
function rejects(fn: () => unknown) { try { fn(); } catch { return; } throw new Error("Expected rejection"); }
function configure() {
  const names = ["OPENAI_API_KEY", "CHEFOS_MENU_MODEL", "CHEFOS_MENU_PROVIDER", "CHEFOS_JOB_SECRET"];
  const previous = Object.fromEntries(names.map((n) => [n, Deno.env.get(n)]));
  Deno.env.set("OPENAI_API_KEY", "test-key"); Deno.env.set("CHEFOS_MENU_MODEL", "test-structured-model"); Deno.env.set("CHEFOS_MENU_PROVIDER", "openai");
  return () => { for (const [n, v] of Object.entries(previous)) if (v === undefined) Deno.env.delete(n); else Deno.env.set(n, v); };
}
Deno.test("AI menu validation checks dates, portions, ingredients, dietary days and hidden allergens", () => {
  assert(validateMenu(sample(), input).days.length === 7);
  const badDate = sample(); badDate.days[0].date = "2026-11-12"; rejects(() => validateMenu(badDate, input));
  const badSize = sample(); badSize.days[0].meals.lunch.servings = 1; rejects(() => validateMenu(badSize, input));
  const badRecipe = sample(); badRecipe.days[0].meals.lunch.ingredients[0].quantity = -1; rejects(() => validateMenu(badRecipe, input));
  const hidden = sample(); hidden.days[0].meals.lunch.steps = ["Add butter to the pan."];
  rejects(() => validateMenu(hidden, { ...input, profile: { ...input.profile, allergens: ["milk"] } }));
  const mislabelled = sample(); mislabelled.days[0].meals.lunch.ingredients[0].name = "paneer";
  rejects(() => validateMenu(mislabelled, { ...input, profile: { ...input.profile, allergens: ["milk"] } }));
  const vegan = sample(); vegan.days[0].meals.lunch.ingredients[0].allergens = ["milk"];
  rejects(() => validateMenu(vegan, { ...input, profile: { ...input.profile, diet: "vegan" } }));
  const animal = sample(); animal.days[0].meals.lunch.ingredients[0].name = "chicken";
  rejects(() => validateMenu(animal, input));
  const noVariety = sample(); noVariety.days.forEach((d) => d.meals.lunch.title = "Same rice"); rejects(() => validateMenu(noVariety, input));
  rejects(() => validateMenu({ ...sample(), injected: "unexpected field" }, input));
  rejects(() => validateMenu(sample(), { ...input, previous_titles: sample().days.map((d) => d.meals.lunch.title) }));
});
Deno.test("OpenAI adapter uses strict Responses schema and rejects incomplete results", async () => {
  const restore = configure(), oldFetch = globalThis.fetch;
  try {
    globalThis.fetch = (_url, init) => {
      const body = JSON.parse(String(init?.body));
      assert(body.store === false && body.text.format.type === "json_schema" && body.text.format.strict === true);
      assert(body.model === "test-structured-model");
      return Promise.resolve(Response.json({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(sample()) }] }] }));
    };
    assert((await generateMenu(input)).provider === "openai");
    globalThis.fetch = () => Promise.resolve(Response.json({ status: "incomplete", output: [] }));
    let failed = false; try { await generateMenu(input); } catch { failed = true; } assert(failed);
  } finally { restore(); globalThis.fetch = oldFetch; }
});
Deno.test("provider absence preserves queued jobs and invalid output retries without leaking content", async () => {
  const restore = configure(), oldFetch = globalThis.fetch;
  try {
    Deno.env.delete("OPENAI_API_KEY");
    assert((await processMenuJob(() => { throw new Error("Must not claim an unconfigured job"); })).awaiting_configuration);
    Deno.env.set("OPENAI_API_KEY", "test-key");
    globalThis.fetch = () => Promise.resolve(Response.json({ status: "completed", output: [] }));
    const calls: [string, Record<string, unknown> | undefined][] = [];
    const result = await processMenuJob((name, args) => {
      calls.push([name, args]);
      return Promise.resolve(name === "chefos_server_claim_menu" ? { id: "job", claim_token: "lease", input } : { saved: false });
    });
    assert(result.saved === false && calls[1][1]?.p_failed === true);
    assert(!Object.hasOwn(calls[1][1] || {}, "profile"));
    Deno.env.set("CHEFOS_JOB_SECRET", "test-job-secret");
    assert((await worker(new Request("https://example.test", { method: "POST", headers: { authorization: "Bearer wrong" } }))).status === 401);
  } finally { restore(); globalThis.fetch = oldFetch; }
});
