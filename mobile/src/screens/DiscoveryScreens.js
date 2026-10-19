import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Image,
  ImageBackground,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Location from "expo-location";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { Button, Screen } from "../components/ui";
import {
  Header,
  ChefAvatar,
  Chip,
  Notice,
  NAVY,
  GOLD,
  PAPER,
  s,
} from "../components/reference";
const cuisines = ["Indian", "South Indian", "North Indian", "Biryani"];
const images = [
  require("../assets/reference/food_01_south_indian_thali.png"),
  require("../assets/reference/food_02_paneer_butter_masala_naan.png"),
  require("../assets/reference/food_03_chicken_biryani.png"),
  require("../assets/reference/food_05_fish_curry_meal.png"),
];
const shortcuts = [
  images[0],
  require("../assets/reference/food_04_breakfast_dosa_idli_vada.png"),
  images[1],
  images[2],
];
function Search({ value, onChange, onSubmit }) {
  return (
    <View
      style={[
        s.row,
        {
          backgroundColor: "#f0eeea",
          borderRadius: 12,
          paddingHorizontal: 14,
          height: 46,
        },
      ]}
    >
      <Ionicons name="search-outline" size={19} color="#72757b" />
      <TextInput
        accessibilityLabel="Search for cuisines or chefs"
        placeholder="Search for cuisines, chefs…"
        value={value}
        onChangeText={onChange}
        onSubmitEditing={onSubmit}
        returnKeyType="search"
        style={{ flex: 1, fontSize: 13, color: NAVY }}
      />
    </View>
  );
}
export function HomeScreen({ navigation }) {
  const [search, setSearch] = useState("");
  return (
    <Screen background={PAPER} contentContainerStyle={{ padding: 18, gap: 17 }}>
      <Header
        right={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="View today's service"
            onPress={() => navigation.navigate("Today")}
          >
            <Ionicons name="notifications-outline" size={22} color={NAVY} />
          </Pressable>
        }
      />
      <Search
        value={search}
        onChange={(value) => {
          setSearch(value);
        }}
        onSubmit={() => navigation.navigate("Discover", { search })}
      />
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        {cuisines.map((name, index) => (
          <Pressable
            key={name}
            accessibilityRole="button"
            onPress={() => navigation.navigate("Discover", { search: name })}
            style={{ alignItems: "center", gap: 8 }}
          >
            <View
              style={{
                width: 64,
                height: 57,
                borderRadius: 13,
                backgroundColor: "#f0ede7",
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <Image
                source={shortcuts[index]}
                style={{ width: 56, height: 45, borderRadius: 8 }}
              />
            </View>
            <Text style={[s.small, { fontSize: 10 }]}>{name}</Text>
          </Pressable>
        ))}
      </View>
      <ImageBackground
        source={require("../assets/reference/banner_01_curry_hero_banner.png")}
        imageStyle={{ borderRadius: 15, width: "100%", height: "100%" }}
        style={{ height: 177, borderRadius: 13, overflow: "hidden" }}
      >
        <LinearGradient
          colors={["#000000bb", "#00000020"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={{
            flex: 1,
            padding: 20,
            alignItems: "flex-start",
            justifyContent: "center",
          }}
        >
          <Text
            style={{
              fontFamily: "serif",
              fontSize: 25,
              color: "#fff",
              lineHeight: 29,
            }}
          >
            Freshly cooked{"\n"}by expert chefs
          </Text>
          <Text style={{ fontSize: 11, color: "#eee", marginVertical: 10 }}>
            Home-style meals, made for you.
          </Text>
          <Button
            label="Book a Chef"
            variant="gold"
            onPress={() => navigation.navigate("Discover")}
          />
        </LinearGradient>
      </ImageBackground>
      <View style={s.between}>
        <Text style={s.subtitle}>Top Cuisines</Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => navigation.navigate("Discover")}
        >
          <Text style={{ color: "#cc8b19", fontSize: 12 }}>See all</Text>
        </Pressable>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 12 }}
      >
        {["South Indian", "North Indian", "Biryani", "Coastal"].map((name, i) => (
          <Pressable
            accessibilityRole="button"
            key={name}
            onPress={() => navigation.navigate("Discover", { search: name })}
          >
            <Image
              source={images[i]}
              style={{
                height: 88,
                width: 88,
                borderRadius: 13,
                backgroundColor: "#e8e2d8",
              }}
            />
            <Text style={[s.small, { textAlign: "center", marginTop: 9 }]}>
              {name}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </Screen>
  );
}
export function ChefListScreen({ navigation, route }) {
  const [chefs, setChefs] = useState([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [search, setSearch] = useState(route.params?.search || ""),
    [sort, setSort] = useState(false),
    [cuisine, setCuisine] = useState("All"),
    [coords, setCoords] = useState(null);
  useEffect(
    () => setSearch(route.params?.search || ""),
    [route.params?.search],
  );
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("chefs/", {
        params: coords
          ? { lat: coords.latitude, lng: coords.longitude, radius_km: 5 }
          : {},
      });
      setChefs(Array.isArray(data) ? data : []);
      setError("");
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [coords]);
  async function nearby() {
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== "granted")
        throw new Error(
          "Location permission is needed to find chefs within 5 km.",
        );
      const current = await Location.getCurrentPositionAsync({});
      setCoords(current.coords);
    } catch (e) {
      Alert.alert("Nearby chefs", e.message);
    }
  }
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );
  const filtered = chefs
    .filter(
      (c) =>
        (c.name + " " + c.speciality)
          .toLowerCase()
          .includes(search.toLowerCase()) &&
        (cuisine === "All" ||
          c.speciality.toLowerCase().includes(cuisine.toLowerCase())),
    )
    .sort((a, b) =>
      sort ? Number(b.rating) - Number(a.rating) : a.name.localeCompare(b.name),
    );
  return (
    <Screen background={PAPER} contentContainerStyle={{ padding: 20, gap: 17 }}>
      <Header
        title={coords ? "Chefs near you" : "Find your chef"}
        onBack={() => navigation.navigate("Home")}
      />
      <Search value={search} onChange={setSearch} />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8 }}
      >
        <Chip
          label={coords ? "Within 5 km" : "Near me"}
          selected={!!coords}
          onPress={nearby}
        />
        {["All", "South Indian", "North Indian", "Chinese"].map((name) => (
          <Chip
            key={name}
            label={name}
            selected={cuisine === name}
            onPress={() => setCuisine(name)}
          />
        ))}
        <Chip
          label="Top rated"
          selected={sort}
          onPress={() => setSort(!sort)}
        />
      </ScrollView>
      <Text style={s.small}>
        {loading
          ? "Finding your kitchen companion…"
          : `${filtered.length} verified, available chefs`}
      </Text>
      {error ? (
        <>
          <Text style={s.error}>{error}</Text>
          <Button label="Try again" onPress={load} />
        </>
      ) : null}
      {!loading && !error && !filtered.length ? (
        <Notice>
          No available chefs match your search. Try another cuisine or check
          back soon.
        </Notice>
      ) : null}
      {filtered.map((chef) => (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`View ${chef.name}`}
          key={chef.id}
          onPress={() => navigation.navigate("ChefProfile", { chef })}
          style={[
            s.row,
            {
              paddingVertical: 16,
              borderBottomWidth: 1,
              borderColor: "#e9e5de",
              alignItems: "flex-start",
            },
          ]}
        >
          <ChefAvatar chef={chef} size={82} />
          <View style={{ flex: 1, gap: 6 }}>
            <Text style={s.subtitle}>{chef.name}</Text>
            <Text style={s.small}>
              <Text style={{ color: GOLD }}>★ </Text>
              {Number(chef.rating).toFixed(1)} · Verified chef
            </Text>
            <Text style={s.small}>
              {chef.speciality || "Home-style cooking"}
            </Text>
            <View style={{ flexDirection: "row", gap: 5, flexWrap: "wrap" }}>
              {["Freshly prepared", "At your home"].map((t) => (
                <Text
                  key={t}
                  style={{
                    fontSize: 10,
                    color: "#5b6169",
                    backgroundColor: "#efede8",
                    padding: 4,
                    borderRadius: 4,
                  }}
                >
                  {t}
                </Text>
              ))}
            </View>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#848891" />
        </Pressable>
      ))}
    </Screen>
  );
}
export function ChefProfileScreen({ navigation, route }) {
  const { chef } = route.params;
  return (
    <Screen background={PAPER} contentContainerStyle={{ padding: 0, gap: 0 }}>
      <View
        style={{
          height: 265,
          backgroundColor: NAVY,
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        {chef.photo_url ? (
          <Image
            source={{ uri: chef.photo_url }}
            style={{ position: "absolute", inset: 0 }}
          />
        ) : (
          <ChefAvatar chef={chef} size={140} />
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          onPress={() => navigation.goBack()}
          style={{
            position: "absolute",
            top: 18,
            left: 22,
            backgroundColor: "#ffffffdd",
            padding: 9,
            borderRadius: 20,
          }}
        >
          <Ionicons name="arrow-back" size={22} color={NAVY} />
        </Pressable>
      </View>
      <View
        style={{
          padding: 25,
          gap: 22,
          marginTop: -18,
          borderTopLeftRadius: 23,
          borderTopRightRadius: 23,
          backgroundColor: PAPER,
        }}
      >
        <View style={{ gap: 8 }}>
          <Text style={s.title}>{chef.name}</Text>
          <Text style={s.small}>
            <Text style={{ color: GOLD }}>★ </Text>
            {Number(chef.rating).toFixed(1)} · Verified partner
          </Text>
          <Text style={s.muted}>{chef.speciality || "Home-style cuisine"}</Text>
        </View>
        <View
          style={[
            s.row,
            {
              justifyContent: "space-between",
              paddingVertical: 18,
              borderTopWidth: 1,
              borderBottomWidth: 1,
              borderColor: "#e8e5df",
            },
          ]}
        >
          <View>
            <Text style={s.subtitle}>Verified</Text>
            <Text style={s.small}>Profile reviewed</Text>
          </View>
          <View>
            <Text style={s.subtitle}>Fresh</Text>
            <Text style={s.small}>Cooked at home</Text>
          </View>
          <View>
            <Text style={s.subtitle}>Your choice</Text>
            <Text style={s.small}>Meals & schedule</Text>
          </View>
        </View>
        <Text style={s.subtitle}>About</Text>
        <Text style={s.muted}>
          {chef.bio ||
            `${chef.name} offers ${chef.speciality || "home-style cooking"}. Choose your meals and a service slot, then review your personalised quote before booking.`}
        </Text>
        <Notice>
          Service prices depend on your household size, meal selection and plan
          duration. Ingredients are provided by your household.
        </Notice>
        <Button
          label="Book Chef"
          onPress={() => navigation.navigate("Booking", { chef })}
        />
      </View>
    </Screen>
  );
}
export function ProfileScreen({ navigation }) {
  const { profile, logout } = useAuth();
  return (
    <Screen background={PAPER}>
      <Header title="Your profile" />
      <Text style={s.title}>{profile?.full_name || profile?.username}</Text>
      <Text style={s.muted}>
        {profile?.email || profile?.phone || "Welcome to Chefos"}
      </Text>
      {[
        ["Weekly menu", "Menu"],
        ["Today’s meals & service codes", "Today"],
        ["Your subscriptions", "Subscription"],
      ].map(([label, path]) => (
        <Button
          key={path}
          label={label}
          variant="outline"
          onPress={() => navigation.navigate(path)}
        />
      ))}
      <Button label="Sign out" variant="outline" onPress={logout} />
    </Screen>
  );
}
