import { useCallback, useEffect, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { api } from "../api/client";
import { openCheckout } from "../api/checkout";
import { useAuth } from "../auth/AuthContext";
import {
  Button,
  Hero,
  Input,
  LoadingState,
  Pill,
  Screen,
  SectionCard,
  SectionHeader,
} from "../components/ui";
import { palette, typography } from "../theme";
import { currencyInr, titleCase } from "../utils/format";
import { slotLabel } from "../utils/slots";

const MEALS = ["breakfast", "lunch", "dinner"];
export function SubscriptionScreen({ navigation }) {
  const { session } = useAuth(),
    user = session?.user;
  const [chef, setChef] = useState(null),
    [subscription, setSubscription] = useState(null),
    [loading, setLoading] = useState(true);
  const [people, setPeople] = useState("3"),
    [cycle, setCycle] = useState("monthly"),
    [meals, setMeals] = useState(["lunch"]),
    [waves, setWaves] = useState({
      breakfast: "B2",
      lunch: "L2",
      dinner: "D2",
    });
  const [quote, setQuote] = useState(null),
    [quoteBusy, setQuoteBusy] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [pending, setPending] = useState(null);
  const pendingKey = `chefos:pending-order:${user?.id}`;
  const load = useCallback(async () => {
    try {
      const [assigned, active, saved] = await Promise.all([
        api.get("chefs/assigned/"),
        api.get("subscription/active/"),
        AsyncStorage.getItem(pendingKey),
      ]);
      setChef(assigned.data?.chef || null);
      setSubscription(active.data);
      setPending(saved);
      setError("");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [pendingKey]);
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      setQuote(null);
      if (!chef || !meals.length || !/^[1-8]$/.test(people)) {
        setQuoteBusy(false);
        return;
      }
      setQuoteBusy(true);
      try {
        const { data } = await api.get("subscriptions/price-preview/", {
          params: {
            chef: chef.id,
            people_count: Number(people),
            plan_cycle: cycle,
            meal_type: meals.join(","),
          },
        });
        if (!cancelled) {
          setQuote({ ...data, chef_id: chef.id });
          setError("");
        }
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setQuoteBusy(false);
      }
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [chef, people, cycle, meals]);
  async function recover() {
    setBusy(true);
    try {
      await api.post("subscription/create/", { order_id: pending });
      await AsyncStorage.removeItem(pendingKey);
      setPending(null);
      await load();
      Alert.alert(
        "Plan activated",
        "Your payment and plan have been confirmed.",
      );
    } catch (err) {
      Alert.alert("Payment status", err.message);
    } finally {
      setBusy(false);
    }
  }
  async function pay() {
    if (!quoteMatches || busy) return;
    setBusy(true);
    try {
      const { data: order } = await api.post("payments/create-order/", {
        subscription_payload: {
          chef: chef.id,
          meal_type: meals,
          meal_wave: waves,
          people_count: Number(people),
          plan_cycle: cycle,
        },
      });
      await AsyncStorage.setItem(pendingKey, order.order_id);
      setPending(order.order_id);
      if (order.amount !== quote.amount_paise)
        throw new Error(
          "Your service price has changed. Review the updated quote before continuing. This order has not been charged.",
        );
      const result = await openCheckout(order, user?.email);
      await api.post("payments/verify/", result);
      await AsyncStorage.removeItem(pendingKey);
      setPending(null);
      await load();
      Alert.alert(
        "Welcome to your plan",
        "Your payment is confirmed. Your chef service and meal slots are now scheduled.",
      );
    } catch (err) {
      Alert.alert(
        "Checkout",
        err?.description ||
          err.message ||
          "Payment was not completed. You can check your saved order below.",
      );
    } finally {
      setBusy(false);
    }
  }
  const active = subscription?.is_active;
  const quoteMatches =
    quote &&
    quote.chef_id === chef?.id &&
    quote.people_count === Number(people) &&
    quote.plan_cycle === cycle &&
    quote.meal_count === meals.length;
  if (loading)
    return (
      <Screen>
        <LoadingState label="Preparing your plan..." />
      </Screen>
    );
  return (
    <Screen>
      <Hero
        eyebrow="YOUR CHEF, YOUR ROUTINE"
        title={
          active ? "A little care, every day." : "Make room for better meals."
        }
        subtitle="Choose your meals and let a trusted chef take care of the cooking."
      >
        <Pill
          label={chef?.name || "Choose your chef"}
          tone={chef ? "good" : "warm"}
        />
      </Hero>
      {error ? (
        <SectionCard>
          <Text accessibilityRole="alert" style={styles.error}>
            {error}
          </Text>
          <Button label="Try again" variant="outline" onPress={load} />
        </SectionCard>
      ) : null}
      {!chef ? (
        <SectionCard>
          <SectionHeader title="Find your kitchen companion" />
          <Text style={typography.body}>
            Choose an available chef before creating your meal plan.
          </Text>
          <Button
            label="Discover chefs"
            onPress={() => navigation.navigate("Discover")}
          />
        </SectionCard>
      ) : null}
      {active ? (
        <SectionCard>
          <SectionHeader
            eyebrow="YOUR PAID PLAN"
            title={`${titleCase(subscription.plan_cycle)} with ${chef?.name || "your chef"}`}
          />
          <Text style={styles.price}>{currencyInr(subscription.price)}</Text>
          <Text style={typography.body}>
            {subscription.meal_type.map(titleCase).join(", ")} ·{" "}
            {subscription.people_count} people
          </Text>
          <Text style={typography.body}>
            {subscription.start_date} to {subscription.end_date}
          </Text>
          <Pill label="Price locked until renewal" tone="good" />
          <Text style={styles.note}>
            Your chef and service rate are saved with this paid plan. Renew
            after the plan ends.
          </Text>
        </SectionCard>
      ) : chef ? (
        <>
          <SectionCard>
            <SectionHeader
              eyebrow="A PLAN THAT FITS"
              title="Set your routine"
            />
            <View style={styles.stack}>
              <Input
                label="People at home (1–8)"
                value={people}
                onChangeText={setPeople}
                keyboardType="number-pad"
              />
              <Text style={typography.label}>Plan duration</Text>
              <View style={styles.choices}>
                {["weekly", "monthly", "quarterly"].map((value) => (
                  <Choice
                    key={value}
                    label={titleCase(value)}
                    selected={cycle === value}
                    onPress={() => setCycle(value)}
                  />
                ))}
              </View>
              <Text style={typography.label}>Daily meals</Text>
              <View style={styles.choices}>
                {MEALS.map((meal) => (
                  <Choice
                    key={meal}
                    label={titleCase(meal)}
                    selected={meals.includes(meal)}
                    onPress={() =>
                      setMeals((values) =>
                        values.includes(meal)
                          ? values.filter((x) => x !== meal)
                          : [...values, meal],
                      )
                    }
                  />
                ))}
              </View>
              {meals.map((meal) => (
                <View key={meal} style={styles.stack}>
                  <Text style={typography.label}>
                    {titleCase(meal)} service slot
                  </Text>
                  <View style={styles.choices}>
                    {(chef.available_waves?.[meal] || []).map((wave) => (
                      <Choice
                        key={wave}
                        label={slotLabel(wave)}
                        selected={waves[meal] === wave}
                        onPress={() =>
                          setWaves((w) => ({ ...w, [meal]: wave }))
                        }
                      />
                    ))}
                  </View>
                </View>
              ))}
            </View>
          </SectionCard>
          <SectionCard>
            <SectionHeader eyebrow="CLEAR PRICING" title="Your service quote" />
            <Text style={styles.price}>
              {quoteBusy
                ? "Updating…"
                : quote
                  ? currencyInr(quote.price_inr)
                  : "Select your plan"}
            </Text>
            {quoteMatches ? (
              <>
                <Text style={typography.body}>
                  {currencyInr(quote.per_meal_inr)} per home per meal ·{" "}
                  {quote.total_meals} meals · {quote.days} days
                </Text>
                <Text style={styles.note}>
                  Before GST. Ingredients are provided by your household. Your
                  final price is confirmed securely before payment.
                </Text>
              </>
            ) : null}
            <Button
              label={busy ? "Opening checkout…" : "Continue to payment"}
              disabled={
                !quoteMatches ||
                quoteBusy ||
                !!pending ||
                !meals.every((m) =>
                  chef.available_waves?.[m]?.includes(waves[m]),
                )
              }
              loading={busy}
              onPress={pay}
            />
          </SectionCard>
        </>
      ) : null}
      {pending && !active ? (
        <SectionCard>
          <SectionHeader title="Have a saved checkout?" />
          <Text style={typography.body}>
            If you paid, check this order before starting another payment.
          </Text>
          <Button
            label="Check payment and activate"
            loading={busy}
            onPress={recover}
          />
          <Button
            label="Clear unpaid checkout"
            variant="outline"
            onPress={() =>
              Alert.alert(
                "Clear this checkout?",
                "Only clear it if you did not pay. Keep your payment receipt if you need support.",
                [
                  { text: "Keep order", style: "cancel" },
                  {
                    text: "I did not pay",
                    onPress: async () => {
                      await AsyncStorage.removeItem(pendingKey);
                      setPending(null);
                    },
                  },
                ],
              )
            }
          />
        </SectionCard>
      ) : null}
      <Button label="Refresh plan" variant="outline" onPress={load} />
    </Screen>
  );
}
function Choice({ label, selected, onPress }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.choice, selected && styles.selected]}
    >
      <Text style={[styles.choiceText, selected && { color: "#fff" }]}>
        {label}
      </Text>
    </Pressable>
  );
}
const styles = StyleSheet.create({
  stack: { gap: 13, marginTop: 15 },
  choices: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  choice: {
    paddingVertical: 11,
    paddingHorizontal: 15,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
  },
  selected: { backgroundColor: palette.primary, borderColor: palette.primary },
  choiceText: {
    fontFamily: "NunitoSans_700Bold",
    fontSize: 13,
    color: palette.primary,
  },
  price: {
    fontSize: 34,
    fontFamily: "NunitoSans_800ExtraBold",
    color: palette.primary,
    marginVertical: 14,
  },
  note: { ...typography.body, fontSize: 12, marginVertical: 14 },
  error: { ...typography.body, color: "#a34c36" },
});
