import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { api } from "../api/client";
import { Button, Input, Screen } from "../components/ui";
import { Chip, Header, PAPER, NAVY, GOLD, s } from "../components/reference";
import { Expandable, NumberSlider, StepProgress } from "../components/interactive";

const CUISINES = [
  ["south_indian", "South Indian"], ["north_indian", "North Indian"],
  ["hyderabadi", "Hyderabadi"], ["andhra", "Andhra"], ["kerala", "Kerala"],
  ["tamil", "Tamil"], ["punjabi", "Punjabi"], ["gujarati", "Gujarati"],
  ["maharashtrian", "Maharashtrian"], ["bengali", "Bengali"],
  ["asian", "Asian"], ["continental", "Continental"],
];
const ALLERGENS = [
  ["milk", "Milk"], ["eggs", "Eggs"], ["fish", "Fish"], ["shellfish", "Shellfish"],
  ["peanuts", "Peanuts"], ["tree_nuts", "Tree nuts"], ["wheat", "Wheat"],
  ["soy", "Soy"], ["sesame", "Sesame"],
];
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const EMPTY = {
  age: "", height_cm: "", weight_kg: "", activity_level: "", goal: "", diet: "",
  cuisines: [], allergens: [], other_restrictions: "", dislikes: "",
  non_veg_days: [], cheat_meal_day: null, allergies_confirmed: false,
  personalisation_consent: false,
};

function Choices({ label, options, value, onSelect, multiple = false }) {
  return <View style={{ gap: 11 }}>
    <Text style={s.subtitle}>{label}</Text>
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      {options.map(([key, text]) => <Chip key={String(key)} label={text}
        selected={multiple ? value.includes(key) : value === key}
        onPress={() => onSelect(key)} />)}
    </View>
  </View>;
}

function Check({ label, value, onPress }) {
  return <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: value }}
    onPress={onPress} style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
    <View style={{ width: 23, height: 23, borderRadius: 6, borderWidth: 1,
      borderColor: value ? GOLD : "#8d929a", backgroundColor: value ? GOLD : "transparent",
      alignItems: "center", justifyContent: "center" }}>
      {value ? <Text style={{ color: NAVY }}>✓</Text> : null}
    </View>
    <Text style={[s.muted, { flex: 1 }]}>{label}</Text>
  </Pressable>;
}

export function FoodProfileScreen({ navigation, route }) {
  const [form, setForm] = useState(EMPTY);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [step, setStep] = useState(0);
  const chef = route.params?.chef;
  const update = (field, value) => {
    setSaved(false);
    setForm((f) => ({ ...f, [field]: value }));
  };
  const toggle = (field, value) => {
    setSaved(false);
    setForm((f) => ({ ...f, [field]: f[field].includes(value)
      ? f[field].filter((v) => v !== value) : [...f[field], value],
      ...(field === "allergens" ? { allergies_confirmed: false } : {}) }));
  };
  async function load() {
    setLoading(true); setLoaded(false); setError("");
    try {
      const { data } = await api.get("preferences/diet/");
      setRevision(data.revision);
      setForm(data.profile ? { ...EMPTY, ...data.profile,
        age: String(data.profile.age), height_cm: String(data.profile.height_cm),
        weight_kg: String(data.profile.weight_kg) } : EMPTY);
      setConflict(false);
      setLoaded(true);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);
  const height = Number(form.height_cm), weight = Number(form.weight_kg);
  const bmi = height >= 50 && height <= 250 && weight >= 10 && weight <= 500
    ? (weight / ((height / 100) ** 2)).toFixed(1) : null;
  async function save() {
    setBusy(true); setError("");
    try {
      const { data } = await api.put("preferences/diet/", { revision, profile: form });
      setRevision(data.revision); setSaved(true);
      if (chef) navigation.replace("Household", { chef });
    } catch (e) {
      setError(e.message);
      if (e.response?.status === 409) setConflict(true);
    } finally { setBusy(false); }
  }
  const canContinue = [
    Number(form.age) >= 1 && Number(form.age) <= 120 && Boolean(bmi) && Boolean(form.activity_level),
    Boolean(form.goal && form.diet) && (!["non_vegetarian", "pescatarian"].includes(form.diet) || form.non_veg_days.length > 0),
    form.cuisines.length > 0,
    form.allergies_confirmed && form.personalisation_consent,
  ][step];
  return <Screen key={step} background={PAPER} contentContainerStyle={{ padding: 22, gap: 24 }}>
    <Header title="Made for you" onBack={() => step ? setStep(step - 1) : navigation.goBack()} />
    <StepProgress steps={["Your body & activity", "Your goal & food style", "Your favourite cuisines", "Allergies & finishing touches"]} current={step} onSelect={setStep} />
    <Text style={s.title}>{["A little about you.", "What feels good to you?", "Flavours you love.", "Let’s keep every meal safe."][step]}</Text>
    {step === 0 ? <Text style={s.muted}>Drag to adjust, or tap a number to type. Your measurements stay private.</Text> : null}
    {error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : null}
    {loading ? <Text style={s.muted}>Loading your saved profile…</Text> : loaded ? <>
      {step === 0 ? <><View style={{ gap: 15 }}>
        <NumberSlider label="Age (years)" value={form.age} onChange={(v) => update("age", v)} min={1} max={120} initial={30} />
        <NumberSlider label="Height (cm)" value={form.height_cm} onChange={(v) => update("height_cm", v)} min={50} max={250} unit="cm" initial={170} />
        <NumberSlider label="Weight (kg)" value={form.weight_kg} onChange={(v) => update("weight_kg", v)} min={10} max={500} step={0.5} unit="kg" initial={70} />
        <View style={{ padding: 18, backgroundColor: NAVY, borderRadius: 22, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={[s.muted, { color: "#fff" }]}>Calculated BMI</Text><Text style={[s.title, { color: GOLD }]}>{bmi || "—"}</Text>
        </View>
      </View>
      <Choices label="Activity level" value={form.activity_level} onSelect={(v) => update("activity_level", v)}
        options={[["sedentary", "Mostly sitting"], ["light", "Light activity"], ["moderate", "Moderately active"], ["active", "Very active"]]} /></> : null}
      {step === 1 ? <>
      <Choices label="Your goal" value={form.goal} onSelect={(v) => update("goal", v)}
        options={[["healthy_eating", "Eat healthier"], ["maintenance", "Maintain weight"], ["fat_loss", "Fat loss"], ["muscle_gain", "Build muscle"]]} />
      <Choices label="Food style" value={form.diet} onSelect={(v) => {
        setSaved(false); setForm((f) => ({ ...f, diet: v,
          non_veg_days: ["vegetarian", "vegan"].includes(v) ? [] : f.non_veg_days }));
      }} options={[["vegetarian", "Vegetarian"], ["non_vegetarian", "Non-vegetarian"], ["vegan", "Vegan"], ["pescatarian", "Fish, no meat"]]} />
      {["non_vegetarian", "pescatarian"].includes(form.diet) ? <Choices
        label="Non-vegetarian days" value={form.non_veg_days} multiple
        onSelect={(v) => toggle("non_veg_days", v)} options={DAYS.map((d, i) => [i, d])} /> : null}</> : null}
      {step === 2 ? <><Choices label="Preferred cuisines" value={form.cuisines} multiple
        onSelect={(v) => toggle("cuisines", v)} options={CUISINES} />
        <Text style={s.muted}>{form.cuisines.length ? `${form.cuisines.length} cuisines in your kitchen` : "Pick as many as you like."}</Text></> : null}
      {step === 3 ? <>
      <Choices label="Food allergies — select all that apply" value={form.allergens} multiple
        onSelect={(v) => toggle("allergens", v)} options={ALLERGENS} />
      <Input label="Other allergies or dietary restrictions" value={form.other_restrictions}
        onChangeText={(v) => { update("other_restrictions", v); setForm((f) => ({ ...f, allergies_confirmed: false })); }}
        placeholder="Include anything not listed above" multiline maxLength={1000} />
      <Expandable title="A few finishing touches" subtitle="Dislikes and your optional cheat-meal day">
      <Input label="Foods you dislike (optional)" value={form.dislikes}
        onChangeText={(v) => update("dislikes", v)} maxLength={500} />
      <Choices label="Cheat-meal day (optional)" value={form.cheat_meal_day}
        onSelect={(v) => update("cheat_meal_day", v)} options={[[null, "None"], ...DAYS.map((d, i) => [i, d])]} /></Expandable>
      <Text style={s.small}>Menu suggestions support your preferences. Your chef reviews allergies and cross-contact precautions before cooking.</Text>
      <Check value={form.allergies_confirmed} onPress={() => update("allergies_confirmed", !form.allergies_confirmed)}
        label={form.allergens.length || form.other_restrictions.trim()
          ? "I have checked that my allergy and restriction information is complete."
          : "I confirm that I have no food allergies or dietary restrictions to declare."} />
      <Check value={form.personalisation_consent} onPress={() => update("personalisation_consent", !form.personalisation_consent)}
        label="I consent to using this information for personalised menu planning and can update it in my food profile." /></> : null}
      {saved ? <Text accessibilityLiveRegion="polite" style={s.subtitle}>Food profile saved.</Text> : null}
      {step < 3 ? <Button label="Continue" variant="gold" disabled={!canContinue} onPress={() => setStep(step + 1)} /> :
      <Button label={chef ? "Save & choose your plan" : "Save food profile"} onPress={save}
        loading={busy} disabled={conflict || !canContinue} />}
      {conflict ? <Button label="Reload saved profile" variant="outline" onPress={load} /> : null}
    </> : null}
    {!loading && error && !conflict ? <Button label="Reload profile" variant="outline" onPress={load} /> : null}
  </Screen>;
}
