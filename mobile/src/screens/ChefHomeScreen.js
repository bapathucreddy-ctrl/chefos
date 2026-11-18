import { useEffect, useState } from "react";
import { Alert, Pressable, Switch, Text, View } from "react-native";
import * as Location from "expo-location";

import { useAuth } from "../auth/AuthContext";
import { api } from "../api/client";
import { readCachedValue, writeCachedValue } from "../api/cache";
import { pendingSegments, uploadPending } from "../api/recordingQueue";
import { Button, LoadingState, Screen } from "../components/ui";
import { safeArray, titleCase } from "../utils/format";
import { Ionicons } from "@expo/vector-icons";
import { NAVY, GOLD, PAPER, s } from "../components/reference";
import { Segments } from "../components/interactive";
import { ServiceMap } from "../components/ServiceMap";
import { getChefTrackingState, startChefTracking, stopChefTracking } from "../location/chefTracking";

const CHEF_HOME_CACHE_TTL_MS = 20 * 1000;

export function ChefHomeScreen({ navigation }) {
  const { logout, session: auth } = useAuth();
  async function safeLogout() {
    try {
      if ((await pendingSegments(auth.user.id)).length) {
        await uploadPending(auth.user.id);
        if ((await pendingSegments(auth.user.id)).length) throw new Error("Upload your saved kitchen recordings before signing out.");
      }
      await logout();
    } catch (e) { Alert.alert("Saved kitchen recordings", e.message); }
  }
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState("");
  const [workspace, setWorkspace] = useState("visits");
  const [trackingNote, setTrackingNote] = useState("");
  const available = Boolean(data?.partner_profile?.chef?.is_available);
  const loaded = Boolean(data);
  useEffect(() => {
    if (!data) return;
    if (available) startChefTracking(auth.user.id, null, false).then((state) => setTrackingNote(state.mode === "background" ? "Live GPS sharing is on" : "GPS updates while this app is open")).catch(() => setTrackingNote("Enable GPS using Update location"));
    else getChefTrackingState().then((state) => { if (!state?.sessionId || !data.service_sessions?.some((visit) => visit.id === state.sessionId)) return stopChefTracking(); }).catch(() => {});
  }, [available, loaded, auth.user.id]);

  const load = async (soft = false) => {
    if (!soft) setLoading(true);
    try {
      const cached = await readCachedValue("chefs:partner:me", {
        maxAgeMs: CHEF_HOME_CACHE_TTL_MS,
      });
      if (cached) {
        setData(cached);
        setLoading(false);
      }

      const [res, visits] = await Promise.all([api.get("chefs/partner/me/"), api.get("sessions/")]);
      const merged = { ...res.data, service_sessions: visits.data.rows.filter((r) => r.status !== "completed") };
      setData(merged);
      await writeCachedValue("chefs:partner:me", merged);
    } catch (err) {
      Alert.alert(
        "Unable to load chef dashboard",
        err?.response?.data?.detail || "Please login again.",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const timer = setInterval(() => load(true), 20000);
    return () => clearInterval(timer);
  }, []);

  const toggleAvailability = async () => {
    const next = !data?.partner_profile?.chef?.is_available;
    setBusy("availability");
    try {
      await api.post("chefs/partner/availability/", { is_available: next });
      if (next) {
        try { const state = await startChefTracking(auth.user.id); setTrackingNote(state.mode === "background" ? "Live GPS sharing is on" : "GPS updates while this app is open"); }
        catch (error) { await api.post("chefs/partner/availability/", { is_available: false }); throw error; }
      } else await stopChefTracking();
      await load(true);
    } catch (err) {
      Alert.alert(
        "Unable to update availability",
        err?.response?.data?.detail || "Please try again.",
      );
    } finally {
      setBusy("");
    }
  };

  const syncLocation = async () => {
    setBusy("location");
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== "granted") {
        Alert.alert(
          "Permission needed",
          "Location permission is required to update chef coordinates.",
        );
        return;
      }
      const current = await Location.getCurrentPositionAsync({});
      await api.post("chefs/partner/location/", {
        latitude: current.coords.latitude,
        longitude: current.coords.longitude,
      });
      if (available) {
        const state = await startChefTracking(auth.user.id);
        setTrackingNote(state.mode === "background" ? "Live GPS sharing is on" : "GPS updates while this app is open");
      }
      await load(true);
    } catch (err) {
      Alert.alert(
        "Unable to update location",
        err?.response?.data?.detail || "Please try again.",
      );
    } finally {
      setBusy("");
    }
  };

  const respondToOffer = async (requestId, action) => {
    setBusy(`${requestId}:${action}`);
    try {
      await api.post("chefs/partner/instant/respond/", {
        request_id: requestId,
        action,
      });
      await load(true);
    } catch (err) {
      Alert.alert(
        "Unable to update request",
        err?.response?.data?.detail || "Please try again.",
      );
    } finally {
      setBusy("");
    }
  };

  if (loading) {
    return (
      <Screen>
        <LoadingState label="Loading chef workspace..." />
      </Screen>
    );
  }

  const chef = data?.partner_profile?.chef;
  const pendingRequests = safeArray(data?.pending_instant_offers);
  const activeSessions = safeArray(data?.service_sessions);

  return (
    <Screen background={PAPER} contentContainerStyle={{ padding: 20, gap: 20 }}>
      <View style={s.between}>
        <View><Text style={s.small}>CHEFOS PARTNER</Text><Text style={s.title}>Hi, {chef?.name?.split(" ")[0] || "chef"}.</Text></View>
        <Pressable accessibilityRole="button" accessibilityLabel="Sign out" onPress={safeLogout} style={{ padding: 12 }}><Ionicons name="log-out-outline" size={24} color={NAVY} /></Pressable>
      </View>
      <Text style={s.small}>{available ? trackingNote || "Your location is shared with nearby customers while online." : "Go online to share your location with nearby customers."}</Text>
      <View style={[s.card, s.between, { backgroundColor: chef?.is_available ? "#e8f3e9" : "#eeefec", borderWidth: 0 }]}>
        <View style={{ gap: 5 }}><Text style={s.subtitle}>{chef?.is_available ? "You’re online" : "You’re offline"}</Text><Text style={s.small}>{chef?.is_available ? "Ready for your next kitchen" : "Go online when you’re ready"}</Text></View>
        <Switch accessibilityLabel="Available for bookings" value={Boolean(chef?.is_available)} disabled={busy === "availability"} onValueChange={toggleAvailability} trackColor={{ false: "#ccd2d5", true: GOLD }} thumbColor={NAVY} />
      </View>
      <View style={s.between}><Text style={s.subtitle}>Your neighbourhood</Text><Pressable accessibilityRole="button" accessibilityLabel="Update my location" disabled={busy === "location"} onPress={syncLocation}><Text style={{ color: "#a56d08", fontSize: 12 }}>{busy === "location" ? "Updating…" : "Update location ↗"}</Text></Pressable></View>
      <ServiceMap points={activeSessions.filter((visit) => visit.latitude != null && visit.longitude != null).map((visit) => ({ id: visit.id, name: visit.building_name || "Assigned home", latitude: visit.latitude, longitude: visit.longitude, kind: "home" }))}
        height={240} onSelect={(id) => { const visit = activeSessions.find((item) => item.id === id); if (visit) navigation.navigate("ChefCooking", { session: visit }); }} />
      <Pressable accessibilityRole="button" accessibilityLabel="Manage my time slots" onPress={() => navigation.navigate("ChefSchedule")}
        style={({ pressed }) => ({ padding: 20, borderRadius: 22, backgroundColor: NAVY, flexDirection: "row", alignItems: "center", gap: 13, opacity: pressed ? 0.85 : 1 })}>
        <Ionicons name="calendar-outline" size={27} color={GOLD} /><View style={{ flex: 1 }}><Text style={[s.subtitle, { color: "#fff" }]}>Make time for what works.</Text><Text style={[s.small, { color: "#d3dbe5" }]}>Adjust your cooking slots & leave</Text></View><Ionicons name="arrow-forward" size={23} color="#fff" />
      </Pressable>
      <Segments label="Partner workspace" value={workspace} onChange={setWorkspace} options={[{ value: "visits", label: `Cooking visits · ${activeSessions.length}`, icon: "restaurant-outline" }, { value: "requests", label: `Requests · ${pendingRequests.length}`, icon: "flash-outline" }]} />
      {workspace === "requests" ? <>
        {pendingRequests.map((request) => <View key={request.request_id} style={[s.card, { gap: 14 }]}>
          <View style={s.between}><Text style={s.subtitle}>A kitchen needs you</Text><Text style={{ color: "#aa710c", fontWeight: "700" }}>{request.seconds_left ?? 0}s</Text></View>
          <Text style={s.muted}>{request.username} · {request.building_name || "Customer’s home"}</Text>
          <Text style={s.subtitle}>{(request.meals || [request.meal]).map(titleCase).join(" + ")} · {request.people_count || "—"} people</Text>
          {request.cuisine ? <Text style={s.small}>{titleCase(request.cuisine)}</Text> : null}
          <View style={{ flexDirection: "row", gap: 10 }}><Button label="Decline" variant="outline" onPress={() => respondToOffer(request.request_id, "decline")} loading={busy === `${request.request_id}:decline`} style={{ flex: 1 }} /><Button label="Accept request" variant="gold" onPress={() => respondToOffer(request.request_id, "accept")} loading={busy === `${request.request_id}:accept`} style={{ flex: 1 }} /></View>
        </View>)}
        {!pendingRequests.length ? <Text style={s.muted}>You’re all caught up. New requests appear here.</Text> : null}
      </> : <>
        {activeSessions.map((visit) => <View key={visit.id} style={[s.card, { gap: 15 }]}>
          <View style={s.row}><View style={{ backgroundColor: "#fff1d2", padding: 13, borderRadius: 16 }}><Ionicons name="restaurant-outline" size={25} color={NAVY} /></View><View style={{ flex: 1, gap: 5 }}><Text style={s.subtitle}>{visit.building_name || "Your next cooking visit"}</Text><Text style={s.small}>{visit.service_date} · {(visit.meals || [visit.meal]).map(titleCase).join(" + ")}</Text></View></View>
          <Text style={s.muted}>{titleCase(visit.status)}{visit.starts_at ? ` · ${new Date(visit.starts_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" })}` : ""}</Text>
          <Button label="Open cooking visit" onPress={() => navigation.navigate("ChefCooking", { session: visit })} />
        </View>)}
        {!activeSessions.length ? <Text style={s.muted}>Your next booked kitchen will appear here.</Text> : null}
      </>}
    </Screen>
  );
}
