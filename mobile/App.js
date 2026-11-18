import "react-native-gesture-handler";
import "./src/location/chefTracking";

import { NavigationContainer, DefaultTheme } from "@react-navigation/native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useFonts } from "expo-font";

import { ErrorBoundary } from "./src/components/ErrorBoundary";
import { AuthProvider } from "./src/auth/AuthContext";
import { AppNavigator } from "./src/navigation/AppNavigator";
import { palette } from "./src/theme";
import ReferenceSplash from "./src/components/ReferenceSplash";
import { isTestEnvironment } from "./src/api/supabase";
import { Text } from "react-native";

const navTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: palette.canvas,
    card: palette.surface,
    text: palette.text,
    border: palette.border,
    primary: palette.primary,
  },
};

export default function App() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular: require("@expo-google-fonts/inter/400Regular/Inter_400Regular.ttf"),
    Inter_500Medium: require("@expo-google-fonts/inter/500Medium/Inter_500Medium.ttf"),
    Inter_600SemiBold: require("@expo-google-fonts/inter/600SemiBold/Inter_600SemiBold.ttf"),
    Inter_700Bold: require("@expo-google-fonts/inter/700Bold/Inter_700Bold.ttf"),
    NunitoSans_400Regular: require("@expo-google-fonts/nunito-sans/400Regular/NunitoSans_400Regular.ttf"),
    NunitoSans_600SemiBold: require("@expo-google-fonts/nunito-sans/600SemiBold/NunitoSans_600SemiBold.ttf"),
    NunitoSans_700Bold: require("@expo-google-fonts/nunito-sans/700Bold/NunitoSans_700Bold.ttf"),
    NunitoSans_800ExtraBold: require("@expo-google-fonts/nunito-sans/800ExtraBold/NunitoSans_800ExtraBold.ttf"),
  });
  if (!fontsLoaded && !fontError) return <ReferenceSplash />;
  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        {isTestEnvironment ? <Text style={{ padding: 7, textAlign: "center", backgroundColor: "#F2B134", color: "#14213D", fontSize: 11 }}>CHEFOS TEST ENVIRONMENT</Text> : null}
        <AuthProvider>
          <NavigationContainer theme={navTheme}>
            <StatusBar style="dark" />
            <AppNavigator />
          </NavigationContainer>
        </AuthProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}
