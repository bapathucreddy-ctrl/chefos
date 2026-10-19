import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import Constants from "expo-constants";
import { Ionicons } from "@expo/vector-icons";

import { useAuth } from "../auth/AuthContext";
import ReferenceSplash from "../components/ReferenceSplash";
import { palette } from "../theme";
import { AuthScreen } from "../screens/AuthScreen";
import { ResetPasswordScreen } from "../screens/ResetPasswordScreen";
import { ChefHomeScreen } from "../screens/ChefHomeScreen";
import { ChefRegisterScreen } from "../screens/ChefRegisterScreen";
import { ScheduleScreen } from "../screens/ScheduleScreen";
import { SignupScreen } from "../screens/SignupScreen";
import { SubscriptionScreen } from "../screens/SubscriptionScreen";
import {
  HomeScreen,
  ChefListScreen,
  ChefProfileScreen,
  ProfileScreen,
} from "../screens/DiscoveryScreens";
import {
  BookingScreen,
  ReviewBookingScreen,
  BookingConfirmedScreen,
} from "../screens/BookingScreens";
import { OnboardingScreen } from "../screens/OnboardingScreen";
import { CustomerLoginScreen } from "../screens/CustomerLoginScreen";
import { CustomerDetailsScreen } from "../screens/CustomerDetailsScreen";
import { WeeklyMenuScreen } from "../screens/WeeklyMenuScreen";

const Stack = createNativeStackNavigator();
const Tabs = createBottomTabNavigator();
const appVariant =
  Constants.expoConfig?.extra?.appVariant === "chef" ? "chef" : "user";

function UserTabs() {
  const iconMap = useMemo(
    () => ({
      Home: ["home", "home-outline"],
      Discover: ["search", "search-outline"],
      Profile: ["person", "person-outline"],
      Subscription: ["calendar-outline", "calendar-outline"],
    }),
    [],
  );

  return (
    <Tabs.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: palette.accent,
        tabBarInactiveTintColor: "#555B64",
        tabBarStyle: {
          backgroundColor: "rgba(255,255,255,0.98)",
          borderTopColor: palette.border,
          height: 68,
          paddingTop: 6,
          paddingBottom: 9,
          paddingHorizontal: 8,
          borderTopLeftRadius: 0,
          borderTopRightRadius: 0,
        },
        tabBarLabelStyle: {
          fontFamily: "Inter_500Medium",
          fontSize: 10,
        },
        tabBarIcon: ({ focused, color, size }) => {
          const [activeIcon, idleIcon] = iconMap[route.name] || [
            "ellipse",
            "ellipse-outline",
          ];
          return (
            <Ionicons
              name={focused ? activeIcon : idleIcon}
              size={21}
              color={color}
            />
          );
        },
      })}
    >
      <Tabs.Screen name="Home" component={HomeScreen} />
      <Tabs.Screen
        name="Discover"
        component={ChefListScreen}
        options={{ tabBarLabel: "Search" }}
      />
      <Tabs.Screen
        name="Subscription"
        component={SubscriptionScreen}
        options={{ tabBarLabel: "Bookings" }}
      />
      <Tabs.Screen name="Profile" component={ProfileScreen} />
    </Tabs.Navigator>
  );
}

function ChefStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="ChefHome" component={ChefHomeScreen} />
    </Stack.Navigator>
  );
}

export function AppNavigator() {
  const { booting, role, isAuthenticated, recovering, session } = useAuth();
  const [showSplash, setShowSplash] = useState(true);
  const [onboarded, setOnboarded] = useState(null);
  useEffect(() => {
    AsyncStorage.getItem("chefos:onboarded:v2")
      .then((value) => setOnboarded(value === "yes"))
      .catch(() => setOnboarded(false));
  }, []);
  async function finishOnboarding() {
    await AsyncStorage.setItem("chefos:onboarded:v2", "yes");
    setOnboarded(true);
  }

  const finishSplash = useCallback(() => setShowSplash(false), []);

  if (showSplash) return <ReferenceSplash onFinish={finishSplash} />;
  if (booting || onboarded === null) return <ReferenceSplash />;
  if (recovering && isAuthenticated) return <ResetPasswordScreen />;

  if (isAuthenticated && role === "chef") {
    return <ChefStack />;
  }

  if (isAuthenticated && role === "user") {
    if (!session?.user?.user_metadata?.onboarding_complete)
      return <CustomerDetailsScreen />;
    return (
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="CustomerTabs" component={UserTabs} />
        <Stack.Screen name="ChefProfile" component={ChefProfileScreen} />
        <Stack.Screen name="Booking" component={BookingScreen} />
        <Stack.Screen name="ReviewBooking" component={ReviewBookingScreen} />
        <Stack.Screen
          name="BookingConfirmed"
          component={BookingConfirmedScreen}
        />
        <Stack.Screen name="Menu" component={WeeklyMenuScreen} />
        <Stack.Screen name="Today" component={ScheduleScreen} />
      </Stack.Navigator>
    );
  }
  if (appVariant === "user" && !onboarded)
    return <OnboardingScreen onFinish={finishOnboarding} />;

  if (appVariant === "chef") {
    return (
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen
          name="AuthChef"
          component={AuthScreen}
          initialParams={{ role: "chef" }}
        />
        <Stack.Screen name="ChefRegister" component={ChefRegisterScreen} />
      </Stack.Navigator>
    );
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="AuthUser" initialParams={{ role: "user" }}>
        {(props) => (
          <CustomerLoginScreen
            {...props}
            onBackToOnboarding={() => setOnboarded(false)}
          />
        )}
      </Stack.Screen>
      <Stack.Screen name="Signup" component={SignupScreen} />
    </Stack.Navigator>
  );
}
