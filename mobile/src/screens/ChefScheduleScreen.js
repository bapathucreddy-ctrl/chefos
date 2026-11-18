import { useEffect, useState } from "react";
import { Pressable, ScrollView, Switch, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../api/client";
import { Screen, Button, Input } from "../components/ui";
import { Header, PAPER, NAVY, GOLD, s } from "../components/reference";
import { DateRail, Expandable, TimeSlider, Segments } from "../components/interactive";
import { clockLabel } from "../utils/slots";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const today = () => new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);
const periods = { breakfast: [360, 480, 600], lunch: [720, 840, 960], dinner: [1080, 1200, 1320] };
const finish = { breakfast: 660, lunch: 1020, dinner: 1380 };

export function ChefScheduleScreen({ navigation }) {
  const [data, setData] = useState(null), [weekday, setWeekday] = useState(0), [meal, setMeal] = useState("breakfast");
  const [start, setStart] = useState("360"), [end, setEnd] = useState("660"), [date, setDate] = useState(today);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  async function action(name = "list", extra = {}) {
    setBusy(true); setError("");
    try {
      const res = name === "list" ? await api.get("chefs/partner/schedule/", { params: { date: extra.date || date } })
        : await api.post("chefs/partner/schedule/", { action: name, date, ...extra });
      setData(res.data);
    } catch (failure) { setError(failure.message); } finally { setBusy(false); }
  }
  useEffect(() => { action(); }, []);
  const slots = (data?.slots || []).filter((slot) => slot.weekday === weekday && slot.meal === meal);
  const starts = [...new Set([...periods[meal], ...slots.map((slot) => slot.start_minute)])].sort((a, b) => a - b);
  function toggle(startMinute) {
    const existing = slots.find((slot) => slot.start_minute === startMinute);
    return existing ? action("remove", { slot_id: existing.id }) : action("save", { weekday, meal, start_minute: startMinute, latest_end_minute: finish[meal] });
  }
  return <Screen background={PAPER} contentContainerStyle={{ padding: 22, gap: 22 }}>
    <Header title="My cooking schedule" onBack={() => navigation.goBack()} />
    <Text style={s.title}>Your day. Your pace.</Text>
    {error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : null}
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 9 }}>
      {DAYS.map((day, index) => <Pressable key={day} accessibilityRole="button" accessibilityLabel={day} accessibilityState={{ selected: weekday === index }} onPress={() => setWeekday(index)}
        style={{ width: 57, paddingVertical: 18, borderRadius: 18, backgroundColor: weekday === index ? NAVY : "#fff", alignItems: "center" }}><Text style={[s.subtitle, { color: weekday === index ? "#fff" : NAVY, fontSize: 13 }]}>{day}</Text></Pressable>)}
    </ScrollView>
    <Segments label="Cooking period" value={meal} onChange={(next) => { setMeal(next); setStart(String(periods[next][0])); setEnd(String(finish[next])); }} options={[{ value: "breakfast", label: "Breakfast", icon: "sunny-outline" }, { value: "lunch", label: "Lunch", icon: "restaurant-outline" }, { value: "dinner", label: "Dinner", icon: "moon-outline" }]} />
    <View style={s.between}><Text style={s.subtitle}>{slots.length} open start times</Text><Text style={s.small}>Tap to open or close</Text></View>
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
      {starts.map((minute) => {
        const slot = slots.find((item) => item.start_minute === minute);
        return <Pressable key={minute} accessibilityRole="button" accessibilityLabel={`${slot ? "Remove" : "Add"} ${clockLabel(minute)}`} accessibilityState={{ selected: Boolean(slot), disabled: busy || !data }} disabled={busy || !data} onPress={() => toggle(minute)}
          style={{ width: "48%", borderRadius: 22, padding: 18, gap: 12, backgroundColor: slot ? "#fff4d9" : "#fff", borderWidth: 1, borderColor: slot ? GOLD : "#e4e6df" }}>
          <View style={s.between}><Ionicons name="time-outline" color={NAVY} size={22} /><Ionicons name={slot ? "checkmark-circle" : "add-circle-outline"} size={23} color={slot ? "#ad750a" : "#a0a5ac"} /></View>
          <Text style={s.subtitle}>{clockLabel(minute)}</Text><Text style={s.small}>{slot ? `Finish by ${clockLabel(slot.latest_end_minute)}` : "Closed"}</Text>
        </Pressable>;
      })}
    </View>
    <Expandable title="Add a custom start time" subtitle="Fit an extra kitchen into your day">
      <Text style={s.subtitle}>{clockLabel(Number(start))} → finish by {clockLabel(Number(end))}</Text>
      <TimeSlider label="Start time" value={start} onChange={(next) => { setStart(next); if (Number(end) < Number(next) + 60) setEnd(String(Number(next) + 60)); }} min={360} max={1380} />
      <TimeSlider label="Finish by" value={end} onChange={setEnd} min={Number(start) + 60} max={1440} />
      <Button label="Add start time" disabled={busy || !data || Number(end) < Number(start) + 60} loading={busy} onPress={() => action("save", { weekday, meal, start_minute: Number(start), latest_end_minute: Number(end) })} />
    </Expandable>
    <Text style={s.subtitle}>Leave & upcoming visits</Text>
    <DateRail value={date} onChange={(next) => { setDate(next); action("list", { date: next }); }} />
    <View style={[s.card, s.between]}><View style={{ flex: 1 }}><Text style={s.subtitle}>Take this day off</Text><Text style={s.small}>Confirmed visits stay protected</Text></View><Switch accessibilityLabel="Take selected date off" disabled={busy || !data} value={Boolean(data?.leave_dates?.includes(date))} trackColor={{ true: GOLD, false: "#dce1e2" }} thumbColor={NAVY}
      onValueChange={(leave) => action(leave ? "leave" : "clear_leave")} /></View>
    <Expandable title="Travel & turnaround" subtitle="60 minutes between kitchens">
      <Text style={s.muted}>Confirm 30 minutes for consecutive visits in the same verified building.</Text>
      {(data?.buildings || []).map((building) => {
        const confirmed = data.gap_confirmations.some((gap) => gap.building_id === building.id && gap.date === date);
        return <Button key={building.id} label={confirmed ? `30-minute gap confirmed: ${building.name}` : `Confirm 30-minute gap: ${building.name}`} disabled={confirmed || busy} variant="outline" onPress={() => action("confirm_gap", { building_id: building.id })} />;
      })}
      <Input label="Service date (YYYY-MM-DD)" value={date} onChangeText={setDate} maxLength={10} />
      <Button label="Load schedule" variant="outline" loading={busy} onPress={() => action()} />
    </Expandable>
    {(data?.visits || []).slice(0, 30).map((visit) => <View key={visit.id} style={[s.card, { flexDirection: "row", gap: 14 }]}><Ionicons name="restaurant-outline" size={26} color={NAVY} /><View style={{ flex: 1, gap: 7 }}><Text style={s.subtitle}>{visit.meals.join(" + ")}</Text><Text style={s.small}>{new Date(visit.starts_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</Text><Text style={s.small}>{visit.state}</Text></View></View>)}
  </Screen>;
}
