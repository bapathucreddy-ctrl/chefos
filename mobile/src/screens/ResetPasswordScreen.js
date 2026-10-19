import { useState } from "react";
import { Text } from "react-native";
import {
  Button,
  Input,
  Screen,
  SectionCard,
  SectionHeader,
} from "../components/ui";
import { requireSupabase } from "../api/supabase";
import { useAuth } from "../auth/AuthContext";
export function ResetPasswordScreen() {
  const { finishRecovery, logout } = useAuth();
  const [password, setPassword] = useState(""),
    [confirm, setConfirm] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function save() {
    if (password.length < 8 || password !== confirm) {
      setError(
        "Use at least eight characters and enter the same password twice.",
      );
      return;
    }
    setBusy(true);
    setError("");
    try {
      const { error } = await requireSupabase().auth.updateUser({ password });
      if (error) throw error;
      finishRecovery();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Screen>
      <SectionCard>
        <SectionHeader
          title="A fresh start"
          subtitle="Choose a new password for your Chefos account."
        />
        <Input
          label="New password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />
        <Input
          label="Confirm new password"
          value={confirm}
          onChangeText={setConfirm}
          secureTextEntry
        />
        {error ? <Text accessibilityRole="alert">{error}</Text> : null}
        <Button label="Save new password" loading={busy} onPress={save} />
        <Button label="Return to sign in" variant="outline" onPress={logout} />
      </SectionCard>
    </Screen>
  );
}
