import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { NativeBrand } from "./BrandSplash";
import Svg, { Rect, Circle, Line } from "react-native-svg";
export const NAVY = "#071B31",
  GOLD = "#FFB719",
  PAPER = "#FAF9F6";
export function IndiaFlag() {
  return (
    <Svg width={21} height={14} viewBox="0 0 30 20">
      <Rect width={30} height={20 / 3} fill="#FF9933" />
      <Rect y={20 / 3} width={30} height={20 / 3} fill="#fff" />
      <Rect y={40 / 3} width={30} height={20 / 3} fill="#138808" />
      <Circle
        cx={15}
        cy={10}
        r={2.7}
        fill="none"
        stroke="#000080"
        strokeWidth={0.4}
      />
      {Array.from({ length: 24 }, (_, i) => {
        const angle = (i * Math.PI) / 12;
        return (
          <Line
            key={i}
            x1={15}
            y1={10}
            x2={15 + 2.5 * Math.cos(angle)}
            y2={10 + 2.5 * Math.sin(angle)}
            stroke="#000080"
            strokeWidth={0.2}
          />
        );
      })}
    </Svg>
  );
}
export function Header({ title, onBack, right }) {
  return (
    <View style={s.header}>
      {onBack ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          onPress={onBack}
          hitSlop={12}
        >
          <Ionicons name="arrow-back" size={23} color={NAVY} />
        </Pressable>
      ) : (
        <NativeBrand size={32} color={NAVY} />
      )}
      <Text style={s.headerTitle}>{title}</Text>
      {right || <View style={{ width: 23 }} />}
    </View>
  );
}
export function Chip({ label, selected, onPress }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[s.chip, selected && s.chosen]}
    >
      <Text style={[s.small, selected && { color: NAVY }]}>{label}</Text>
    </Pressable>
  );
}
export function ChefAvatar({ chef, size = 62 }) {
  return chef?.photo_url ? (
    <Image
      source={{ uri: chef.photo_url }}
      style={{ width: size, height: size, borderRadius: 12 }}
    />
  ) : (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: 12,
        backgroundColor: "#e9e4d9",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Ionicons name="restaurant-outline" size={size * 0.36} color={NAVY} />
      <Text style={s.small}>
        {chef?.name
          ?.split(" ")
          .map((x) => x[0])
          .slice(0, 2)
          .join("")}
      </Text>
    </View>
  );
}
export function Notice({ children }) {
  return (
    <View style={s.notice}>
      <Text style={s.muted}>{children}</Text>
    </View>
  );
}
export const s = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 14,
    minHeight: 52,
    marginBottom: 0,
  },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
    color: NAVY,
  },
  title: {
    fontSize: 25,
    lineHeight: 32,
    fontFamily: "Inter_700Bold",
    color: NAVY,
  },
  subtitle: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: NAVY,
  },
  muted: {
    fontSize: 13,
    lineHeight: 21,
    color: "#72757b",
    fontFamily: "Inter_400Regular",
  },
  small: {
    fontSize: 12,
    color: "#555b64",
    fontFamily: "Inter_400Regular",
  },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  between: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  stack: { gap: 15 },
  card: {
    padding: 17,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e8e5df",
    backgroundColor: "#fffefd",
    gap: 12,
  },
  chip: {
    borderWidth: 1,
    borderColor: "#e2dfd8",
    borderRadius: 10,
    paddingHorizontal: 13,
    paddingVertical: 10,
    backgroundColor: "#fffefd",
  },
  chosen: { borderColor: GOLD, backgroundColor: "#fff3d5" },
  notice: { backgroundColor: "#f2efe8", borderRadius: 10, padding: 13 },
  error: { color: "#a64a35", fontSize: 13, lineHeight: 20 },
  divider: { height: 1, backgroundColor: "#e8e5df", marginVertical: 8 },
});
