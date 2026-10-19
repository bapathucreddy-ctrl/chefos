import { Platform } from "react-native";
import * as WebBrowser from "expo-web-browser";
import { requireSupabase } from "../api/supabase";
WebBrowser.maybeCompleteAuthSession();

export async function socialLogin(provider) {
  const client = requireSupabase();
  const redirect =
    Platform.OS === "web"
      ? `${window.location.origin}/auth/confirm`
      : "chefos-user://auth/confirm";
  const { data, error } = await client.auth.signInWithOAuth({
    provider,
    options: { redirectTo: redirect, skipBrowserRedirect: true },
  });
  if (error) throw error;
  if (!data.url)
    throw new Error("Sign-in could not be started. Please try again.");
  const result = await WebBrowser.openAuthSessionAsync(data.url, redirect);
  if (result.type !== "success") return;
  if (
    !result.url.startsWith(redirect + "#") &&
    !result.url.startsWith(redirect + "?")
  )
    throw new Error("The sign-in callback was not recognised.");
  const params = new URLSearchParams(
    result.url.split("#")[1] || result.url.split("?")[1] || "",
  );
  if (params.get("error"))
    throw new Error(
      params.get("error_description") || "Sign-in was not completed.",
    );
  if (params.get("code")) {
    const { error } = await client.auth.exchangeCodeForSession(
      params.get("code"),
    );
    if (error) throw error;
  } else if (params.get("access_token") && params.get("refresh_token")) {
    const { error } = await client.auth.setSession({
      access_token: params.get("access_token"),
      refresh_token: params.get("refresh_token"),
    });
    if (error) throw error;
  } else
    throw new Error("The sign-in session was not returned. Please try again.");
}
