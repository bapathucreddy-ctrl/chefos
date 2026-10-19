import { StyleSheet } from "react-native";

export const palette = {
  canvas: "#FAF9F6",
  canvasStrong: "#edf0f5",
  surface: "#ffffff",
  surfaceAlt: "#f0f3f8",
  primary: "#071B31",
  primaryDark: "#08182f",
  secondary: "#14213D",
  accent: "#FFB719",
  success: "#0f7a5e",
  warning: "#c8742a",
  danger: "#c14d46",
  text: "#18273e",
  muted: "#7d899a",
  border: "#e3e8ef",
  white: "#ffffff",
  shadow: "rgba(12, 30, 56, 0.08)",
};

export const spacing = {
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
};

export const radius = {
  sm: 12,
  md: 18,
  lg: 24,
  pill: 999,
};

export const typography = StyleSheet.create({
  eyebrow: {
    fontSize: 12,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    color: palette.muted,
    fontWeight: "700",
    fontFamily: "Inter_600SemiBold",
  },
  title: {
    fontSize: 32,
    lineHeight: 38,
    color: palette.text,
    fontWeight: "800",
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.4,
  },
  sectionTitle: {
    fontSize: 22,
    lineHeight: 28,
    color: palette.text,
    fontWeight: "800",
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.3,
  },
  cardTitle: {
    fontSize: 18,
    lineHeight: 24,
    color: palette.text,
    fontWeight: "700",
    fontFamily: "Inter_600SemiBold",
  },
  body: {
    fontFamily: "Inter_400Regular",
    fontSize: 15,
    lineHeight: 22,
    color: palette.muted,
  },
  label: {
    fontSize: 13,
    lineHeight: 18,
    color: palette.muted,
    fontWeight: "600",
    fontFamily: "Inter_500Medium",
  },
});

export const shadows = {
  soft: {
    shadowColor: "#14213D",
    shadowOpacity: 0.05,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
};
