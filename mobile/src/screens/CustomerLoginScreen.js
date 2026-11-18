import { useEffect, useRef, useState } from "react";
import { Pressable, Text, TextInput, View, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SocialButtons } from "../components/SocialButtons";
import { socialLogin } from "../auth/socialLogin";
import { NativeBrand } from "../components/BrandSplash";
import { Button, Input, Screen } from "../components/ui";
import { IndiaFlag, NAVY, GOLD, PAPER, s } from "../components/reference";
import { requireSupabase, environment, isTestEnvironment } from "../api/supabase";
export function CustomerLoginScreen({ navigation, onBackToOnboarding }) {
  const [mode, setMode] = useState("phone"),
    [identifier, setIdentifier] = useState(""),
    [password, setPassword] = useState(""),
    [passwordMode, setPasswordMode] = useState(false),
    [sent, setSent] = useState(false),
    [code, setCode] = useState(""),
    [seconds, setSeconds] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const input = useRef(null);
  useEffect(() => {
    if (!seconds) return;
    const timer = setTimeout(() => setSeconds((n) => n - 1), 1000);
    return () => clearTimeout(timer);
  }, [seconds]);
  const address =
    mode === "phone"
      ? {
          phone: identifier.startsWith("+")
            ? identifier.replace(/\s/g, "")
            : "+91" + identifier.replace(/\D/g, ""),
        }
      : { email: identifier.trim() };
  async function checkAccount(client, user) {
    if (!user) return;
    if (isTestEnvironment) { const { error } = await client.rpc("chefos_ensure_profile"); if (error) throw error; }
    const { data, error } = await client
      .from("chefos_profiles")
      .select("role,is_active")
      .eq("id", user.id)
      .single();
    if (error || !data?.is_active || data.role !== "customer") {
      await client.auth.signOut();
      throw new Error(
        "This account cannot access the customer app. Chef partners should use Chefos Partner.",
      );
    }
  }
  async function send() {
    setError("");
    if (
      mode === "phone"
        ? !/^\+[1-9]\d{7,14}$/.test(address.phone)
        : !/^\S+@\S+\.\S+$/.test(address.email)
    ) {
      setError("Enter a valid " + mode + ".");
      return;
    }
    setBusy(true);
    try {
      const client = requireSupabase();
      const { data, error } = passwordMode
        ? await client.auth.signInWithPassword({ ...address, password })
        : await client.auth.signInWithOtp({
            ...address,
            options: {
              shouldCreateUser: true,
              data: { account_type: "customer", chefos_environment: environment },
            },
          });
      if (error) throw error;
      if (passwordMode) await checkAccount(client, data.user);
      if (!passwordMode) {
        setSent(true);
        setCode("");
        setSeconds(30);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function verify() {
    setBusy(true);
    setError("");
    try {
      const client = requireSupabase();
      const { data, error } = await client.auth.verifyOtp({
        ...address,
        token: code,
        type: mode === "phone" ? "sms" : "email",
      });
      if (error) throw error;
      await checkAccount(client, data.user);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function social(provider) {
    setBusy(true);
    setError("");
    try {
      await socialLogin(provider);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Screen background={PAPER} contentContainerStyle={styles.screen}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Go back"
        onPress={() =>
          sent ? (setSent(false), setCode("")) : onBackToOnboarding?.()
        }
        style={styles.back}
      >
        <Ionicons name="chevron-back" size={23} color={NAVY} />
      </Pressable>
      {sent ? (
        <View style={{ gap: 26, marginTop: 24 }}>
          <Text style={[s.title, { textAlign: "center", marginTop: 20 }]}>
            Enter OTP
          </Text>
          <Text style={[s.muted, { textAlign: "center" }]}>
            We've sent a verification code to{"\n"}
            <Text style={{ color: NAVY }}>
              {address.phone || address.email}
            </Text>
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Enter verification code"
            onPress={() => input.current?.focus()}
            style={{ position: "relative", marginVertical: 15 }}
          >
            <View
              style={{ flexDirection: "row", gap: 7, justifyContent: "center" }}
            >
              {Array.from({ length: 6 }, (_, i) => (
                <View
                  key={i}
                  style={{
                    flex: 1,
                    maxWidth: 43,
                    height: 51,
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: i === code.length ? NAVY : "#ddd9d1",
                    justifyContent: "center",
                    alignItems: "center",
                  }}
                >
                  <Text style={{ fontSize: 22, color: NAVY }}>
                    {code[i] || ""}
                  </Text>
                </View>
              ))}
            </View>
            <TextInput
              ref={input}
              accessibilityLabel="Verification code"
              value={code}
              onChangeText={(v) => setCode(v.replace(/\D/g, "").slice(0, 6))}
              keyboardType="number-pad"
              textContentType="oneTimeCode"
              autoComplete="one-time-code"
              maxLength={6}
              autoFocus
              style={{ position: "absolute", inset: 0, opacity: 0.02 }}
            />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={seconds > 0 || busy}
            onPress={send}
          >
            <Text style={[s.muted, { textAlign: "center" }]}>
              {seconds
                ? "Resend OTP in 00:" + String(seconds).padStart(2, "0")
                : "Resend code"}
            </Text>
          </Pressable>
          {error ? (
            <Text accessibilityRole="alert" style={s.error}>
              {error}
            </Text>
          ) : null}
          <Button
            label="Verify"
            disabled={code.length !== 6}
            loading={busy}
            onPress={verify}
          />
        </View>
      ) : (
        <>
          <View style={styles.brand}>
            <NativeBrand size={56} color={NAVY} />
            <Text style={styles.tagline}>Good Food. Closer Home.</Text>
          </View>
          <View style={styles.tabs}>
            {["phone", "email"].map((value) => (
              <Pressable
                key={value}
                accessibilityRole="button"
                accessibilityState={{ selected: mode === value }}
                onPress={() => {
                  setMode(value);
                  setIdentifier("");
                  setError("");
                }}
                style={[
                  styles.tab,
                  { borderBottomColor: mode === value ? GOLD : "#E3DFD9" },
                ]}
              >
                <Text
                  style={[
                    styles.tabText,
                    mode === value && { fontFamily: "Inter_600SemiBold" },
                  ]}
                >
                  {value === "phone" ? "Phone" : "Email"}
                </Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.form}>
            <Input
              hideLabel
              label={mode === "phone" ? "Phone number" : "Email address"}
              value={identifier}
              onChangeText={setIdentifier}
              keyboardType={mode === "phone" ? "phone-pad" : "email-address"}
              placeholder={mode === "phone" ? "98765 43210" : "you@example.com"}
              leading={
                mode === "phone" ? (
                  <View
                    style={{
                      flexDirection: "row",
                      gap: 6,
                      alignItems: "center",
                    }}
                  >
                    <IndiaFlag />
                    <Text
                      style={{
                        fontFamily: "Inter_400Regular",
                        fontSize: 12,
                        color: "#8B8D91",
                      }}
                    >
                      +91
                    </Text>
                  </View>
                ) : null
              }
            />
            {passwordMode ? (
              <Input
                label="Password"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
              />
            ) : null}
            {error ? (
              <Text accessibilityRole="alert" style={s.error}>
                {error}
              </Text>
            ) : null}
            <Button
              label={passwordMode ? "Sign in" : "Send OTP"}
              loading={busy}
              onPress={send}
            />
          </View>
          <View style={styles.divider}>
            <View style={styles.line} />
            <Text style={styles.or}>or continue with</Text>
            <View style={styles.line} />
          </View>
          <SocialButtons disabled={busy} onPress={social} />
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setPasswordMode(!passwordMode);
              setError("");
            }}
            style={{ paddingTop: 22 }}
          >
            <Text style={styles.secondary}>
              {passwordMode
                ? "Use a verification code instead"
                : "Sign in with a password"}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => navigation.navigate("Signup")}
            style={{ paddingTop: 15 }}
          >
            <Text style={styles.secondary}>Create an account with email</Text>
          </Pressable>
          <View style={styles.legal}>
            <Text style={styles.legalText}>
              By continuing, you agree to our
            </Text>
            <Text style={[styles.legalText, { color: NAVY, marginTop: 4 }]}>
              Terms &amp; Conditions and Privacy Policy.
            </Text>
          </View>
        </>
      )}
    </Screen>
  );
}
const styles = StyleSheet.create({
  screen: {
    paddingHorizontal: 26,
    paddingTop: 22,
    paddingBottom: 22,
    flexGrow: 1,
    gap: 0,
  },
  back: { height: 38, width: 34, justifyContent: "center", marginLeft: -5 },
  brand: { alignItems: "center", marginTop: 26, marginBottom: 48 },
  tagline: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: "#454B55",
    marginTop: 16,
  },
  tabs: { flexDirection: "row", marginBottom: 36 },
  tab: {
    flex: 1,
    alignItems: "center",
    paddingBottom: 16,
    borderBottomWidth: 2,
  },
  tabText: { fontFamily: "Inter_400Regular", fontSize: 14, color: NAVY },
  form: { gap: 30 },
  divider: {
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    marginTop: 46,
    marginBottom: 27,
  },
  line: { height: 1, backgroundColor: "#E6E1DA", flex: 1 },
  or: { fontFamily: "Inter_400Regular", fontSize: 12, color: "#656A73" },
  secondary: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: "#7B7E84",
    textAlign: "center",
  },
  legal: { marginTop: "auto", paddingTop: 32, alignItems: "center" },
  legalText: {
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    color: "#747980",
    textAlign: "center",
  },
});
