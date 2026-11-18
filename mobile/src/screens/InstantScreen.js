import { useCallback, useEffect, useState } from "react";
import { Image, Pressable, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { api } from "../api/client";
import { openCheckout } from "../api/checkout";
import { useAuth } from "../auth/AuthContext";
import { Button, Input, Screen } from "../components/ui";
import { ChefAvatar, Chip, Header, Notice, PAPER, s } from "../components/reference";
import { titleCase, currencyInr } from "../utils/format";
import { PeoplePicker, StepProgress } from "../components/interactive";
import { ServiceMap } from "../components/ServiceMap";
import { useLiveLocations } from "../location/useLiveLocations";
const cuisines = [
  ["south_indian", require("../assets/reference/food_01_south_indian_thali.png")],
  ["north_indian", require("../assets/reference/food_02_paneer_butter_masala_naan.png")],
  ["hyderabadi", require("../assets/reference/food_03_chicken_biryani.png")],
  ["asian", require("../assets/reference/food_05_fish_curry_meal.png")],
];
export function InstantScreen({ navigation }) {
  const { session } = useAuth();
  const [cuisine, setCuisine] = useState("south_indian"), [meals, setMeals] = useState(["lunch"]), [people, setPeople] = useState("3");
  const [notes, setNotes] = useState(""), [confirmed, setConfirmed] = useState(false), [chefs, setChefs] = useState(null);
  const [request, setRequest] = useState(null), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const [step, setStep] = useState(0), [selectedChef, setSelectedChef] = useState(null);
  const { data: liveMap } = useLiveLocations();
  const mapData = liveMap || { chefs: [] };
  const refresh = useCallback(async () => { const { data } = await api.get("instant/"); setRequest(data); }, []);
  useFocusEffect(useCallback(() => { refresh().catch((e) => setError(e.message)); }, [refresh]));
  useEffect(() => {
    if (!request || !["searching", "accepted"].includes(request.status)) return;
    const timer = setInterval(() => refresh().catch((e) => setError(e.message)), 5000); return () => clearInterval(timer);
  }, [request?.id, request?.status, refresh]);
  async function act(task) { setBusy(true); setError(""); try { await task(); } catch (e) { setError(e.description || e.message); } finally { setBusy(false); } }
  const input = { cuisine, meals, people_count: Number(people) };
  async function available() {
    const { data } = await api.post("instant/", { ...input, action: "available" }); setChefs(data.chefs); setStep(2);
  }
  async function select(chef) {
    const { data } = await api.post("instant/", { ...input, action: "create", chef: chef.id, food_notes: notes, allergies_confirmed: confirmed });
    setRequest(data); setChefs(null);
  }
  async function pay() {
    const { data: order } = await api.post("payments/create-order/", { instant_request_id: request.id });
    if (order.amount !== request.pricing.amount_paise) throw new Error("The quote changed. Refresh and review the current price before paying.");
    if (order.status === "paid") await api.post("subscription/create/", { order_id: order.order_id });
    else await api.post("payments/verify/", await openCheckout(order, session.user.email));
    await refresh();
  }
  const active = request && ["searching", "accepted"].includes(request.status);
  return <Screen background={PAPER} contentContainerStyle={{ padding: 22, gap: 20 }}>
    <Header title="Chef now" onBack={() => navigation.goBack()} />
    {!active ? <StepProgress steps={["Choose your cuisine", "Your kitchen", "Choose your chef"]} current={step} onSelect={setStep} /> : null}
    <Text style={s.title}>{active ? request.paid ? "Your chef is booked." : request.status === "searching" ? "Finding your kitchen companion." : "Your chef said yes." : ["What are you craving?", "Let’s get your kitchen ready.", "Meet your next chef."][step]}</Text>
    {error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : null}
    {active ? <View style={[s.card, { gap: 14 }]}>
      <Text style={s.subtitle}>{request.paid ? "Your chef is booked" : request.status === "searching" ? "Waiting for your selected chef" : "Chef accepted your request"}</Text>
      <Text style={s.muted}>{titleCase(request.cuisine || cuisine)} · {(request.meals || meals).map(titleCase).join(" + ")}</Text>
      {request.pricing ? <Text style={s.subtitle}>{currencyInr(request.pricing.price_inr)} · before GST</Text> : null}
      {request.status === "accepted" && !request.paid ? <><Notice>Pay while the reservation is held. Your chef receives the cooking visit after payment is confirmed.</Notice><Button label="Pay & book chef" loading={busy} onPress={() => act(pay)} /></> : null}
      {request.session_id ? <Button label="Track visit & confirm dishes" onPress={() => navigation.navigate("Session", { session: { id: request.session_id, instant_request_id: request.id } })} /> : null}
      {!request.paid && !request.order_id ? <Button label="Cancel request" variant="outline" loading={busy} onPress={() => act(async () => { await api.post("instant/", { action: "cancel", request_id: request.id }); await refresh(); })} /> : null}
    </View> : <>
      {request ? <Notice>Previous request: {titleCase(request.status)}</Notice> : null}
      {step === 0 ? <><View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
        {cuisines.map(([key, source]) => <Pressable key={key} accessibilityRole="button" accessibilityLabel={titleCase(key)} accessibilityState={{ selected: cuisine === key }}
          onPress={() => { setCuisine(key); setChefs(null); }} style={{ width: "48%", gap: 10, padding: 7, borderRadius: 22, borderWidth: 2, borderColor: cuisine === key ? "#FFB719" : "#fff", backgroundColor: "#fff" }}>
          <Image source={source} style={{ width: "100%", height: 115, borderRadius: 15 }} />
          <Text style={[s.subtitle, { textAlign: "center", fontSize: 14, paddingBottom: 8 }]}>{titleCase(key)}</Text>
        </Pressable>)}
      </View>
      <Text style={s.subtitle}>Meals in this visit</Text>
      <View style={{ flexDirection: "row", gap: 8 }}>{["breakfast", "lunch", "dinner"].map((meal) => <Chip key={meal} label={titleCase(meal)} selected={meals.includes(meal)} onPress={() => {
        setMeals((old) => old.includes(meal) ? old.length > 1 ? old.filter((v) => v !== meal) : old : old.length < 2 ? [...old, meal] : old); setChefs(null);
      }} />)}</View>
      <Text style={s.small}>{meals.length} {meals.length === 1 ? "meal · 1 hour" : "meals together · 2 hours"}</Text>
      <Button label="Continue to your kitchen" variant="gold" onPress={() => setStep(1)} /></> : null}
      {step === 1 ? <><PeoplePicker value={people} onChange={(v) => { setPeople(v); setChefs(null); }} />
      <Input label="Allergies, diet and food restrictions" value={notes} onChangeText={setNotes} multiline maxLength={2000} placeholder="For example: vegetarian, peanut allergy. Write 'No known allergies' if none." />
      <Button label={`${confirmed ? "✓ " : ""}I have confirmed everyone's food restrictions`} variant="outline" onPress={() => setConfirmed(!confirmed)} />
      <Button label="Verify / view my home" variant="outline" onPress={() => navigation.navigate("Household")} />
      <Button label="Find available chefs" disabled={!people || !confirmed || notes.trim().length < 2} loading={busy} onPress={() => act(available)} />
      </> : null}
      {step === 2 ? <><ServiceMap points={(mapData.chefs || []).filter((point) => chefs?.some((chef) => chef.id === point.id))} selectedId={selectedChef} onSelect={setSelectedChef} />
      <Text style={s.small}>Choose a chef. Pay after acceptance. Agree on dishes at home.</Text>
      {chefs?.length === 0 ? <Notice>No verified chef is available for these meals nearby right now. Try another cuisine or book a plan.</Notice> : null}
      {chefs?.slice().sort((a, b) => Number(b.id === selectedChef) - Number(a.id === selectedChef)).map((chef) => <View key={chef.id} style={[s.card, { gap: 12, borderColor: selectedChef === chef.id ? "#FFB719" : "#e8e5df" }]}>
        <View style={s.row}><ChefAvatar chef={chef} /><View><Text style={s.subtitle}>{chef.name}</Text><Text style={s.muted}>{Number(chef.rating).toFixed(1)} · {titleCase(cuisine)}</Text></View></View>
        <Text style={s.subtitle}>{currencyInr(chef.pricing.price_inr)}</Text>
        <Button label={`Request ${chef.name}`} loading={busy} onPress={() => act(() => select(chef))} />
      </View>)}</> : null}
    </>}
  </Screen>;
}
