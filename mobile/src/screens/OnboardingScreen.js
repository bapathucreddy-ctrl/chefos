import { useState } from "react";
import {
  ImageBackground,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { NAVY, GOLD } from "../components/reference";
const slides = [
  {
    title: "Delicious\nFood.\n",
    accent: "At Home.",
    body: "Book professional home chefs near you for fresh, home-style meals.",
    image: require("../assets/reference/banner_01_curry_hero_banner.png"),
  },
  {
    title: "Verified\nHome Chefs",
    body: "Trained, verified and reviewed by real customers.",
    image: require("../assets/reference/chef_04_female_chef_garnishing_food.png"),
  },
  {
    title: "Your Taste.\nYour Schedule.",
    body: "From daily meals to special occasions, book in minutes.",
    image: require("../assets/reference/banner_02_closeup_garnishing_plated_curry.png"),
  },
];
export function OnboardingScreen({ onFinish }) {
  const [step, setStep] = useState(0),
    slide = slides[step];
  return (
    <View style={{ flex: 1, backgroundColor: NAVY }}>
      <ImageBackground
        source={slide.image}
        style={{ position: "absolute", bottom: 0, width: "100%", height: "72%" }}
        imageStyle={{ width: "100%", height: "100%" }}
      />
      <StatusBar style="light" />
      <LinearGradient
        colors={["#071b31", "#071b31", "#071b3100", "#071b3180"]}
        locations={[0, 0.28, 0.57, 1]}
        style={{ flex: 1 }}
      >
        <SafeAreaView style={styles.safe}>
          <View style={styles.copy}>
            <Text style={styles.title}>
              {slide.title}
              <Text style={{ color: GOLD }}>{slide.accent}</Text>
            </Text>
            <Text style={styles.body}>{slide.body}</Text>
          </View>
          <View style={styles.bottom}>
            <View style={{ flexDirection: "row", gap: 7 }}>
              {slides.map((_, i) => (
                <View
                  key={i}
                  style={{
                    height: 7,
                    width: 7,
                    borderRadius: 4,
                    backgroundColor: i === step ? GOLD : "#ffffff55",
                  }}
                />
              ))}
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                step === 2 ? "Get started" : "Next onboarding screen"
              }
              onPress={() => (step === 2 ? onFinish() : setStep(step + 1))}
              style={styles.next}
            >
              <Ionicons name="chevron-forward" size={24} color={NAVY} />
            </Pressable>
          </View>
        </SafeAreaView>
      </LinearGradient>
    </View>
  );
}
const styles = StyleSheet.create({
  safe: { flex: 1, padding: 24 },
  copy: { paddingTop: 86, maxWidth: 340 },
  title: {
    fontFamily: Platform.OS === "android" ? "serif" : "Georgia",
    fontSize: 45,
    lineHeight: 51,
    color: "#fff",
  },
  body: {
    color: "#f3f3f3",
    fontFamily: "Inter_400Regular",
    fontSize: 15,
    lineHeight: 24,
    marginTop: 20,
    maxWidth: 280,
  },
  bottom: {
    marginTop: "auto",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 22,
  },
  next: {
    height: 54,
    width: 54,
    borderRadius: 27,
    backgroundColor: GOLD,
    alignItems: "center",
    justifyContent: "center",
  },
});
