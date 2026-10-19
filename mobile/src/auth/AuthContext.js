import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AppState, Linking } from "react-native";
import Constants from "expo-constants";
import { supabase, requireSupabase } from "../api/supabase";
import { setCacheOwner } from "../api/cache";
import { ROLE_CHEF, ROLE_USER } from "./session";

const AuthContext = createContext(null);
export function AuthProvider({ children }) {
  const [state, setState] = useState({
    booting: true,
    session: null,
    profile: null,
  });
  const [recovering, setRecovering] = useState(false);
  const appRole =
    Constants.expoConfig?.extra?.appVariant === "chef" ? "chef" : "customer";
  const generation = useRef(0);
  const mounted = useRef(true);
  const hydrate = useCallback(
    async (session) => {
      const current = ++generation.current;
      if (!session) {
        setCacheOwner(null);
        if (mounted.current)
          setState({ booting: false, session: null, profile: null });
        return;
      }
      const { data: profile, error } = await supabase
        .from("chefos_profiles")
        .select("id,username,email,phone,full_name,city,role,is_active")
        .eq("id", session.user.id)
        .single();
      if (current !== generation.current || !mounted.current) return;
      if (error || !profile?.is_active || profile.role !== appRole) {
        setCacheOwner(null);
        setState({ booting: false, session: null, profile: null });
        await supabase.auth.signOut();
        return;
      }
      setCacheOwner(session.user.id);
      setState({ booting: false, session, profile });
    },
    [appRole],
  );
  useEffect(() => {
    mounted.current = true;
    if (!supabase) {
      const timer = setTimeout(
        () => setState({ booting: false, session: null, profile: null }),
        0,
      );
      return () => {
        mounted.current = false;
        clearTimeout(timer);
      };
    }
    supabase.auth
      .getSession()
      .then(({ data }) => hydrate(data.session))
      .catch(() => hydrate(null));
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      setTimeout(() => {
        if (mounted.current) {
          if (event === "PASSWORD_RECOVERY") setRecovering(true);
          hydrate(session);
        }
      }, 0);
    });
    async function openLink(url) {
      if (!url) return;
      const scheme =
        Constants.expoConfig?.extra?.appVariant === "chef"
          ? "chefos-chef:"
          : "chefos-user:";
      if (!url.startsWith(scheme + "//")) return;
      try {
        const parsed = new URL(url.replace("#", "?")),
          params = parsed.searchParams;
        if (params.get("access_token") && params.get("refresh_token")) {
          if (params.get("type") === "recovery") setRecovering(true);
          await supabase.auth.setSession({
            access_token: params.get("access_token"),
            refresh_token: params.get("refresh_token"),
          });
        } else if (params.get("code")) {
          await supabase.auth.exchangeCodeForSession(params.get("code"));
        }
      } catch {
        /* Invalid or expired links leave the sign-in screen available. */
      }
    }
    Linking.getInitialURL().then(openLink);
    const links = Linking.addEventListener("url", (event) =>
      openLink(event.url),
    );
    const appState = AppState.addEventListener("change", (status) => {
      if (status === "active") supabase.auth.startAutoRefresh();
      else supabase.auth.stopAutoRefresh();
    });
    return () => {
      mounted.current = false;
      generation.current++;
      subscription.unsubscribe();
      appState.remove();
      links.remove();
    };
  }, [hydrate]);
  const login = useCallback(
    async ({ role, username, email, password }) => {
      const client = requireSupabase();
      const loginEmail = String(email || username || "")
        .trim()
        .toLowerCase();
      if (!loginEmail.includes("@"))
        throw new Error("Use the email address linked to your Chefos account.");
      const { data, error } = await client.auth.signInWithPassword({
        email: loginEmail,
        password,
      });
      if (error) throw error;
      const { data: profile, error: profileError } = await client
        .from("chefos_profiles")
        .select("*")
        .eq("id", data.user.id)
        .single();
      const expected = role === ROLE_CHEF ? "chef" : "customer";
      if (profileError || !profile?.is_active || profile.role !== expected) {
        await client.auth.signOut();
        throw new Error(`This account cannot access the ${expected} app.`);
      }
      await hydrate(data.session);
    },
    [hydrate],
  );
  const signupUser = useCallback(async ({ username, email, password }) => {
    const { data, error } = await requireSupabase().auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: {
        emailRedirectTo: "chefos-user://auth/confirm",
        data: { username: username.trim(), account_type: "customer" },
      },
    });
    if (error) throw error;
    return { requiresConfirmation: !data.session };
  }, []);
  const registerChef = useCallback(async (payload) => {
    const { data, error } = await requireSupabase().auth.signUp({
      email: payload.email.trim().toLowerCase(),
      password: payload.password,
      options: {
        emailRedirectTo: "chefos-chef://auth/confirm",
        data: {
          username: payload.username.trim(),
          name: payload.name,
          speciality: payload.speciality,
          phone: payload.phone,
          account_type: "chef",
        },
      },
    });
    if (error) throw error;
    return { requiresConfirmation: !data.session };
  }, []);
  const logout = useCallback(async () => {
    setRecovering(false);
    setCacheOwner(null);
    generation.current++;
    setState({ booting: false, session: null, profile: null });
    if (supabase) await supabase.auth.signOut();
  }, []);
  const finishRecovery = useCallback(() => setRecovering(false), []);
  const value = useMemo(
    () => ({
      ...state,
      recovering,
      finishRecovery,
      role:
        state.profile?.role === "chef"
          ? ROLE_CHEF
          : state.profile?.role === "customer"
            ? ROLE_USER
            : null,
      username: state.profile?.username || "",
      accessToken: state.session?.access_token || "",
      isAuthenticated: Boolean(state.session && state.profile),
      login,
      signupUser,
      registerChef,
      logout,
    }),
    [
      state,
      recovering,
      finishRecovery,
      login,
      signupUser,
      registerChef,
      logout,
    ],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth requires AuthProvider");
  return context;
}
export { ROLE_USER, ROLE_CHEF };
