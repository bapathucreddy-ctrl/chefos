import { useEffect, useRef, useState } from "react";
import { AppState, Linking, Platform, Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useKeepAwake } from "expo-keep-awake";
import * as Location from "expo-location";
import * as Crypto from "expo-crypto";
import { api } from "../api/client";
import { pendingSegments, retainSegment, uploadPending } from "../api/recordingQueue";
import { useAuth } from "../auth/AuthContext";
import { Button, Input, Screen } from "../components/ui";
import { Header, Notice, PAPER, s } from "../components/reference";
import { SessionRecipes } from "../components/SessionRecipes";
import { ArrivalDishes } from "./SessionScreen";
import { titleCase } from "../utils/format";
import { Expandable } from "../components/interactive";
import { ServiceMap } from "../components/ServiceMap";
import { startChefTracking, stopChefTracking } from "../location/chefTracking";

function Awake() { useKeepAwake(); return null; }
export function ChefCookingScreen({ route, navigation }) {
  const id = route.params.session.id, { session: auth } = useAuth(), owner = auth.user.id;
  const camera = useRef(null), running = useRef(false), recording = useRef(false), loop = useRef(null);
  const captureToken = useRef(null), mounted = useRef(true), serverOffset = useRef(0), saving = useRef(false);
  const [permission, requestPermission] = useCameraPermissions();
  const [state, setState] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [code, setCode] = useState(""), [cameraReady, setCameraReady] = useState(false), [capturing, setCapturing] = useState(false);
  const [pending, setPending] = useState(0), [uploadNote, setUploadNote] = useState("");
  const [hygiene, setHygiene] = useState({ hand_wash: false, gloves: false, apron: false, cap: false });
  const evidence = (action, data = {}) => api.post(`sessions/${id}/evidence/`, { ...data, action });
  function showError(e) { if (mounted.current) setError(e.message); }
  async function load() {
    const { data } = await api.get(`sessions/${id}/evidence/`);
    if (mounted.current) setState(data);
    return data;
  }
  async function sync() {
    try { await uploadPending(owner); if (mounted.current) setUploadNote(""); }
    catch (e) { if (mounted.current) setUploadNote(e.message); }
    finally { if (mounted.current) setPending((await pendingSegments(owner)).length); }
  }
  async function act(task) {
    setBusy(true); setError("");
    try { await task(); await load(); } catch (e) { showError(e); } finally { if (mounted.current) setBusy(false); }
  }
  async function stop() {
    running.current = false;
    camera.current?.stopRecording();
    const token = captureToken.current;
    // Ending immediately makes a backgrounded camera pause the server session.
    // Finished segments are still retained and uploaded by their original run.
    if (token) await evidence("capture_end", { capture_token: token }).catch(showError);
    if (loop.current) await loop.current;
    captureToken.current = null;
    if (mounted.current) { setCapturing(false); setCameraReady(false); await load().catch(showError); }
  }
  async function start() {
    if (running.current || saving.current) return;
    setError(""); setBusy(true);
    try {
      if (Platform.OS === "web") throw new Error("Use the Chefos Partner Android or iOS app for kitchen recording.");
      const granted = permission?.granted || (await requestPermission()).granted;
      if (!granted) throw new Error("Camera permission is required to record the kitchen.");
      const { data } = await evidence("capture_begin");
      captureToken.current = data.capture_token;
      serverOffset.current = Date.parse(data.server_time) - Date.now();
      running.current = true; setState(data); setCapturing(true);
    } catch (e) { showError(e); } finally { setBusy(false); }
  }
  useEffect(() => {
    if (!cameraReady || !capturing || !running.current || loop.current) return;
    const token = captureToken.current;
    loop.current = (async () => {
      let first = true;
      try {
        while (running.current && captureToken.current === token) {
          const started = new Date(Date.now() + serverOffset.current).toISOString();
          recording.current = true;
          const result = await camera.current.recordAsync({ maxDuration: first ? 15 : 60, maxFileSize: 14 * 1024 * 1024 });
          recording.current = false; saving.current = true;
          const ended = new Date(Date.now() + serverOffset.current).toISOString();
          if (!result?.uri) throw new Error("The camera did not save a video. Restart recording before cooking.");
          await retainSegment(owner, { id: Crypto.randomUUID(), capture_token: token, started_at: started, ended_at: ended }, result.uri);
          saving.current = false; first = false;
          // Upload in parallel with the next segment; footage stays on disk if offline.
          sync().catch(showError);
        }
      } catch (e) {
        running.current = false; showError(e);
        await evidence("capture_end", { capture_token: token }).catch(showError);
      } finally {
        recording.current = false; saving.current = false; loop.current = null;
        if (mounted.current) { setCapturing(false); setCameraReady(false); }
      }
    })();
  }, [cameraReady, capturing]);
  useEffect(() => {
    mounted.current = true; load().catch(showError); sync().catch(showError);
    const heartbeat = setInterval(() => {
      if (running.current && recording.current && captureToken.current) evidence("heartbeat", { capture_token: captureToken.current }).catch(showError);
      load().catch(showError);
    }, 10000);
    const retry = setInterval(() => sync().catch(showError), 20000);
    const app = AppState.addEventListener("change", (next) => {
      if (next !== "active" && running.current) stop().catch(showError);
      if (next === "active") { load().catch(showError); sync().catch(showError); }
    });
    const back = navigation.addListener("beforeRemove", (event) => {
      if (running.current || saving.current || loop.current) { event.preventDefault(); setError("Stop the camera and wait for the current segment to save before leaving."); }
    });
    const focus = navigation.addListener("focus", () => load().catch(showError));
    return () => {
      mounted.current = false; clearInterval(heartbeat); clearInterval(retry); app.remove(); back(); focus();
      if (running.current) stop().catch(() => {});
    };
  }, [id, owner]);
  async function arrived() {
    const result = await Location.requestForegroundPermissionsAsync();
    if (!result.granted) throw new Error("Allow location access to confirm arrival.");
    const { coords } = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    await evidence("arrived", { latitude: coords.latitude, longitude: coords.longitude });
  }
  async function face() {
    navigation.navigate("ChefSelfie", { sessionId: id });
  }
  const service = (action) => act(async () => {
    await api.post(`chefs/partner/service/${id}/${action}/`, { otp: code });
    if (action === "journey") await startChefTracking(owner, id);
    if (action === "end-verify") await stopChefTracking();
    setCode("");
  });
  return <Screen background={PAPER} contentContainerStyle={{ padding: 22, gap: 18 }}>
    <Header title="Cooking visit" onBack={() => navigation.goBack()} />
    <Text style={s.title}>{titleCase(state?.status || "Loading")}</Text>
    <Text style={s.subtitle}>{route.params.session.building_name || "Assigned home"}{route.params.session.flat ? ` · Flat ${route.params.session.flat}` : ""}</Text>
    <View style={{ flexDirection: "row", gap: 6 }}>{[
      ["Arrive", state?.arrived], ["Identity", state?.face_verified], ["Hygiene", state?.hygiene_complete], ["Cook", ["started", "end_otp", "completed"].includes(state?.status)],
    ].map(([label, done]) => <View key={label} style={{ flex: 1, alignItems: "center", gap: 8, padding: 10, borderRadius: 16, backgroundColor: done ? "#e9f2e6" : "#eeefeb" }}><Ionicons name={done ? "checkmark-circle" : "ellipse-outline"} size={21} color={done ? "#28754f" : "#87928c"} /><Text style={s.small}>{label}</Text></View>)}</View>
    {!state?.arrived && route.params.session.latitude != null && route.params.session.longitude != null ? <ServiceMap points={[{ id, name: route.params.session.building_name || "Assigned kitchen", latitude: route.params.session.latitude, longitude: route.params.session.longitude, kind: "home" }]} height={230} /> : null}
    {route.params.session.latitude != null && route.params.session.longitude != null ? <>
      <Button label="Start journey" variant="outline" loading={busy} onPress={() => service("journey")} />
      <Button label="Navigate to the building" variant="outline" onPress={() => Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${route.params.session.latitude},${route.params.session.longitude}`).catch(showError)} />
    </> : null}
    {error ? <Text style={s.error} accessibilityRole="alert">{error}</Text> : null}
    <Expandable title="Kitchen camera setup" subtitle="Steady phone · no audio"><Text style={s.muted}>Keep the phone steady, plugged in when possible, and this screen open. Backgrounding pauses cooking.</Text></Expandable>
    {!state?.arrived ? <Button label="I have arrived" loading={busy} onPress={() => act(arrived)} /> : <Text style={s.subtitle}>Arrival confirmed</Text>}
    <Text style={s.muted}>Customer recording consent: {state?.customer_consent ? "Confirmed" : "Waiting for customer"}</Text>
    {!state?.chef_consent ? <Button label="I consent to kitchen video recording" loading={busy} onPress={() => act(() => evidence("chef_consent", { consent: true }))} /> : null}
    {!state?.face_verified ? <Button label="Verify my face & liveness" disabled={!state?.arrived || !state?.customer_consent || !state?.chef_consent} loading={busy} onPress={() => act(face)} /> : <Text style={s.subtitle}>Chef identity verified</Text>}
    {capturing ? <>
      <Awake />
      <CameraView ref={camera} mode="video" facing="back" mute videoQuality="480p" videoBitrate={700000}
        style={{ height: 200, borderRadius: 18 }} onCameraReady={() => setCameraReady(true)}
        onMountError={(e) => { setError(e.message); stop().catch(showError); }} />
      <Text style={s.subtitle}>{state?.recording_active ? "Recording · recent segment secured" : "Camera running · waiting for upload confirmation"}</Text>
      <Button label="Stop camera & pause cooking" variant="outline" onPress={() => act(stop)} />
    </> : state?.status !== "completed" && state?.face_verified ? <Button label="Start kitchen camera" loading={busy} onPress={start} /> : null}
    <Text style={s.small}>{pending} saved segment(s) waiting to upload</Text>
    {uploadNote ? <Notice>{uploadNote}</Notice> : null}
    {pending ? <Button label="Retry saved uploads" variant="outline" onPress={() => act(sync)} /> : null}
    {!state?.hygiene_complete && state?.face_verified ? <View style={[s.card, { gap: 14 }]}>
      <Text style={s.subtitle}>Hygiene check</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>{Object.entries({ hand_wash: "Hands washed", gloves: "Gloves on", apron: "Apron on", cap: "Hair cap on" }).map(([key, label]) => <Pressable key={key}
        accessibilityRole="checkbox" accessibilityLabel={label} accessibilityState={{ checked: hygiene[key] }} onPress={() => setHygiene((value) => ({ ...value, [key]: !value[key] }))}
        style={{ width: "48%", borderRadius: 16, padding: 18, gap: 10, backgroundColor: hygiene[key] ? "#fff0cc" : "#f1f2ee" }}><Ionicons name={hygiene[key] ? "checkmark-circle" : "ellipse-outline"} size={25} color="#14213D" /><Text style={s.small}>{label}</Text></Pressable>)}</View>
      <Button label="Confirm hygiene checks" loading={busy} disabled={!Object.values(hygiene).every(Boolean)} onPress={() => act(() => evidence("hygiene", hygiene))} />
    </View> : null}
    {route.params.session.instant_request_id ? <ArrivalDishes id={id} chef onChanged={() => load().catch(showError)} /> : null}
    <Expandable key={state?.status || "loading"} title="Today’s menu & recipes" initialOpen={["started", "end_otp"].includes(state?.status)}><SessionRecipes menu={state?.menu} /></Expandable>
    {state?.menu?.needs_review ? <Button label="I reviewed the allergy notes & recipes" loading={busy} onPress={() => act(() => evidence("review_menu", { version: state.menu.version }))} /> : null}
    {["assigned", "paused"].includes(state?.status) ? <Button label={state.status === "paused" ? "Request resume code" : "Request cooking start code"} loading={busy} onPress={() => service("start-otp")} /> : null}
    {["start_otp", "end_otp"].includes(state?.status) ? <>
      <Input label="Six digit code from customer" keyboardType="number-pad" value={code} maxLength={6} onChangeText={(v) => setCode(v.replace(/\D/g, ""))} />
      <Button label={state.status === "start_otp" ? "Confirm cooking start" : "Confirm cooking complete"} loading={busy} disabled={!/^\d{6}$/.test(code)} onPress={() => service(state.status === "start_otp" ? "start-verify" : "end-verify")} />
    </> : null}
    {state?.status === "started" ? <Button label="Request completion code" loading={busy} onPress={() => service("end-otp")} /> : null}
    {state?.status === "completed" && capturing ? <Button label="Finish recording" onPress={() => act(stop)} /> : null}
    <Button label="Refresh visit" variant="outline" onPress={() => act(load)} />
  </Screen>;
}
