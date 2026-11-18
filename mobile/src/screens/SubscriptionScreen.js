import { useCallback, useState } from "react";
import { Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { Button, Screen } from "../components/ui";
import { Header, Notice, PAPER, s } from "../components/reference";
import { currencyInr, titleCase } from "../utils/format";
import { Expandable, Segments } from "../components/interactive";
export function SubscriptionScreen({ navigation }) {
  const { session } = useAuth(), key = `chefos:pending-order:${session.user.id}`;
  const [plan, setPlan] = useState(null), [chef, setChef] = useState(null), [visits, setVisits] = useState([]);
  const [pending, setPending] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [tab, setTab] = useState("upcoming");
  const today = new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);
  const load = useCallback(async () => {
    const [active, assigned, sessions, saved] = await Promise.all([api.get("subscription/active/"), api.get("chefs/assigned/"), api.get("sessions/"), AsyncStorage.getItem(key)]);
    setPlan(active.data); setChef(assigned.data?.chef); setVisits(sessions.data.rows); setPending(saved);
  }, [key]);
  useFocusEffect(useCallback(() => { load().catch((e) => setError(e.message)); }, [load]));
  async function recover() {
    setBusy(true); setError("");
    try { await api.post("subscription/create/", { order_id: pending }); await AsyncStorage.removeItem(key); await load(); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  return <Screen background={PAPER} contentContainerStyle={{ padding: 22, gap: 22 }}>
    <Header title="Your bookings" />
    <Text style={s.title}>Good food. On your schedule.</Text>
    {error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : null}
    {plan?.is_active ? <View style={[s.card, { gap: 12 }]}>
      <Text style={s.subtitle}>{titleCase(plan.plan_cycle)} plan with {chef?.name || "your chef"}</Text>
      <Text style={s.title}>{currencyInr(plan.price)}</Text>
      <Text style={s.muted}>{plan.meal_type.map(titleCase).join(" + ")} | {plan.people_count} people</Text>
      <Expandable title="Plan details" subtitle={`${plan.start_date} → ${plan.end_date}`}><Text style={s.small}>Your paid price stays locked until renewal. Your household provides the ingredients.</Text></Expandable>
      <Button label="View my weekly menu" onPress={() => navigation.navigate("Menu")} />
    </View> : <>
      <Text style={s.muted}>Choose a chef, complete your food profile, select a plan and confirm your personalised menu before payment.</Text>
      <Button label="Choose a chef & plan" onPress={() => chef ? navigation.navigate("FoodProfile", { chef }) : navigation.navigate("Discover")} />
    </>}
    <Button label="Book a chef now" variant="gold" onPress={() => navigation.navigate("Instant")} />
    {pending ? <View style={[s.card, { gap: 12 }]}><Text style={s.subtitle}>Saved checkout</Text><Text style={s.small}>If payment was captured, restore the booked service. This check does not charge you again.</Text><Button label="Check saved payment" loading={busy} onPress={recover} /></View> : null}
    <Segments label="Your visits" value={tab} onChange={setTab} options={[{ value: "upcoming", label: "Upcoming", icon: "calendar-outline" }, { value: "history", label: "History", icon: "time-outline" }]} />
    {visits.filter((visit) => tab === "upcoming" ? visit.service_date >= today && visit.status !== "completed" : visit.service_date < today || visit.status === "completed").map((visit) => <View key={visit.id} style={[s.card, { gap: 10 }]}>
      <Text style={s.subtitle}>{visit.service_date} | {visit.meals.map(titleCase).join(" + ")}</Text>
      <Text style={s.muted}>{visit.chef_name} | {titleCase(visit.status)}</Text>
      <Button label="View cooking visit" variant="outline" onPress={() => navigation.navigate("Session", { session: visit })} />
    </View>)}
    <Button label="Refresh bookings" variant="outline" onPress={() => load().catch((e) => setError(e.message))} />
  </Screen>;
}
