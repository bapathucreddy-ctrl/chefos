import {
  ActivityIndicator,
  ImageBackground,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";

import { palette, radius, shadows, spacing, typography } from "../theme";

export { BrandSplashScreen } from "./BrandSplash";

export function Screen({
  children,
  scroll = true,
  contentContainerStyle,
  background = palette.canvas,
}) {
  const content = scroll ? (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      contentContainerStyle={[styles.scrollContent, contentContainerStyle]}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.flexFill, contentContainerStyle]}>{children}</View>
  );

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: background }]}>
      {content}
    </SafeAreaView>
  );
}

export function Hero({ image, eyebrow, title, subtitle, children }) {
  return (
    <ImageBackground
      source={{ uri: image }}
      imageStyle={styles.heroImage}
      style={styles.heroWrap}
    >
      <LinearGradient
        colors={[
          "rgba(8,24,47,0.94)",
          "rgba(16,36,66,0.75)",
          "rgba(16,36,66,0.32)",
        ]}
        style={styles.heroOverlay}
      >
        <Text style={[typography.eyebrow, styles.heroEyebrow]}>{eyebrow}</Text>
        <Text style={styles.heroTitle}>{title}</Text>
        {subtitle ? <Text style={styles.heroSubtitle}>{subtitle}</Text> : null}
        {children ? <View style={styles.heroFooter}>{children}</View> : null}
      </LinearGradient>
    </ImageBackground>
  );
}

export function SectionCard({ children, style }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function AppBadge({ label }) {
  return (
    <View style={styles.appBadge}>
      <View style={styles.appBadgeDot} />
      <Text style={styles.appBadgeText}>{label}</Text>
    </View>
  );
}

export function SectionHeader({ eyebrow, title, subtitle, action }) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.flexFill}>
        {eyebrow ? <Text style={typography.eyebrow}>{eyebrow}</Text> : null}
        <Text
          style={[typography.sectionTitle, eyebrow ? { marginTop: 6 } : null]}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text style={[typography.body, { marginTop: 6 }]}>{subtitle}</Text>
        ) : null}
      </View>
      {action}
    </View>
  );
}

export function Button({
  label,
  onPress,
  variant = "primary",
  disabled = false,
  loading = false,
  style,
}) {
  const appearance = buttonStyles[variant] || buttonStyles.primary;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        appearance.button,
        disabled ? styles.buttonDisabled : null,
        pressed && !disabled ? styles.buttonPressed : null,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={appearance.indicator} />
      ) : (
        <Text style={[styles.buttonText, appearance.text]}>{label}</Text>
      )}
    </Pressable>
  );
}

export function Input({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry = false,
  multiline = false,
  keyboardType,
  maxLength,
  autoCapitalize = "none",
  hideLabel = false,
  leading,
}) {
  return (
    <View style={{ gap: 8 }}>
      {!hideLabel && <Text style={typography.label}>{label}</Text>}
      <View style={{ position: "relative" }}>
        <TextInput
          accessibilityLabel={label}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor="#9b9c96"
          secureTextEntry={secureTextEntry}
          multiline={multiline}
          keyboardType={keyboardType}
          maxLength={maxLength}
          autoCapitalize={autoCapitalize}
          style={[
            styles.input,
            multiline ? styles.inputMultiline : null,
            leading ? { paddingLeft: 87 } : null,
          ]}
        />
        {leading ? (
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              left: 14,
              top: 0,
              bottom: 0,
              justifyContent: "center",
            }}
          >
            {leading}
          </View>
        ) : null}
      </View>
    </View>
  );
}

export function Pill({ label, tone = "neutral" }) {
  const pill = pillStyles[tone] || pillStyles.neutral;
  return (
    <View style={[styles.pill, pill.wrap]}>
      <Text style={[styles.pillText, pill.text]}>{label}</Text>
    </View>
  );
}

export function Stat({ label, value }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

export function EmptyState({ title, message }) {
  return (
    <SectionCard style={styles.emptyState}>
      <Text style={typography.sectionTitle}>{title}</Text>
      <Text style={[typography.body, { marginTop: 8 }]}>{message}</Text>
    </SectionCard>
  );
}

export function LoadingState({ label = "Loading..." }) {
  return (
    <SectionCard style={styles.loadingState}>
      <ActivityIndicator color={palette.primary} />
      <Text style={[typography.body, { marginTop: 12 }]}>{label}</Text>
    </SectionCard>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  flexFill: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.lg,
    gap: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  heroWrap: {
    minHeight: 312,
    borderRadius: 28,
    overflow: "hidden",
  },
  heroImage: {
    borderRadius: radius.lg,
  },
  heroOverlay: {
    flex: 1,
    padding: spacing.xl,
    justifyContent: "flex-end",
  },
  heroEyebrow: {
    color: "rgba(255,255,255,0.74)",
  },
  heroTitle: {
    marginTop: 10,
    fontSize: 34,
    lineHeight: 39,
    fontWeight: "800",
    fontFamily: "Inter_700Bold",
    color: palette.white,
    maxWidth: 300,
  },
  heroSubtitle: {
    marginTop: 10,
    fontSize: 15,
    lineHeight: 22,
    color: "rgba(255,255,255,0.82)",
    maxWidth: 300,
  },
  heroFooter: {
    marginTop: spacing.lg,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  card: {
    backgroundColor: palette.surface,
    borderRadius: 24,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: palette.border,
    ...shadows.soft,
  },
  appBadge: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.86)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.55)",
  },
  appBadgeDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: palette.accent,
  },
  appBadgeText: {
    fontSize: 12,
    fontWeight: "800",
    fontFamily: "Inter_700Bold",
    color: palette.secondary,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: spacing.md,
  },
  button: {
    minHeight: 56,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  buttonPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.985 }],
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    fontSize: 15,
    fontWeight: "700",
    fontFamily: "Inter_600SemiBold",
  },
  input: {
    fontFamily: "Inter_400Regular",
    minHeight: 56,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.white,
    paddingHorizontal: 16,
    color: palette.text,
    fontSize: 15,
  },
  inputMultiline: {
    minHeight: 110,
    paddingTop: 14,
    textAlignVertical: "top",
  },
  pill: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
  },
  pillText: {
    fontSize: 12,
    fontWeight: "700",
    fontFamily: "Inter_600SemiBold",
  },
  stat: {
    backgroundColor: palette.surfaceAlt,
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: palette.border,
  },
  statLabel: {
    color: palette.muted,
    fontSize: 12,
    fontWeight: "700",
    fontFamily: "Inter_600SemiBold",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  statValue: {
    color: palette.text,
    fontSize: 18,
    fontWeight: "700",
    fontFamily: "Inter_600SemiBold",
    marginTop: 8,
  },
  emptyState: {
    alignItems: "flex-start",
  },
  loadingState: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 160,
  },
});

const buttonStyles = {
  gold: {
    button: { backgroundColor: palette.accent },
    text: { color: palette.primaryDark },
    indicator: palette.primaryDark,
  },
  primary: {
    button: {
      backgroundColor: palette.primary,
      shadowColor: palette.primary,
      shadowOpacity: 0,
      shadowRadius: 0,
      shadowOffset: { width: 0, height: 6 },
      elevation: 3,
    },
    text: {
      color: palette.white,
    },
    indicator: palette.white,
  },
  secondary: {
    button: {
      backgroundColor: palette.secondary,
    },
    text: {
      color: palette.white,
    },
    indicator: palette.white,
  },
  outline: {
    button: {
      backgroundColor: palette.white,
      borderWidth: 1,
      borderColor: palette.primary,
    },
    text: {
      color: palette.primary,
    },
    indicator: palette.primary,
  },
};

const pillStyles = {
  neutral: {
    wrap: {
      backgroundColor: "#f5f7f4",
      borderColor: palette.border,
    },
    text: {
      color: palette.muted,
    },
  },
  good: {
    wrap: {
      backgroundColor: "#e9f6f1",
      borderColor: "#b9ddd1",
    },
    text: {
      color: palette.success,
    },
  },
  warm: {
    wrap: {
      backgroundColor: "#fff2e5",
      borderColor: "#f3c89d",
    },
    text: {
      color: palette.accent,
    },
  },
};
