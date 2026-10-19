import { requireSupabase } from "./supabase";
import { markCacheOwner } from "./cache";

async function request(method, path, body, options = {}) {
  const client = requireSupabase();
  const {
    data: { session },
  } = await client.auth.getSession();
  const owner = session?.user?.id;
  const { data, error } = await client.functions.invoke("chefos-api", {
    body: {
      method,
      path: path.replace(/^\/+|\/+$/g, ""),
      data: body || {},
      params: options.params || {},
    },
  });
  if (error || data?.error) {
    let payload = data;
    let status = error?.context?.status || data?.status || 400;
    if (error?.context instanceof Response) {
      try {
        payload = await error.context.json();
      } catch {}
    }
    const failure = new Error(
      payload?.detail || error?.message || "Unable to complete this request.",
    );
    failure.response = { status, data: payload || { detail: failure.message } };
    throw failure;
  }
  markCacheOwner(data, owner);
  return { data, status: 200 };
}

// Compatibility boundary for the native screens. Auth and business requests now
// go to Supabase; no Django URL or JWT refresh endpoint remains on this path.
export const api = {
  get: (path, options) => request("GET", path, null, options),
  post: (path, data, options) => request("POST", path, data, options),
  patch: (path, data, options) => request("PATCH", path, data, options),
  put: (path, data, options) => request("PUT", path, data, options),
  delete: (path, options) => request("DELETE", path, null, options),
};
