import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient, processLock } from "@supabase/supabase-js";
import Constants from "expo-constants";
export const isTestEnvironment = process.env.EXPO_PUBLIC_CHEFOS_ENVIRONMENT === "test";
export const environment = isTestEnvironment ? "test" : "production";
export const tableName = (name) => isTestEnvironment && !name.endsWith("_test") ? name + "_test" : name;
export const edgeFunctionName = (name) => isTestEnvironment && !name.endsWith("-test") ? name + "-test" : name;

export const supabaseUrl =
  process.env.EXPO_PUBLIC_SUPABASE_URL ||
  "https://gvkzgipicojtlzwdnthk.supabase.co";
const key =
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const variant =
  Constants.expoConfig?.extra?.appVariant === "chef" ? "chef" : "user";
export const authScheme = `chefos-${variant}${isTestEnvironment ? "-test" : ""}`;
export const supabase = key
  ? createClient(supabaseUrl, key, {
      auth: {
        lock: processLock,
        storage: AsyncStorage,
        storageKey: `chefos-${variant}-supabase-auth${isTestEnvironment ? "-test" : ""}`,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    })
  : null;

if (supabase && isTestEnvironment) {
  const from = supabase.from.bind(supabase), rpc = supabase.rpc.bind(supabase), functions = supabase.functions;
  const invoke = functions.invoke.bind(functions);
  supabase.from = (name) => from(tableName(name));
  supabase.rpc = (name, ...args) => rpc(tableName(name), ...args);
  functions.invoke = (name, ...args) => invoke(edgeFunctionName(name), ...args);
  Object.defineProperty(supabase, "functions", { value: functions });
}

export function requireSupabase() {
  if (!supabase)
    throw new Error(
      "The Chefos workspace connection is pending setup. Please try again after setup is complete.",
    );
  return supabase;
}
