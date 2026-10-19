import { Pressable, Text, View, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Svg, { Path } from "react-native-svg";
import { NAVY } from "./reference";
function GoogleMark() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24">
      <Path
        fill="#4285F4"
        d="M22.56 12.25c0-.73-.06-1.42-.19-2.09H12v3.96h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.56c2.08-1.92 3.28-4.74 3.28-7.95Z"
      />
      <Path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.8l-3.56-2.76c-.98.66-2.23 1.06-3.72 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
      />
      <Path
        fill="#FBBC05"
        d="M5.84 13.97a6.6 6.6 0 0 1 0-3.94V7.19H2.18a11 11 0 0 0 0 9.62l3.66-2.84Z"
      />
      <Path
        fill="#EA4335"
        d="M12 5.5c1.62 0 3.06.56 4.21 1.64l3.15-3.15A10.56 10.56 0 0 0 12 1a11 11 0 0 0-9.82 6.19l3.66 2.84C6.71 7.43 9.14 5.5 12 5.5Z"
      />
    </Svg>
  );
}
export function SocialButtons({ onPress, disabled }) {
  return (
    <View style={styles.row}>
      {["google", "apple"].map((provider) => (
        <Pressable
          key={provider}
          accessibilityRole="button"
          accessibilityLabel={`Continue with ${provider === "google" ? "Google" : "Apple"}`}
          disabled={disabled}
          onPress={() => onPress(provider)}
          style={[styles.button, disabled && { opacity: 0.5 }]}
        >
          {provider === "google" ? (
            <GoogleMark />
          ) : (
            <Ionicons name="logo-apple" size={23} color="#111" />
          )}
          <Text style={styles.label}>
            {provider === "google" ? "Google" : "Apple"}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 14 },
  button: {
    flex: 1,
    height: 57,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "#DDDAD4",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  label: { fontFamily: "Inter_500Medium", fontSize: 14, color: NAVY },
});
