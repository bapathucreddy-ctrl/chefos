import { useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../api/client";
import { openCheckout } from "../api/checkout";
import { useAuth } from "../auth/AuthContext";
import { Button, Input, Screen } from "../components/ui";
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
import { slotLabel } from "../utils/slots";
import { currencyInr, titleCase } from "../utils/format";
function localDate(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}
function tomorrow() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return date;
}
export function BookingScreen({ route, navigation }) {
  const { chef } = route.params;
  const [day, setDay] = useState(localDate(tomorrow())),
    [meal, setMeal] = useState("lunch"),
    [wave, setWave] = useState("L2"),
    [people, setPeople] = useState("3"),
    [cycle, setCycle] = useState("monthly");
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = tomorrow();
    d.setDate(d.getDate() + i);
    return d;
  });
  return (
    <Screen background={PAPER} contentContainerStyle={{ padding: 22, gap: 24 }}>
      <Header title={`Book ${chef.name}`} onBack={() => navigation.goBack()} />
      <View style={s.row}>
        <ChefAvatar chef={chef} size={44} />
        <View>
          <Text style={s.subtitle}>{chef.name}</Text>
          <Text style={s.small}>{chef.speciality}</Text>
        </View>
      </View>
      <Text style={s.subtitle}>Select Date</Text>
      <ScrollView
        horizontal
        contentContainerStyle={{ gap: 9 }}
        showsHorizontalScrollIndicator={false}
      >
        {days.map((d) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={localDate(d)}
            key={localDate(d)}
            onPress={() => setDay(localDate(d))}
            style={[
              s.chip,
              day === localDate(d) && s.chosen,
              { alignItems: "center", minWidth: 59, gap: 5 },
            ]}
          >
            <Text style={s.small}>
              {d.toLocaleDateString("en-IN", { weekday: "short" })}
            </Text>
            <Text style={s.subtitle}>{d.getDate()}</Text>
            <Text style={s.small}>
              {d.toLocaleDateString("en-IN", { month: "short" })}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
      <Text style={s.subtitle}>Select Time</Text>
      <View style={{ flexDirection: "row", gap: 8 }}>
        {["breakfast", "lunch", "dinner"].map((m) => (
          <Chip
            key={m}
            label={titleCase(m)}
            selected={meal === m}
            onPress={() => {
              setMeal(m);
              setWave(chef.available_waves?.[m]?.[0] || "");
            }}
          />
        ))}
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {(chef.available_waves?.[meal] || []).map((w) => (
          <Chip
            key={w}
            label={slotLabel(w)}
            selected={wave === w}
            onPress={() => setWave(w)}
          />
        ))}
      </View>
      <Text style={s.subtitle}>Service Type</Text>
      <View style={[s.card, { borderColor: GOLD, backgroundColor: "#fff8e8" }]}>
        <View style={s.row}>
          <Ionicons name="checkmark-circle" size={24} color={GOLD} />
          <View>
            <Text style={s.subtitle}>Daily Meals</Text>
            <Text style={s.small}>Regular home meals, on your schedule</Text>
          </View>
        </View>
      </View>
      <Input
        label="People at home (1–8)"
        keyboardType="number-pad"
        value={people}
        onChangeText={setPeople}
      />
      <View style={{ flexDirection: "row", gap: 8 }}>
        {["weekly", "monthly", "quarterly"].map((c) => (
          <Chip
            key={c}
            label={titleCase(c)}
            selected={cycle === c}
            onPress={() => setCycle(c)}
          />
        ))}
      </View>
      <Notice>
        Special occasions and custom services require a separate quote. This
        booking is for a recurring meal plan.
      </Notice>
      <Button
        label="Continue"
        disabled={
          !/^[1-8]$/.test(people) ||
          !chef.available_waves?.[meal]?.includes(wave)
        }
        onPress={() =>
          navigation.navigate("ReviewBooking", {
            chef,
            booking: {
              chef: chef.id,
              meal_type: [meal],
              meal_wave: { [meal]: wave },
              people_count: Number(people),
              plan_cycle: cycle,
              start_date: day,
            },
          })
        }
      />
    </Screen>
  );
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
      const payment = await openCheckout(next, session.user.email);
      const verified = await api.post("payments/verify/", payment);
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
        {[
          ["Date", booking.start_date],
          [
            "Time",
            `${titleCase(booking.meal_type[0])} · ${slotLabel(booking.meal_wave[booking.meal_type[0]])}`,
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
        ))}
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
          {slotLabel(booking.meal_wave[booking.meal_type[0]])}
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
