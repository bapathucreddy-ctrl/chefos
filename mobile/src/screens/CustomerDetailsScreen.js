import { useState } from "react";
import { Text, View } from "react-native";
import { requireSupabase } from "../api/supabase";
import { useAuth } from "../auth/AuthContext";
import { Button, Input, Screen } from "../components/ui";
import { Header, PAPER, s } from "../components/reference";
export function CustomerDetailsScreen() {
  const { session, logout } = useAuth();
  const [name, setName] = useState(session.user.user_metadata?.full_name || ""),
    [contactEmail, setContactEmail] = useState(session.user.email || ""),
    [city, setCity] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function save() {
    setBusy(true);
    setError("");
    try {
      await requireSupabase()
        .rpc("chefos_complete_profile", {
          p_full_name: name.trim(),
          p_city: city.trim(),
        })
        .then(({ error }) => {
          if (error) throw error;
        });
      const { error } = await requireSupabase().auth.updateUser({
        data: {
          full_name: name.trim(),
          city: city.trim(),
          contact_email: contactEmail.trim(),
          onboarding_complete: true,
        },
      });
      if (error) throw error;
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Screen background={PAPER} contentContainerStyle={{ padding: 26, gap: 26 }}>
      <Header onBack={logout} />
      <View
        style={{
          alignItems: "center",
          marginTop: 24,
          gap: 12,
          marginBottom: 15,
        }}
      >
        <Text style={s.title}>Create your account</Text>
        <Text style={s.muted}>Tell us a bit about yourself</Text>
      </View>
      <Input
        label="Full name"
        value={name}
        onChangeText={setName}
        placeholder="Your full name"
        autoCapitalize="words"
      />
      <Input
        label="Email (optional)"
        value={contactEmail}
        onChangeText={setContactEmail}
        placeholder="you@example.com"
        keyboardType="email-address"
      />
      <Input
        label="City"
        value={city}
        onChangeText={setCity}
        placeholder="e.g. Bengaluru"
        autoCapitalize="words"
      />
      {error ? (
        <Text accessibilityRole="alert" style={s.error}>
          {error}
        </Text>
      ) : null}
      <Button
        label="Continue"
        loading={busy}
        disabled={name.trim().length < 2 || city.trim().length < 2}
        onPress={save}
      />
      <Text style={[s.muted, { textAlign: "center", fontSize: 12 }]}>
        Already have an account?{" "}
        <Text onPress={logout} style={{ color: "#D88A00" }}>
          Login
        </Text>
      </Text>
    </Screen>
  );
}
