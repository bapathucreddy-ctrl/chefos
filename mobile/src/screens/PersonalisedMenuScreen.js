import { useCallback, useEffect, useState } from "react";
import { ImageBackground, Pressable, ScrollView, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { NAVY, GOLD } from "../components/reference";
import { useFocusEffect } from "@react-navigation/native";
import { api } from "../api/client";
import { Button, Input, Screen } from "../components/ui";
import { Header, Notice, PAPER, s } from "../components/reference";
import { titleCase } from "../utils/format";

export function PersonalisedMenuScreen({ route, navigation, preview = false }) {
  const booking = route.params?.booking, chef = route.params?.chef;
  const [menu, setMenu] = useState(null), [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [editing, setEditing] = useState(null), [request, setRequest] = useState(""), [expanded, setExpanded] = useState("");
  const [selectedDate, setSelectedDate] = useState(null);
  const apply = (data) => { setJob(data.job_id ? data : null); if (data.menu) setMenu(data.menu); };
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const { data } = preview ? await api.post("menu/preview/", { booking }) : await api.get("menu/personalised/");
      apply(data);
      if (data.detail && !data.menu) setError(data.detail);
      if (data.awaiting_configuration) setError("Personalised menu planning is temporarily unavailable. Please try again later.");
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  }, [booking, preview]);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  useEffect(() => {
    if (!job?.job_id || ["ready", "failed"].includes(job.state) || job.awaiting_configuration) return;
    let active = true;
    const timer = setInterval(async () => {
      try { const { data } = await api.get("menu/job/", { params: { job_id: job.job_id } }); if (active) apply(data); }
      catch (e) { if (active) setError(e.message); }
    }, 4000);
    return () => { active = false; clearInterval(timer); };
  }, [job?.job_id, job?.state, job?.awaiting_configuration]);
  async function replace() {
    setBusy(true); setError("");
    try {
      const { data } = await api.post("menu/replace/", { menu_id: menu.id, version: menu.version, date: editing.date, meal: editing.meal, request });
      apply(data); setEditing(null); setRequest("");
      if (data.awaiting_configuration) setError("Menu changes are temporarily unavailable. Your current menu is kept.");
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  async function accept() {
    setBusy(true); setError("");
    try {
      await api.post("menu/accept/", { menu_id: menu.id, version: menu.version });
      if (preview) navigation.replace("ReviewBooking", { chef, booking: { ...booking, menu_id: menu.id, menu_version: menu.version } });
      else setMenu((m) => ({ ...m, accepted: true }));
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  const today = new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);
  const visibleDate = menu?.document.days.some((day) => day.date === selectedDate) ? selectedDate : menu?.document.days[0]?.date;
  return <Screen background={PAPER} contentContainerStyle={{ padding: 22, gap: 22 }}>
    <Header title={preview ? "Your personalised menu" : "Your meal week"} onBack={() => navigation.goBack()} />
    <ImageBackground source={require("../assets/reference/food_01_south_indian_thali.png")} style={{ height: 170, borderRadius: 25, overflow: "hidden" }}>
      <LinearGradient colors={["#071b31ed", "#071b3140"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ flex: 1, padding: 22, justifyContent: "center", gap: 10 }}>
        <Text style={[s.title, { color: "#fff", maxWidth: "75%" }]}>{preview ? "A week made for you." : "Fresh meals, every week."}</Text>
        <Text style={[s.small, { color: "#fff", maxWidth: "80%" }]}>{preview ? "Pick a day. Explore or swap a dish." : "Your menu updates automatically each week."}</Text>
      </LinearGradient>
    </ImageBackground>
    {loading ? <Text style={s.muted}>Preparing your menu…</Text> : null}
    {error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : null}
    {job && !["ready", "failed"].includes(job.state) && !job.awaiting_configuration ? <Notice>Your menu request is {job.state === "retry" ? "waiting to retry" : "being prepared"}. You can return later; it is saved to your account.</Notice> : null}
    {job?.state === "failed" ? <Notice>{job.detail || "Menu planning needs assistance. Please contact Chefos."}</Notice> : null}
    {menu ? <>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 9 }}>
        {menu.document.days.map((day) => {
          const active = day.date === visibleDate;
          return <Pressable key={day.date} accessibilityRole="button" accessibilityLabel={`Menu for ${day.date}`} accessibilityState={{ selected: active }}
            onPress={() => { setSelectedDate(day.date); setEditing(null); }} style={{ minWidth: 66, padding: 14, alignItems: "center", gap: 8, borderRadius: 20, backgroundColor: active ? NAVY : "#fff" }}>
            <Text style={[s.small, active && { color: "#fff" }]}>{new Date(day.date + "T12:00:00Z").toLocaleDateString("en-IN", { weekday: "short", timeZone: "Asia/Kolkata" })}</Text>
            <Text style={[s.subtitle, { fontSize: 23, color: active ? GOLD : NAVY }]}>{day.date.slice(-2)}</Text>
          </Pressable>;
        })}
      </ScrollView>
      {menu.stale ? <Notice>Your preferences changed. A new menu is being prepared; this version cannot be used for a new cooking session.</Notice> : null}
      {menu.needs_chef_review ? <Notice>Your chef must review the allergy and restriction instructions before cooking.</Notice> : null}
      {menu.document.days.filter((day) => day.date === visibleDate).map((day) => <View key={day.date} style={{ gap: 12 }}>
        <Text style={s.subtitle}>{new Date(day.date + "T12:00:00Z").toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short", timeZone: "Asia/Kolkata" })}</Text>
        {Object.entries(day.meals).map(([meal, recipe]) => {
          const key = day.date + meal;
          return <View key={key} style={[s.card, { gap: 12 }]}>
            <Text style={s.small}>{titleCase(meal)}</Text><Text style={s.subtitle}>{recipe.title}</Text>
            <Text style={s.small}>{recipe.servings} servings · {recipe.cooking_minutes} minutes</Text>
            <Button label={expanded === key ? "Hide recipe" : `Recipe: ${recipe.title}`} variant="outline" onPress={() => setExpanded(expanded === key ? "" : key)} />
            {expanded === key ? <View style={{ gap: 10 }}><Text style={s.subtitle}>Ingredients</Text>
              {recipe.ingredients.map((i, index) => <Text key={index} style={s.muted}>{i.quantity} {i.unit} {i.name}{i.allergens.length ? ` (${i.allergens.join(", ")})` : ""}</Text>)}
              <Text style={s.subtitle}>Cooking steps</Text>
              {recipe.steps.map((step, index) => <Text key={index} style={s.muted}>{index + 1}. {step}</Text>)}
              {recipe.storage_notes ? <Text style={s.small}>{recipe.storage_notes}</Text> : null}
            </View> : null}
            {day.date >= today && !menu.stale ? <Button label={`Change ${titleCase(meal)} on ${day.date}`} variant="outline" loading={busy}
              onPress={() => { setEditing({ date: day.date, meal }); setRequest(""); }} /> : null}
      {editing?.date === day.date && editing?.meal === meal ? <View style={[s.card, { gap: 12 }]}><Text style={s.subtitle}>Replace {editing.meal} on {editing.date}</Text>
        <Input label="What would you prefer instead?" value={request} onChangeText={setRequest} maxLength={300} multiline />
        <Text style={s.small}>Your food profile and allergy restrictions still apply.</Text>
        <Button label="Prepare replacement" loading={busy} disabled={request.trim().length < 2} onPress={replace} />
        <Button label="Keep current item" variant="outline" onPress={() => setEditing(null)} />
      </View> : null}
          </View>;
        })}
      </View>)}

      {preview || !menu.accepted ? <Button label={preview ? "Confirm menu & review payment" : "Confirm updated menu"} loading={busy}
        disabled={menu.stale || Boolean(job && !["ready", "failed"].includes(job.state))} onPress={accept} /> : null}
    </> : null}
    <Button label={loading ? "Planning…" : "Refresh menu"} variant="outline" loading={loading} onPress={load} />
  </Screen>;
}
export function MenuPreviewScreen(props) { return <PersonalisedMenuScreen {...props} preview />; }
