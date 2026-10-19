import { useState } from "react";
import {
  ImageBackground,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useAuth } from "../auth/AuthContext";
import { Button, Input, Screen } from "../components/ui";
import { NativeBrand } from "../components/BrandSplash";
import { palette, typography } from "../theme";
import { requireSupabase } from "../api/supabase";

export function AuthScreen({ navigation, route }) {
  const role = route.params?.role === "chef" ? "chef" : "user";
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  async function reset() {
    if (!username.trim().includes("@")) {
      setError("Enter your email address first.");
      return;
    }
    setLoading(true);
    try {
      const { error } = await requireSupabase().auth.resetPasswordForEmail(
        username.trim(),
        {
          redirectTo: `${role === "chef" ? "chefos-chef" : "chefos-user"}://reset-password`,
        },
      );
      if (error) throw error;
      Alert.alert(
        "Check your email",
        "If an account matches this address, a password reset link will arrive shortly. Open it on this device.",
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }
  async function submit() {
    if (!username.trim() || !password) {
      setError("Enter your email and password to continue.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await login({ role, username: username.trim(), password });
    } catch (err) {
      setError(
        err?.response?.data?.detail ||
          err?.message ||
          "We couldn’t sign you in. Check your details and try again.",
      );
    } finally {
      setLoading(false);
    }
  }
  return (
    <Screen contentContainerStyle={styles.content}>
      <ImageBackground
        source={require("../assets/meal-hero.jpg")}
        style={styles.banner}
        imageStyle={{ borderBottomLeftRadius: 32, borderBottomRightRadius: 32 }}
      >
        <LinearGradient
          colors={["rgba(12,30,56,0.97)", "rgba(12,30,56,0.78)"]}
          style={styles.bannerOverlay}
        >
          <NativeBrand size={37} />
          <Text style={styles.kicker}>
            {role === "chef"
              ? "THE CHEF PARTNER EXPERIENCE"
              : "A LITTLE TASTE OF HOME"}
          </Text>
          <Text style={styles.bannerTitle}>
            {role === "chef"
              ? "Your passion.\nTheir favourite meal."
              : "Good food.\nBetter everydays."}
          </Text>
          <Text style={styles.bannerSubtitle}>
            {role === "chef"
              ? "Cook what you love. We’ll handle the rest."
              : "Your personal chef. Your kind of comfort."}
          </Text>
        </LinearGradient>
      </ImageBackground>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.form}
      >
        <Text style={styles.welcome}>
          Welcome back<Text style={{ color: palette.accent }}> .</Text>
        </Text>
        <Text style={styles.subtitle}>
          {role === "chef"
            ? "Sign in and make someone’s day delicious."
            : "A delicious day starts right here."}
        </Text>
        <View style={styles.inputs}>
          <Input
            label="Email"
            value={username}
            onChangeText={setUsername}
            placeholder="you@example.com"
            keyboardType="email-address"
          />
          <View>
            <Input
              label="Password"
              value={password}
              onChangeText={setPassword}
              placeholder="Enter your password"
              secureTextEntry={!showPassword}
            />
            <Pressable
              accessibilityLabel={
                showPassword ? "Hide password" : "Show password"
              }
              hitSlop={12}
              style={styles.eye}
              onPress={() => setShowPassword(!showPassword)}
            >
              <Ionicons
                name={showPassword ? "eye-off-outline" : "eye-outline"}
                size={20}
                color={palette.muted}
              />
            </Pressable>
          </View>
          {error ? (
            <Text accessibilityRole="alert" style={styles.error}>
              {error}
            </Text>
          ) : null}
          <Button
            label={loading ? "Signing in…" : "Let’s get cooking   →"}
            onPress={submit}
            loading={loading}
            variant="gold"
          />
          <Pressable
            accessibilityRole="button"
            onPress={reset}
            disabled={loading}
          >
            <Text
              style={{ ...typography.body, textAlign: "center", fontSize: 12 }}
            >
              Forgot your password?
            </Text>
          </Pressable>
        </View>
        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>NEW TO CHEFOS?</Text>
          <View style={styles.dividerLine} />
        </View>
        <Button
          label={
            role === "chef" ? "Join as a chef partner" : "Create your account"
          }
          variant="outline"
          onPress={() =>
            navigation.navigate(role === "chef" ? "ChefRegister" : "Signup")
          }
        />
        <View style={styles.trust}>
          <Ionicons name="shield-checkmark-outline" size={15} color="#a58c57" />
          <Text style={styles.trustText}>
            Thoughtfully planned. Freshly prepared.
          </Text>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
const styles = StyleSheet.create({
  content: { padding: 0, gap: 0, paddingBottom: 25 },
  banner: {
    minHeight: 310,
    overflow: "hidden",
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
  },
  bannerOverlay: { flex: 1, padding: 30, paddingTop: 35 },
  kicker: {
    fontSize: 8,
    color: palette.accent,
    letterSpacing: 2,
    marginTop: 29,
  },
  bannerTitle: {
    fontSize: 33,
    fontWeight: "700",
    fontFamily: "NunitoSans_700Bold",
    lineHeight: 39,
    letterSpacing: -1,
    color: "white",
    marginTop: 11,
  },
  bannerSubtitle: { fontSize: 11, color: "#acb9cd", marginTop: 11 },
  form: { padding: 28, paddingTop: 30 },
  welcome: { ...typography.title, fontSize: 29 },
  subtitle: {
    fontSize: 12,
    color: palette.muted,
    marginTop: 7,
    marginBottom: 27,
  },
  inputs: { gap: 18 },
  eye: { position: "absolute", right: 16, bottom: 17 },
  error: { color: palette.danger, fontSize: 12, lineHeight: 18 },
  login: { backgroundColor: palette.accent, marginTop: 6 },
  divider: {
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    marginVertical: 26,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: palette.border },
  dividerText: { fontSize: 8, color: palette.muted, letterSpacing: 1.3 },
  trustText: { fontSize: 9, color: palette.muted },
  trust: {
    flexDirection: "row",
    gap: 7,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 25,
  },
});
