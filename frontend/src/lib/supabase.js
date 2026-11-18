import { createClient } from "@supabase/supabase-js";
export const isTestEnvironment = import.meta.env.VITE_CHEFOS_ENVIRONMENT === "test" || import.meta.env.MODE === "test";

export const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL ||
  "https://gvkzgipicojtlzwdnthk.supabase.co";
const key =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY;
export const supabaseConfigured = Boolean(key);
export const supabase = key
  ? createClient(supabaseUrl, key, {
      auth: {
        storageKey: isTestEnvironment ? "chefos-admin-auth-test" : "chefos-admin-auth",
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

if (supabase && isTestEnvironment) {
  const from = supabase.from.bind(supabase), rpc = supabase.rpc.bind(supabase), functions = supabase.functions;
  const invoke = functions.invoke.bind(functions);
  supabase.from = (name) => from(name.endsWith("_test") ? name : name + "_test");
  supabase.rpc = (name, ...args) => rpc(name.endsWith("_test") ? name : name + "_test", ...args);
  functions.invoke = (name, ...args) => invoke(name.endsWith("-test") ? name : name + "-test", ...args);
  Object.defineProperty(supabase, "functions", { value: functions });
}

export async function ops(section, params = {}) {
  if (!supabase)
    throw new Error("The admin workspace connection is pending setup.");
  if (section === "live-map") {
    const { data, error } = await supabase.rpc("chefos_discovery_map");
    if (error) throw error;
    return data;
  }
  if (section === "communities") {
    const { data, error } = await supabase.rpc("chefos_ops_buildings");
    if (error) throw error;
    return data;
  }
  if (["chef-safety", "disputes"].includes(section)) {
    const { data, error } = await supabase.rpc(section === "chef-safety" ? "chefos_ops_safety_data" : "chefos_ops_complaints");
    if (error) throw error;
    return data;
  }
  const { data, error } = await supabase.rpc("chefos_ops_data", {
    p_section: section,
    p_search: params.search || "",
    p_page: params.page || 1,
  });
  if (error) throw error;
  return data;
}
