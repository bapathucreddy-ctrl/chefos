import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import { Alert } from "react-native";
import { api } from "../api/client";
import { environment, requireSupabase } from "../api/supabase";

const TASK = `chefos-gps-${environment}`;
const KEY = `chefos:tracking:${environment}`;
let foreground = null;
let sending = false;
let generation = 0;

export async function getChefTrackingState() {
  const stored = await AsyncStorage.getItem(KEY);
  return stored ? JSON.parse(stored) : null;
}

async function send(position) {
  if (sending || !position?.coords) return;
  sending = true;
  const version = generation;
  try {
    const state = await getChefTrackingState();
    if (!state) return;
    const { data } = await requireSupabase().auth.getSession();
    if (version !== generation) return;
    if (data.session?.user?.id !== state.owner) {
      await stopChefTracking();
      return;
    }
    const { coords } = position;
    await api.post("tracking/location/", {
      session_id: state.sessionId,
      latitude: coords.latitude,
      longitude: coords.longitude,
      accuracy: coords.accuracy >= 0 ? coords.accuracy : null,
      heading:
        coords.heading >= 0 && coords.heading < 360 ? coords.heading : null,
      speed: coords.speed >= 0 ? coords.speed : null,
      recorded_at: new Date(position.timestamp).toISOString(),
    });
  } catch (error) {
    if ([401, 403].includes(error.response?.status)) await stopChefTracking();
  } finally {
    sending = false;
  }
}

if (!TaskManager.isTaskDefined(TASK))
  TaskManager.defineTask(TASK, async ({ data, error }) => {
    if (error || !data?.locations?.length) return;
    await send(data.locations[data.locations.length - 1]);
  });

export async function stopChefTracking() {
  generation += 1;
  await AsyncStorage.removeItem(KEY);
  foreground?.remove();
  foreground = null;
  if (await Location.hasStartedLocationUpdatesAsync(TASK))
    await Location.stopLocationUpdatesAsync(TASK);
}

export async function startChefTracking(
  owner,
  sessionId = null,
  askPermissions = true,
) {
  const existing = await getChefTrackingState();
  if (existing && existing.owner !== owner) await stopChefTracking();
  if (
    existing?.owner === owner &&
    (await Location.hasStartedLocationUpdatesAsync(TASK))
  ) {
    const state = { owner, sessionId, mode: "background" };
    await AsyncStorage.setItem(KEY, JSON.stringify(state));
    return state;
  }
  let permission = await Location.getForegroundPermissionsAsync();
  if (!permission.granted && askPermissions)
    permission = await Location.requestForegroundPermissionsAsync();
  if (!permission.granted)
    throw new Error(
      "Enable location access to share your position while online.",
    );
  let background = await Location.getBackgroundPermissionsAsync();
  if (!background.granted && background.canAskAgain && askPermissions) {
    const allow = await new Promise((resolve) =>
      Alert.alert(
        "Keep your journey visible",
        "Allow background location so customers can follow your chef journey when you use navigation or lock the phone.",
        [
          { text: "While app is open", onPress: () => resolve(false) },
          { text: "Allow background location", onPress: () => resolve(true) },
        ],
        { cancelable: true, onDismiss: () => resolve(false) },
      ),
    );
    if (allow) background = await Location.requestBackgroundPermissionsAsync();
  }
  const state = {
    owner,
    sessionId,
    mode: background.granted ? "background" : "foreground",
  };
  await AsyncStorage.setItem(KEY, JSON.stringify(state));
  try {
    if (background.granted) {
      foreground?.remove();
      foreground = null;
      await Location.startLocationUpdatesAsync(TASK, {
        accuracy: Location.Accuracy.High,
        timeInterval: 5000,
        distanceInterval: 10,
        deferredUpdatesInterval: 5000,
        pausesUpdatesAutomatically: false,
        showsBackgroundLocationIndicator: true,
        foregroundService: {
          notificationTitle: "Chefos location sharing",
          notificationBody:
            "Sharing your position while online or travelling to a cooking visit.",
          notificationColor: "#14213D",
          killServiceOnDestroy: false,
        },
      });
    } else if (!foreground) {
      foreground = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: 5000,
          distanceInterval: 10,
        },
        send,
      );
    }
    await send(
      await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      }),
    );
    return state;
  } catch (error) {
    await stopChefTracking();
    throw error;
  }
}
