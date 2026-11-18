import { compareSelfie } from "./_shared/selfie-provider.ts";
import { validateSelfie } from "./_shared/selfies.ts";

function assert(value: unknown): asserts value { if (!value) throw new Error("Assertion failed"); }
const photo = new Blob([new Uint8Array(200)], { type: "image/jpeg" });
const assessment = (score = 95) => ({ status: "Approved", score, method: "PASSIVE", warnings: [], user_image: { entities: [{}] }, ref_image: { entities: [{}] } });

Deno.test("selfie provider performs liveness before pinned-reference comparison and disables persisted API sessions", async () => {
  const oldFetch = globalThis.fetch;
  const oldKey = Deno.env.get("DIDIT_API_KEY");
  Deno.env.set("DIDIT_API_KEY", "test-didit-key");
  const paths: string[] = [];
  try {
    globalThis.fetch = async (url, options) => {
      paths.push(String(url));
      assert(new Headers(options?.headers).get("x-api-key") === "test-didit-key");
      assert(options?.body instanceof FormData);
      assert(options.body.get("save_api_request") === "false");
      assert(options.body.get("user_image") instanceof Blob);
      const id = options.body.get("vendor_data");
      if (String(url).includes("face-match")) {
        assert(options.body.get("ref_image") instanceof Blob);
        return Response.json({ request_id: "match-test", vendor_data: id, face_match: assessment(99) });
      }
      return Response.json({ request_id: "live-test", vendor_data: id, liveness: assessment() });
    };
    const result = await compareSelfie("attempt-test", photo, photo);
    assert(result.match && result.liveness && paths.length === 2);
    assert(paths[0].endsWith("/passive-liveness/") && paths[1].endsWith("/face-match/"));
    paths.length = 0;
    const enrolment = await compareSelfie("registration-test", photo);
    assert(enrolment.liveness && !enrolment.match && paths.length === 1);
  } finally {
    globalThis.fetch = oldFetch;
    if (oldKey === undefined) Deno.env.delete("DIDIT_API_KEY"); else Deno.env.set("DIDIT_API_KEY", oldKey);
  }
});

Deno.test("selfie provider rejects spoof, mismatch, multiple faces, review status and unbound results", async () => {
  const oldFetch = globalThis.fetch;
  const oldKey = Deno.env.get("DIDIT_API_KEY");
  Deno.env.set("DIDIT_API_KEY", "test-didit-key");
  try {
    for (const invalid of [
      { ...assessment(), status: "Declined" },
      { ...assessment(), status: "In Review" },
      { ...assessment(), user_image: { entities: [{}, {}] } },
      { ...assessment(), score: 1 },
      { ...assessment(), warnings: [{ log_type: "error" }] },
    ]) {
      let calls = 0;
      globalThis.fetch = async () => { calls++; return Response.json({ request_id: "invalid", vendor_data: "attempt-test", liveness: invalid }); };
      const result = await compareSelfie("attempt-test", photo, photo);
      assert(!result.liveness && !result.match && calls === 1);
    }
    globalThis.fetch = async (url) => Response.json({ request_id: "mismatch", vendor_data: "attempt-test",
      ...(String(url).includes("face-match") ? { face_match: { ...assessment(), status: "Declined" } } : { liveness: assessment() }) });
    const mismatch = await compareSelfie("attempt-test", photo, photo);
    assert(mismatch.liveness && !mismatch.match);
    globalThis.fetch = async () => Response.json({ request_id: "wrong", vendor_data: "another-attempt", liveness: assessment() });
    let rejected = false;
    try { await compareSelfie("attempt-test", photo); } catch { rejected = true; }
    assert(rejected);
  } finally {
    globalThis.fetch = oldFetch;
    if (oldKey === undefined) Deno.env.delete("DIDIT_API_KEY"); else Deno.env.set("DIDIT_API_KEY", oldKey);
  }
});

Deno.test("selfie upload rejects oversized files and non-JPEG content", () => {
  for (const bytes of [new Uint8Array(200), new Uint8Array(5242881)]) {
    let rejected = false;
    try { validateSelfie(bytes); } catch { rejected = true; }
    assert(rejected);
  }
});
