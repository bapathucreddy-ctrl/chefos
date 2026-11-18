import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { api } from "../api/client";
import { Button, Screen } from "../components/ui";
import { Header, Notice, PAPER, s } from "../components/reference";
import { SessionRecipes } from "../components/SessionRecipes";
import { titleCase } from "../utils/format";
export function ScheduleScreen({ navigation }) {
  const [visits, setVisits] = useState([]), [recipes, setRecipes] = useState(null), [error, setError] = useState("");
  async function load() {
    const [{ data }, { data: result }] = await Promise.all([api.get("sessions/"), api.get("menu/personalised/")]);
    const today = new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);
    setVisits(data.rows.filter((v) => v.service_date === today));
    setRecipes(result.menu?.document?.days?.find((d) => d.date === today)?.meals || null); setError("");
  }
  useEffect(() => { load().catch((e) => setError(e.message)); const timer = setInterval(() => load().catch((e) => setError(e.message)), 10000); return () => clearInterval(timer); }, []);
  return <Screen background={PAPER} contentContainerStyle={{ padding: 22, gap: 20 }}>
    <Header title="Today's cooking" onBack={() => navigation.goBack()} />
    <Text style={s.title}>Freshly made for you.</Text>
    {error ? <Text style={s.error}>{error}</Text> : null}
    {visits.map((visit) => <View key={visit.id} style={[s.card, { gap: 10 }]}>
      <Text style={s.subtitle}>{visit.meals.map(titleCase).join(" + ")}</Text>
      <Text style={s.muted}>{visit.chef_name} | {titleCase(visit.status)}</Text>
      {visit.starts_at ? <Text style={s.small}>{new Date(visit.starts_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" })}</Text> : null}
      <Button label="Consent, visit status & codes" onPress={() => navigation.navigate("Session", { session: visit })} />
    </View>)}
    {!visits.length ? <Notice>No cooking visits are scheduled for today.</Notice> : null}
    <SessionRecipes menu={recipes ? { recipes } : null} />
    <Button label="View full weekly menu" variant="outline" onPress={() => navigation.navigate("Menu")} />
  </Screen>;
}
