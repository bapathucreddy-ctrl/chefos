import { useEffect, useRef } from "react";
import { AccessibilityInfo, Animated, StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { NativeBrand } from "./BrandSplash";
import { NAVY, GOLD } from "./reference";

// The current reference uses the complete supplied wordmark and a low loading
// indicator. Keep the earlier C/hat experiment in ChefosSplash for comparison.
export default function ReferenceSplash({ onFinish }) {
  const progress = useRef(new Animated.Value(0)).current;
  const callback = useRef(onFinish);
  useEffect(() => {
    callback.current = onFinish;
  }, [onFinish]);
  useEffect(() => {
    let disposed = false,
      animation;
    AccessibilityInfo.isReduceMotionEnabled()
      .catch(() => false)
      .then((reduced) => {
        if (disposed) return;
        animation = Animated.timing(progress, {
          toValue: 1,
          duration: reduced ? 150 : 1800,
          useNativeDriver: false,
        });
        animation.start(({ finished }) => {
          if (finished && !disposed) callback.current?.();
        });
      });
    return () => {
      disposed = true;
      animation?.stop();
    };
  }, [progress]);
  return (
    <LinearGradient colors={[NAVY, "#0B233A", NAVY]} style={styles.screen}>
      <StatusBar style="light" />
      <View accessibilityLabel="Chefos" style={styles.logo}>
        <NativeBrand size={78} />
      </View>
      <View
        accessibilityRole="progressbar"
        accessibilityLabel="Loading Chefos"
        style={styles.track}
      >
        <Animated.View
          style={[
            styles.fill,
            {
              width: progress.interpolate({
                inputRange: [0, 1],
                outputRange: ["8%", "100%"],
              }),
            },
          ]}
        />
      </View>
    </LinearGradient>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: "center", justifyContent: "center" },
  logo: { marginBottom: 5 },
  track: {
    position: "absolute",
    bottom: "9.5%",
    width: 176,
    height: 5,
    borderRadius: 3,
    overflow: "hidden",
    backgroundColor: "#ffffff29",
  },
  fill: { height: 5, borderRadius: 3, backgroundColor: GOLD },
});
