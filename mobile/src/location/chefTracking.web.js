import { api } from "../api/client";
let watch = null;
let owner = null;
let sessionId = null;
export async function getChefTrackingState() {
  return owner ? { owner, sessionId, mode: "foreground" } : null;
}
export async function stopChefTracking() {
  if (watch !== null) navigator.geolocation.clearWatch(watch);
  watch = null;
  owner = null;
  sessionId = null;
}
export async function startChefTracking(
  nextOwner,
  nextSession = null,
  askPermissions = true,
) {
  if (!navigator.geolocation)
    throw new Error("Location services are unavailable in this browser.");
  if (owner && owner !== nextOwner) await stopChefTracking();
  if (watch === null && !askPermissions) {
    const permission = await navigator.permissions?.query({
      name: "geolocation",
    });
    if (permission?.state !== "granted")
      throw new Error("Enable location access to share your GPS position.");
  }
  owner = nextOwner;
  sessionId = nextSession;
  if (watch === null)
    watch = navigator.geolocation.watchPosition(
      (position) => {
        if (!owner) return;
        const { coords } = position;
        api
          .post("tracking/location/", {
            session_id: sessionId,
            latitude: coords.latitude,
            longitude: coords.longitude,
            accuracy: coords.accuracy,
            heading: coords.heading,
            speed: coords.speed,
            recorded_at: new Date(position.timestamp).toISOString(),
          })
          .catch(() => {});
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 5000 },
    );
  return { owner, sessionId, mode: "foreground" };
}
