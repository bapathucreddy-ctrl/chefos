import { useEffect, useId, useRef } from "react"
import {
  AccessibilityInfo,
  Animated,
  StyleSheet,
  Text,
  View
} from "react-native"
import { LinearGradient } from "expo-linear-gradient"
import { StatusBar } from "expo-status-bar"
import Svg, {
  Defs,
  Filter,
  FeColorMatrix,
  FeFlood,
  FeComposite,
  G,
  Image as SvgImage
} from "react-native-svg"

export function NativeBrand({ size = 48, color = "#ffffff" }) {
  const id = `native-logo-${useId().replace(/:/g, "")}`
  return (
    <Svg
      accessibilityLabel="Chefos"
      width={size * 3.4}
      height={size * 1.28}
      viewBox="94 408 1068 400"
    >
      <Defs>
        <Filter
          id={id}
          x="0"
          y="0"
          width="100%"
          height="100%"
          colorInterpolationFilters="sRGB"
        >
          <FeColorMatrix
            type="matrix"
            values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  3 0 0 0 -0.55"
            result="logoAlpha"
          />
          <FeFlood floodColor={color} />
          <FeComposite in2="logoAlpha" operator="in" />
        </Filter>
      </Defs>
      <G filter={`url(#${id})`}>
        <SvgImage
          href={require("../assets/reference/logo.png")}
          width="1254"
          height="1254"
        />
      </G>
    </Svg>
  )
}

export function BrandSplashScreen({ label = "Chefos" }) {
  const c = useRef(new Animated.Value(0)).current
  const hat = useRef(new Animated.Value(-150)).current
  const word = useRef(new Animated.Value(0)).current
  const rings = useRef(new Animated.Value(0)).current
  useEffect(() => {
    let animation
    let disposed = false
    AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (disposed) return
      if (reduced) {
        c.setValue(1)
        hat.setValue(0)
        word.setValue(1)
        rings.setValue(1)
        return
      }
      animation = Animated.sequence([
        Animated.timing(c, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true
        }),
        Animated.spring(hat, {
          toValue: 0,
          friction: 5,
          tension: 65,
          useNativeDriver: true
        }),
        Animated.timing(word, {
          toValue: 1,
          duration: 550,
          useNativeDriver: true
        }),
        Animated.timing(rings, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true
        })
      ])
      animation.start()
    })
    return () => {
      disposed = true
      animation?.stop()
    }
  }, [c, hat, word, rings])
  return (
    <LinearGradient
      colors={["#14213D", "#14213D", "#0a1931"]}
      style={styles.screen}
      accessibilityLabel="Welcome to Chefos"
    >
      <StatusBar style="light" />
      {[290, 370, 460].map((size, index) => (
        <Animated.View
          key={size}
          style={[
            styles.orbit,
            {
              width: size,
              height: size,
              borderRadius: size,
              opacity: rings,
              transform: [
                { rotate: `${index * 65 + 25}deg` },
                {
                  scale: rings.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.8, 1]
                  })
                }
              ],
              borderLeftColor: index === 0 ? "#F2B134" : "#ffffff12",
              borderRightColor: index === 1 ? "#F2B13450" : "#ffffff12"
            }
          ]}
        />
      ))}
      <View
        style={{
          width: 300,
          height: 100,
          alignItems: "center",
          justifyContent: "center"
        }}
      >
        <Animated.View
          style={{
            opacity: Animated.multiply(
              c,
              word.interpolate({ inputRange: [0, 1], outputRange: [1, 0] })
            )
          }}
        >
          <Text style={styles.c}>C</Text>
          <Animated.View
            style={[
              styles.hat,
              { transform: [{ translateY: hat }, { rotate: "-13deg" }] }
            ]}
          >
            <View style={styles.hatTop} />
            <View style={styles.hatRight} />
          </Animated.View>
        </Animated.View>
        <Animated.View
          style={{
            position: "absolute",
            width: 300,
            height: 100,
            opacity: word
          }}
        >
          <NativeBrand size={300 / 3.4} />
        </Animated.View>
      </View>
      <Animated.Text style={[styles.tagline, { opacity: word }]}>
        {label.includes("Partner")
          ? "THE CHEF PARTNER EXPERIENCE"
          : "GOOD FOOD. YOUR WAY."}
      </Animated.Text>
      <View style={styles.homeIndicator} />
    </LinearGradient>
  )
}
const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden"
  },
  wordmark: { flexDirection: "row", alignItems: "baseline" },
  c: { fontSize: 82, fontWeight: "900", letterSpacing: -7, color: "white" },
  word: { fontSize: 70, fontWeight: "800", letterSpacing: -3, color: "white" },
  dot: { color: "#F2B134" },
  hat: {
    position: "absolute",
    top: -2,
    left: 0,
    width: 44,
    height: 23,
    backgroundColor: "white",
    borderRadius: 11
  },
  hatTop: {
    position: "absolute",
    top: -13,
    left: 11,
    width: 24,
    height: 25,
    borderRadius: 20,
    backgroundColor: "white"
  },
  hatRight: {
    position: "absolute",
    top: -4,
    right: -5,
    width: 21,
    height: 21,
    borderRadius: 20,
    backgroundColor: "white"
  },
  tagline: { fontSize: 8, letterSpacing: 3.4, color: "#aab9ce", marginTop: 15 },
  orbit: { position: "absolute", borderWidth: 1, borderColor: "#ffffff12" },
  homeIndicator: {
    position: "absolute",
    bottom: 20,
    width: 85,
    height: 3,
    borderRadius: 4,
    backgroundColor: "#ffffffaa"
  }
})
