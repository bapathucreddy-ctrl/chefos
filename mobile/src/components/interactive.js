import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import Slider from "./SliderControl";
import { Ionicons } from "@expo/vector-icons";
import { NAVY, GOLD, s } from "./reference";
import { clockLabel } from "../utils/slots";

export function Segments({ options, value, onChange, label }) {
  return <View accessibilityRole="tablist" accessibilityLabel={label} style={styles.segments}>
    {options.map((option) => <Pressable key={String(option.value)} accessibilityRole="tab"
      accessibilityLabel={option.label} accessibilityState={{ selected: value === option.value }}
      onPress={() => onChange(option.value)} style={[styles.segment, value === option.value && styles.active]}>
      {option.icon ? <Ionicons name={option.icon} size={19} color={value === option.value ? NAVY : "#7b8492"} /> : null}
      <Text style={[s.small, value === option.value && styles.activeText]}>{option.label}</Text>
    </Pressable>)}
  </View>;
}

export function StepProgress({ steps, current, onSelect }) {
  return <View style={{ gap: 12 }}>
    <View style={{ flexDirection: "row", gap: 6 }}>{steps.map((label, index) => <Pressable key={label}
      accessibilityRole="button" accessibilityLabel={`Go to ${label}`} disabled={index > current}
      onPress={() => onSelect(index)} style={{ flex: 1, paddingVertical: 6 }}>
      <View style={{ height: 5, borderRadius: 5, backgroundColor: index <= current ? GOLD : "#e6e6e2" }} />
    </Pressable>)}</View>
    <Text style={s.small}>{steps[current]}</Text>
  </View>;
}

export function NumberSlider({ label, value, onChange, min, max, step = 1, unit = "", initial }) {
  const number = value === "" ? initial ?? min : Number(value);
  const safe = Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : min;
  return <View style={styles.sliderCard}>
    <View style={s.between}><Text style={s.subtitle}>{label}</Text><View style={styles.numberBox}>
      <TextInput accessibilityLabel={label} keyboardType="decimal-pad" value={String(value)}
        placeholder={String(initial ?? min)} onChangeText={onChange} selectTextOnFocus style={styles.number} />
      <Text style={s.small}>{unit}</Text></View></View>
    <Slider accessibilityLabel={`${label} slider`} minimumValue={min} maximumValue={max} step={step}
      value={safe} onValueChange={(next) => onChange(String(Math.round(next * 100) / 100))}
      minimumTrackTintColor={GOLD} maximumTrackTintColor="#e1e5e8" thumbTintColor={NAVY} style={{ height: 40 }} />
    <View style={s.between}><Text style={s.small}>{min} {unit}</Text><Text style={s.small}>{max} {unit}</Text></View>
  </View>;
}

export function PeoplePicker({ value, onChange }) {
  return <View style={[styles.sliderCard, s.between]}>
    <View><Text style={s.subtitle}>People at home</Text><Text style={s.small}>Cooking for {value} {Number(value) === 1 ? "person" : "people"}</Text></View>
    <View style={[s.row, { gap: 16 }]}>{[-1, 1].map((delta, index) => <View key={delta} style={s.row}>
      {index === 1 ? <Text style={[s.subtitle, { minWidth: 22, textAlign: "center" }]}>{value}</Text> : null}
      <Pressable accessibilityRole="button" accessibilityLabel={delta < 0 ? "Fewer people" : "More people"}
        disabled={Number(value) + delta < 1 || Number(value) + delta > 8}
        onPress={() => onChange(String(Number(value) + delta))} style={styles.roundButton}>
        <Ionicons name={delta < 0 ? "remove" : "add"} size={22} color={NAVY} />
      </Pressable></View>)}</View>
  </View>;
}

export function TimeSlider({ label, value, onChange, min, max }) {
  return <View style={styles.sliderCard}>
    <View style={s.between}><Text style={s.subtitle}>{label}</Text><Text style={s.subtitle}>{clockLabel(Number(value))}</Text></View>
    {min < max ? <Slider accessibilityLabel={label} minimumValue={min} maximumValue={max} step={15} value={Number(value)} onValueChange={(next) => onChange(String(next))}
      minimumTrackTintColor={GOLD} maximumTrackTintColor="#e1e5e8" thumbTintColor={NAVY} style={{ height: 44 }} /> : null}
    <View style={s.between}><Text style={s.small}>{clockLabel(min)}</Text><Text style={s.small}>{clockLabel(max)}</Text></View>
  </View>;
}

export function DateRail({ value, onChange, days = 14, label = "Service date" }) {
  const today = new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);
  const dates = Array.from({ length: days }, (_, index) => new Date(Date.parse(today) + index * 86400000).toISOString().slice(0, 10));
  return <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 9 }} accessibilityLabel={label}>
    {dates.map((date) => <Pressable key={date} accessibilityRole="button" accessibilityLabel={`${label} ${date}`}
      accessibilityState={{ selected: date === value }} onPress={() => onChange(date)} style={[styles.date, date === value && styles.dateActive]}>
      <Text style={s.small}>{new Date(date + "T12:00:00Z").toLocaleDateString("en-IN", { weekday: "short", timeZone: "Asia/Kolkata" })}</Text>
      <Text style={[s.subtitle, { fontSize: 22 }]}>{date.slice(-2)}</Text>
      <Text style={s.small}>{date === today ? "Today" : new Date(date + "T12:00:00Z").toLocaleDateString("en-IN", { month: "short", timeZone: "Asia/Kolkata" })}</Text>
    </Pressable>)}
  </ScrollView>;
}

export function Expandable({ title, subtitle, children, initialOpen = false }) {
  const [open, setOpen] = useState(initialOpen);
  return <View style={styles.sliderCard}>
    <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ expanded: open }}
      onPress={() => setOpen(!open)} style={s.between}>
      <View style={{ flex: 1, gap: 5 }}><Text style={s.subtitle}>{title}</Text>{subtitle ? <Text style={s.small}>{subtitle}</Text> : null}</View>
      <Ionicons name={open ? "chevron-up" : "chevron-down"} size={21} color={NAVY} />
    </Pressable>
    {open ? <View style={{ gap: 14, paddingTop: 18 }}>{children}</View> : null}
  </View>;
}

const styles = StyleSheet.create({
  segments: { flexDirection: "row", backgroundColor: "#eeefeb", padding: 5, borderRadius: 18, gap: 4 },
  segment: { flex: 1, paddingVertical: 12, paddingHorizontal: 7, borderRadius: 13, alignItems: "center", justifyContent: "center", gap: 5 },
  active: { backgroundColor: "#fff" }, activeText: { color: NAVY, fontFamily: "Inter_600SemiBold" },
  sliderCard: { backgroundColor: "#fff", borderRadius: 22, padding: 18, borderWidth: 1, borderColor: "#e8e8e1", gap: 5 },
  numberBox: { flexDirection: "row", alignItems: "baseline", gap: 5, flexShrink: 0 },
  number: { width: 86, minWidth: 0, textAlign: "right", fontSize: 27, fontFamily: "Inter_700Bold", color: NAVY, padding: 0 },
  roundButton: { width: 42, height: 42, backgroundColor: "#f3f2ec", borderRadius: 21, alignItems: "center", justifyContent: "center" },
  date: { width: 65, borderRadius: 19, padding: 12, alignItems: "center", gap: 7, backgroundColor: "#fff", borderWidth: 1, borderColor: "#e6e6e0" },
  dateActive: { borderColor: GOLD, backgroundColor: "#fff3d5" },
});
