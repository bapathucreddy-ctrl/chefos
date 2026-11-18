import { useState } from "react";
import { Text, View } from "react-native";
import { useAuth } from "../auth/AuthContext";
import { Button, Input, Screen } from "../components/ui";
import { Header, Chip, PAPER, s } from "../components/reference";
import { StepProgress, Expandable } from "../components/interactive";

export function ChefRegisterScreen({ navigation }) {
  const { registerChef } = useAuth();
  const [form, setForm] = useState({ username: "", password: "", email: "", phone: "", city: "", name: "", speciality: "" });
  const [step, setStep] = useState(0), [loading, setLoading] = useState(false), [message, setMessage] = useState(""), [error, setError] = useState("");
  const update = (key, value) => setForm((previous) => ({ ...previous, [key]: value }));
  const skills = form.speciality.split(",").map((value) => value.trim()).filter(Boolean);
  const canContinue = step === 0 ? form.name.trim() && form.phone.trim() && form.city.trim() : skills.length > 0;
  async function submit() {
    setLoading(true); setError("");
    try {
      const result = await registerChef(form);
      setMessage(result.requiresConfirmation ? "Confirm your email and sign in to take your registration selfie. Our team will then review your profile." : "Take your registration selfie to complete your chef profile for review.");
    } catch (failure) { setError(failure.message || "Unable to create your chef partner account."); }
    finally { setLoading(false); }
  }
  return <Screen key={step} background={PAPER} contentContainerStyle={{ padding: 23, gap: 24 }}>
    <Header title="Become a Chefos partner" onBack={() => step ? setStep(step - 1) : navigation.goBack()} />
    <StepProgress steps={["Meet the chef", "Your kitchen skills", "Your account"]} current={step} onSelect={setStep} />
    <Text style={s.title}>{["Let’s start with you.", "What do you love cooking?", "Your kitchen career starts here."][step]}</Text>
    {error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : null}
    {message ? <><Text accessibilityRole="status" style={s.muted}>{message}</Text><Button label="Back to sign in" onPress={() => navigation.goBack()} /></> : <>
      {step === 0 ? <>
        <Input label="Chef name" value={form.name} onChangeText={(value) => update("name", value)} autoCapitalize="words" />
        <Input label="Phone" value={form.phone} onChangeText={(value) => update("phone", value)} keyboardType="phone-pad" />
        <Input label="City" value={form.city} onChangeText={(value) => update("city", value)} autoCapitalize="words" />
      </> : null}
      {step === 1 ? <>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>{["South Indian", "North Indian", "Hyderabadi", "Kerala", "Andhra", "Asian", "Continental", "Punjabi"].map((cuisine) => <Chip key={cuisine} label={cuisine} selected={skills.includes(cuisine)}
          onPress={() => update("speciality", (skills.includes(cuisine) ? skills.filter((skill) => skill !== cuisine) : [...skills, cuisine]).join(", "))} />)}</View>
        <Expandable title="Add another speciality"><Input label="Speciality" value={form.speciality} onChangeText={(value) => update("speciality", value)} autoCapitalize="words" /></Expandable>
        <Text style={s.small}>Your cuisine skills are reviewed before you accept bookings.</Text>
      </> : null}
      {step === 2 ? <>
        <Input label="Username" value={form.username} onChangeText={(value) => update("username", value)} />
        <Input label="Email" value={form.email} onChangeText={(value) => update("email", value)} keyboardType="email-address" />
        <Input label="Password" value={form.password} onChangeText={(value) => update("password", value)} secureTextEntry placeholder="Minimum 8 characters" />
        <Button label="Register chef partner" onPress={submit} loading={loading} disabled={!form.username.trim() || !form.email.includes("@") || form.password.length < 8} />
      </> : <Button label="Continue" variant="gold" disabled={!canContinue} onPress={() => setStep(step + 1)} />}
    </>}
  </Screen>;
}
