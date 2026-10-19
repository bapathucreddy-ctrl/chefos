import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient, processLock } from "@supabase/supabase-js";
import Constants from "expo-constants";

export const supabaseUrl =
  process.env.EXPO_PUBLIC_SUPABASE_URL ||
  "https://gvkzgipicojtlzwdnthk.supabase.co";
const key =
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const variant =
  Constants.expoConfig?.extra?.appVariant === "chef" ? "chef" : "user";
export const supabase = key
  ? createClient(supabaseUrl, key, {
      auth: {
        lock: processLock,
        storage: AsyncStorage,
        storageKey: `chefos-${variant}-supabase-auth`,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    })
  : null;

export function requireSupabase() {
  if (!supabase)
    throw new Error(
      "The Chefos workspace connection is pending setup. Please try again after setup is complete.",
    );
  return supabase;
}
