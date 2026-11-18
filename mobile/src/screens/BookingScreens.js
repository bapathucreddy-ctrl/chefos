import { useEffect, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../api/client";
import { openCheckout } from "../api/checkout";
import { useAuth } from "../auth/AuthContext";
import { Button, Screen } from "../components/ui";
import {
  Header,
  ChefAvatar,
  Chip,
  Notice,
  GOLD,
  NAVY,
  PAPER,
  s,
} from "../components/reference";
import { slotLabel, visitLabel } from "../utils/slots";
import { currencyInr, titleCase } from "../utils/format";
import { Expandable, PeoplePicker, Segments, StepProgress } from "../components/interactive";
export function BookingScreen({ route, navigation }) {
  const { chef } = route.params;
  const indiaDate = (offset = 0) => {
    const d = new Date(Date.now() + 330 * 60000);
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + offset)).toISOString().slice(0, 10);
  };
  const [day, setDay] = useState(() => indiaDate()), [meals, setMeals] = useState(["lunch"]);
  const [step, setStep] = useState(0);
  const [together, setTogether] = useState(false), [people, setPeople] = useState("3"), [cycle, setCycle] = useState("monthly");
  const [options, setOptions] = useState({}), [selected, setSelected] = useState({}), [loading, setLoading] = useState(true), [error, setError] = useState("");
  const groups = useMemo(() => together ? [meals] : meals.map((m) => [m]), [meals, together]);
  const days = Array.from({ length: 7 }, (_, i) => indiaDate(i));
  useEffect(() => {
    let active = true; setLoading(true); setError(""); setOptions({});
    Promise.all(groups.map(async (group) => {
      const { data } = await api.get("scheduling/options/", { params: { chef: chef.id, start_date: day, plan_cycle: cycle, meal_type: group.join(",") } });
      return [group.join("+"), data];
    })).then((rows) => {
      if (!active) return;
      setOptions(Object.fromEntries(rows));
      setSelected((old) => Object.fromEntries(rows.map(([key, values]) => [key, values.some((v) => v.start_minute === old[key]) ? old[key] : values[0]?.start_minute])));
    }).catch((e) => { if (active) setError(e.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [chef.id, day, cycle, groups]);
  function toggleMeal(m) {
    const next = meals.includes(m) ? meals.filter((v) => v !== m) : [...meals, m];
    if (next.length) setMeals(["breakfast", "lunch", "dinner"].filter((v) => next.includes(v)));
  }
  const valid = !loading && !error && /^[1-8]$/.test(people) && groups.every((g) => (options[g.join("+")] || []).some((v) => v.start_minute === selected[g.join("+")]));
  return <Screen key={step} background={PAPER} contentContainerStyle={{ padding: 22, gap: 24 }}>
    <Header title={`Book ${chef.name}`} onBack={() => step ? setStep(0) : navigation.goBack()} />
    <StepProgress steps={["Your meals & household", "Your plan & cooking time"]} current={step} onSelect={setStep} />
    <View style={s.row}><ChefAvatar chef={chef} size={44} /><View><Text style={s.subtitle}>{chef.name}</Text><Text style={s.small}>{chef.speciality}</Text></View></View>
    {step === 0 ? <>
    <Text style={s.subtitle}>Select Date</Text>
    <ScrollView horizontal contentContainerStyle={{ gap: 9 }} showsHorizontalScrollIndicator={false}>
      {days.map((date) => <Pressable accessibilityRole="button" accessibilityLabel={date} key={date} onPress={() => setDay(date)}
        style={[s.chip, day === date && s.chosen, { alignItems: "center", minWidth: 59, gap: 5 }]}>
        <Text style={s.small}>{new Date(date + "T12:00:00Z").toLocaleDateString("en-IN", { weekday: "short", timeZone: "Asia/Kolkata" })}</Text>
        <Text style={s.subtitle}>{date.slice(-2)}</Text><Text style={s.small}>{date === indiaDate() ? "Today" : new Date(date + "T12:00:00Z").toLocaleDateString("en-IN", { month: "short", timeZone: "Asia/Kolkata" })}</Text>
      </Pressable>)}
    </ScrollView>
    <Text style={s.subtitle}>Meals per day</Text>
    <View style={{ flexDirection: "row", gap: 8 }}>{["breakfast", "lunch", "dinner"].map((m) => <Chip key={m} label={titleCase(m)} selected={meals.includes(m)} onPress={() => toggleMeal(m)} />)}</View>
    {meals.length > 1 ? <View style={{ gap: 10 }}><Chip label="Separate cooking visits" selected={!together} onPress={() => setTogether(false)} />
      <Chip label="Cook these meals together" selected={together} onPress={() => setTogether(true)} /></View> : null}
    <Text style={s.small}>{together && meals.length > 1 ? `${meals.length} meals · ${meals.length} hours together` : "One cooking hour per meal"}</Text>
    <PeoplePicker value={people} onChange={setPeople} />
    <Button label="Choose plan & time" variant="gold" onPress={() => setStep(1)} />
    </> : <>
    <Text style={s.title}>Make it a routine.</Text>
    <Segments label="Plan duration" value={cycle} onChange={setCycle} options={[{ value: "weekly", label: "7 days" }, { value: "monthly", label: "30 days" }, { value: "quarterly", label: "90 days" }]} />
    <Text style={s.muted}>{titleCase(cycle)} · {day} · {people} people</Text>
    <Text style={s.subtitle}>Select Time</Text>
    {loading ? <Text style={s.muted}>Checking every date in your plan...</Text> : null}
    {error ? <><Text style={s.error}>{error}</Text><Button label="Check my verified home" variant="outline" onPress={() => navigation.navigate("Household")} /></> : null}
    {!loading && !error ? groups.map((g) => {
      const key = g.join("+"), values = options[key] || [];
      return <View key={key} style={{ gap: 10 }}><Text style={s.subtitle}>{g.map(titleCase).join(" + ")}</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{values.map((v) => <Chip key={v.start_minute} label={visitLabel(v)} selected={selected[key] === v.start_minute} onPress={() => setSelected((old) => ({ ...old, [key]: v.start_minute }))} />)}</View>
        {!values.length ? <Notice>No time is free for every service date. Choose another date, plan or chef.</Notice> : null}
      </View>;
    }) : null}
    <Button label="Continue" disabled={!valid} onPress={() => navigation.navigate("MenuPreview", { chef, booking: {
      schedule_version: 2, chef: chef.id, meal_type: meals, people_count: Number(people), plan_cycle: cycle, start_date: day,
      visits: groups.map((g) => ({ meals: g, start_minute: selected[g.join("+")] })),
    } })} /></>}
  </Screen>;
}
export function ReviewBookingScreen({ route, navigation }) {
  const { chef, booking } = route.params;
  const { session } = useAuth();
  const [quote, setQuote] = useState(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [revision, setRevision] = useState(0),
    [order, setOrder] = useState(null);
  const key = `chefos:pending-order:${session?.user?.id}`;
  useEffect(() => {
    let cancelled = false;
    setQuote(null);
    api
      .get("subscriptions/price-preview/", {
        params: {
          chef: chef.id,
          people_count: booking.people_count,
          plan_cycle: booking.plan_cycle,
          meal_type: booking.meal_type.join(","),
        },
      })
      .then((r) => {
        if (!cancelled) {
          setQuote(r.data);
          setError("");
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [chef.id, booking, revision]);
  async function pay() {
    setBusy(true);
    setError("");
    try {
      if (!quote) throw new Error("Wait for your service quote.");
      const pending = await AsyncStorage.getItem(key);
      if (pending && !order)
        throw new Error(
          "You have a saved checkout. Open Bookings to check its payment before creating another.",
        );
      const next =
        order ||
        (
          await api.post("payments/create-order/", {
            subscription_payload: booking,
          })
        ).data;
      setOrder(next);
      await AsyncStorage.setItem(key, next.order_id);
      if (next.amount !== quote.amount_paise)
        throw new Error(
          "The quote changed. Return to your plan and review its current price before paying.",
        );
      const verified = next.status === "paid"
        ? { data: { subscription: (await api.post("subscription/create/", { order_id: next.order_id })).data } }
        : await api.post("payments/verify/", await openCheckout(next, session.user.email));
      await AsyncStorage.removeItem(key);
      navigation.replace("BookingConfirmed", {
        chef,
        booking,
        subscription: verified.data.subscription,
      });
    } catch (e) {
      setError(e.description || e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Screen background={PAPER} contentContainerStyle={{ padding: 22, gap: 22 }}>
      <Header title="Review Booking" onBack={() => navigation.goBack()} />
      <View style={s.card}>
        <View style={s.row}>
          <ChefAvatar chef={chef} />
          <View style={{ flex: 1 }}>
            <Text style={s.subtitle}>{chef.name}</Text>
            <Text style={s.small}>
              <Text style={{ color: GOLD }}>★ </Text>
              {Number(chef.rating).toFixed(1)} · Verified
            </Text>
            <Text style={s.small}>{chef.speciality}</Text>
          </View>
        </View>
        <View style={s.divider} />
        <Expandable title="Plan details" subtitle={`${booking.start_date} · ${booking.people_count} people`}>{[
          ["Date", booking.start_date],
          [
            "Time",
            booking.visits ? booking.visits.map((v) => `${v.meals.map(titleCase).join(" + ")}: ${visitLabel(v)}`).join("; ") : slotLabel(booking.meal_wave[booking.meal_type[0]]),
          ],
          ["Service Type", `${titleCase(booking.plan_cycle)} daily meals`],
          ["Household", `${booking.people_count} people`],
          [
            "Price per meal",
            quote ? currencyInr(quote.per_meal_inr) : "Fetching quote…",
          ],
          [
            "Plan duration",
            quote ? `${quote.days} days · ${quote.total_meals} meals` : "—",
          ],
        ].map(([label, value]) => (
          <View key={label} style={s.between}>
            <Text style={s.small}>{label}</Text>
            <Text
              style={[
                s.small,
                { color: NAVY, flexShrink: 1, textAlign: "right" },
              ]}
            >
              {value}
            </Text>
          </View>
        ))}</Expandable>
        <View style={s.divider} />
        <View style={s.between}>
          <Text style={s.subtitle}>Total</Text>
          <Text style={s.subtitle}>
            {quote ? currencyInr(quote.price_inr) : "—"}
          </Text>
        </View>
        <Text style={s.small}>
          Before GST. Bundle discounts are included in your server quote.
        </Text>
      </View>
      <Text style={s.subtitle}>Payment Method</Text>
      <View style={s.card}>
        <View style={s.row}>
          <Ionicons name="shield-checkmark-outline" size={24} color={NAVY} />
          <View style={{ flex: 1 }}>
            <Text style={s.subtitle}>Secure payment</Text>
            <Text style={s.small}>Choose UPI, card or banking in checkout</Text>
          </View>
          <Ionicons name="checkmark-circle" color={NAVY} size={20} />
        </View>
      </View>
      <Notice>
        Your household provides the ingredients. Your service rate is saved when
        payment is verified.
      </Notice>
      {error ? (
        <>
          <Text style={s.error} accessibilityRole="alert">
            {error}
          </Text>
          <Button
            label="Refresh quote"
            variant="outline"
            onPress={() => setRevision((n) => n + 1)}
          />
        </>
      ) : null}
      <Button
        label={
          quote ? `Pay ${currencyInr(quote.price_inr)}` : "Preparing quote…"
        }
        disabled={!quote}
        loading={busy}
        onPress={pay}
      />
    </Screen>
  );
}
export function BookingConfirmedScreen({ route, navigation }) {
  const { chef, booking, subscription } = route.params;
  return (
    <Screen
      background={NAVY}
      contentContainerStyle={{
        padding: 25,
        gap: 26,
        alignItems: "stretch",
        flexGrow: 1,
        justifyContent: "center",
      }}
    >
      <View style={{ alignItems: "center", gap: 20, paddingVertical: 25 }}>
        <View
          style={{
            width: 88,
            height: 88,
            borderRadius: 44,
            backgroundColor: GOLD,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons name="checkmark" size={55} color={NAVY} />
        </View>
        <Text style={[s.title, { color: "#fff", textAlign: "center" }]}>
          Booking Confirmed!
        </Text>
        <Text style={[s.muted, { color: "#e0e6ef", textAlign: "center" }]}>
          Your chef service starts on{"\n"}
          {booking.start_date} ·{" "}
          {booking.visits ? booking.visits.map(visitLabel).join(" / ") : slotLabel(booking.meal_wave[booking.meal_type[0]])}
        </Text>
      </View>
      <View style={s.card}>
        <View style={s.row}>
          <ChefAvatar chef={chef} />
          <View>
            <Text style={s.subtitle}>{chef.name}</Text>
            <Text style={s.small}>
              {titleCase(booking.meal_type[0])} ·{" "}
              {titleCase(booking.plan_cycle)} plan
            </Text>
          </View>
        </View>
        <Text style={s.small}>Booking #{subscription.id.slice(0, 8)}</Text>
        <Button
          label="View Details"
          variant="outline"
          onPress={() =>
            navigation.reset({
              index: 0,
              routes: [
                { name: "CustomerTabs", params: { screen: "Subscription" } },
              ],
            })
          }
        />
      </View>
      <Button
        label="Go to Home"
        variant="gold"
        onPress={() =>
          navigation.reset({
            index: 0,
            routes: [{ name: "CustomerTabs", params: { screen: "Home" } }],
          })
        }
      />
    </Screen>
  );
}
