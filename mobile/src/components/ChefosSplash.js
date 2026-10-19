import { useEffect, useRef } from "react";
import {
  AccessibilityInfo,
  Animated,
  Easing,
  StyleSheet,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import Svg, { Path } from "react-native-svg";

const NAVY = "#14213D";
const WHITE = "#FFFFFF";
const C_PATH =
  "M70 56 C63 46 55 42 44 42 C26 42 14 55 14 73 C14 91 26 104 44 104 C55 104 64 99 70 90 L58 81 C54 87 50 89 44 89 C35 89 30 83 30 73 C30 63 35 57 44 57 C50 57 54 59 58 65 Z";
const HAT_PATH =
  "M17 48 C8 41 10 27 21 24 C25 23 28 24 31 25 C34 13 46 8 56 14 C61 4 74 4 81 12 C91 23 85 35 74 39 L70 48 C55 37 34 37 17 48 Z";

export default function ChefosSplash({ onFinish }) {
  const cOpacity = useRef(new Animated.Value(0)).current;
  const cScale = useRef(new Animated.Value(0.88)).current;
  const hatY = useRef(new Animated.Value(-110)).current;
  const hatOpacity = useRef(new Animated.Value(0)).current;
  const wordOpacity = useRef(new Animated.Value(0)).current;
  const wordX = useRef(new Animated.Value(-14)).current;
  const finish = useRef(onFinish);
  finish.current = onFinish;

  useEffect(() => {
    let disposed = false;
    let animation;
    let hold;
    async function start() {
      const reduced = await AccessibilityInfo.isReduceMotionEnabled().catch(
        () => false,
      );
      if (disposed) return;
      if (reduced) {
        cOpacity.setValue(1);
        cScale.setValue(1);
        hatY.setValue(0);
        hatOpacity.setValue(1);
        wordOpacity.setValue(1);
        wordX.setValue(0);
        hold = setTimeout(() => finish.current?.(), 150);
        return;
      }
      animation = Animated.sequence([
        Animated.parallel([
          Animated.timing(cOpacity, {
            toValue: 1,
            duration: 350,
            useNativeDriver: true,
          }),
          Animated.spring(cScale, {
            toValue: 1,
            friction: 7,
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(hatOpacity, {
            toValue: 1,
            duration: 180,
            useNativeDriver: true,
          }),
          Animated.spring(hatY, {
            toValue: 0,
            friction: 6,
            tension: 75,
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(wordOpacity, {
            toValue: 1,
            duration: 500,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(wordX, {
            toValue: 0,
            duration: 500,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
        ]),
        Animated.delay(800),
      ]);
      animation.start(({ finished }) => {
        if (finished && !disposed) finish.current?.();
      });
    }
    start();
    return () => {
      disposed = true;
      animation?.stop();
      clearTimeout(hold);
    };
  }, [cOpacity, cScale, hatY, hatOpacity, wordOpacity, wordX]);

  return (
    <View
      style={styles.container}
      accessibilityLabel="Welcome to Chefos"
      accessibilityRole="progressbar"
    >
      <StatusBar style="light" />
      <View style={styles.logoRow}>
        <Animated.View
          style={{ opacity: cOpacity, transform: [{ scale: cScale }] }}
        >
          <View style={styles.symbolContainer}>
            <Svg width={92} height={110} viewBox="0 0 92 110">
              <Path d={C_PATH} fill={WHITE} />
            </Svg>
          </View>
        </Animated.View>
        <Animated.Text
          style={[
            styles.wordmark,
            { opacity: wordOpacity, transform: [{ translateX: wordX }] },
          ]}
        >
          hefos
        </Animated.Text>
        <Animated.View
          pointerEvents="none"
          style={[
            styles.hatOverlay,
            { opacity: hatOpacity, transform: [{ translateY: hatY }] },
          ]}
        >
          <Svg width={92} height={110} viewBox="0 0 92 110">
            <Path d={HAT_PATH} fill={WHITE} />
          </Svg>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: NAVY,
    alignItems: "center",
    justifyContent: "center",
  },
  logoRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  symbolContainer: { width: 92, height: 110 },
  hatOverlay: { position: "absolute", top: 0, left: 0 },
  wordmark: {
    color: WHITE,
    fontSize: 56,
    fontWeight: "900",
    fontFamily: "NunitoSans_800ExtraBold",
    letterSpacing: -2.5,
    marginLeft: -9,
    marginTop: 34,
    includeFontPadding: false,
  },
});
