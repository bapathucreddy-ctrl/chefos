import { createClient } from "@supabase/supabase-js";

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
        storageKey: "chefos-admin-auth",
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

export async function ops(section, params = {}) {
  if (!supabase)
    throw new Error("The admin workspace connection is pending setup.");
  const { data, error } = await supabase.rpc("chefos_ops_data", {
    p_section: section,
    p_search: params.search || "",
    p_page: params.page || 1,
  });
  if (error) throw error;
  return data;
}
