import { useEffect, useState } from "react";
import { Platform, Text, View } from "react-native";
import * as FileSystem from "expo-file-system";
import { useVideoPlayer, VideoView } from "expo-video";
import { api } from "../api/client";
import { requireSupabase, supabaseUrl, edgeFunctionName } from "../api/supabase";
import { Button, Input, Screen } from "../components/ui";
import { Header, Notice, PAPER, s } from "../components/reference";
import { SessionRecipes } from "../components/SessionRecipes";
import { titleCase } from "../utils/format";
import { Expandable, Segments } from "../components/interactive";
import { ServiceMap } from "../components/ServiceMap";
import { useLiveLocations } from "../location/useLiveLocations";

export function ArrivalDishes({ id, chef = false, onChanged }) {
  const [data, setData] = useState(null), [draft, setDraft] = useState({}), [reviewed, setReviewed] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  async function load() { const { data: result } = await api.get(`sessions/${id}/dishes/`); setData(result); }
  useEffect(() => { load().catch((e) => setError(e.message)); const timer = setInterval(() => load().catch(() => {}), 10000); return () => clearInterval(timer); }, [id]);
  async function save(action) {
    setBusy(true); setError("");
    try {
      const recipes = Object.fromEntries((data.meals || []).map((meal) => [meal, {
        title: draft[meal]?.title || "", servings: data.people_count, cooking_minutes: 60,
        ingredients: (draft[meal]?.ingredients || "").split("\n").map((v) => v.trim()).filter(Boolean),
        steps: (draft[meal]?.steps || "").split("\n").map((v) => v.trim()).filter(Boolean), storage_notes: draft[meal]?.storage_notes || "",
      }]));
      const { data: result } = await api.post(`sessions/${id}/dishes/`, { action, version: data.version, recipes, restrictions_reviewed: reviewed });
      setData(result); setDraft({}); onChanged?.();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  const field = (meal, key, value) => setDraft((old) => ({ ...old, [meal]: { ...old[meal], [key]: value } }));
  return <View style={[s.card, { gap: 14 }]}>
    <Text style={s.subtitle}>Dishes agreed on arrival</Text>
    <Text style={s.muted}>Choose the dishes together. The customer confirms the saved recipes before sharing the start code.</Text>
    {error ? <Text style={s.error}>{error}</Text> : null}
    {data ? <>
      <Notice>Food and allergy notes: {data.food_notes}</Notice>
      {data.recipes ? <><SessionRecipes menu={{ recipes: data.recipes }} /><Text style={s.small}>Version {data.version} · {data.accepted ? "Customer confirmed" : "Waiting for customer confirmation"}</Text></> : null}
      {chef ? <>
        {(data.meals || []).map((meal) => <View key={meal} style={{ gap: 10 }}>
          <Text style={s.subtitle}>{titleCase(meal)} · {data.people_count} servings</Text>
          <Input label={`${titleCase(meal)} dish name`} value={draft[meal]?.title || ""} onChangeText={(v) => field(meal, "title", v)} maxLength={160} />
          <Input label="Ingredients and quantities (one per line)" multiline value={draft[meal]?.ingredients || ""} onChangeText={(v) => field(meal, "ingredients", v)} maxLength={5000} />
          <Input label="Cooking steps (one per line)" multiline value={draft[meal]?.steps || ""} onChangeText={(v) => field(meal, "steps", v)} maxLength={10000} />
          <Input label="Storage / serving notes" multiline value={draft[meal]?.storage_notes || ""} onChangeText={(v) => field(meal, "storage_notes", v)} maxLength={1000} />
        </View>)}
        <Button label={`${reviewed ? "✓ " : ""}Reviewed food restrictions with customer`} variant="outline" onPress={() => setReviewed(!reviewed)} />
        <Button label="Save agreed dishes for confirmation" disabled={!reviewed || !(data.meals || []).every((m) => draft[m]?.title?.trim() && draft[m]?.ingredients?.trim() && draft[m]?.steps?.trim())} loading={busy} onPress={() => save("save")} />
      </> : data.recipes && !data.accepted ? <Button label="I confirm these dishes & recipes" loading={busy} onPress={() => save("accept")} /> : null}
    </> : <Text style={s.muted}>Loading agreed dishes…</Text>}
  </View>;
}
function Playback({ uri }) {
  const player = useVideoPlayer(uri);
  return <VideoView player={player} style={{ width: "100%", height: 240 }} nativeControls allowsFullscreen />;
}
export function SessionScreen({ route, navigation }) {
  const { session: visit } = route.params, id = visit.id || visit.service_session_id;
  const [state, setState] = useState(null), [codes, setCodes] = useState(null), [error, setError] = useState("");
  const [reason, setReason] = useState(""), [busy, setBusy] = useState(false), [playback, setPlayback] = useState(null);
  const [tab, setTab] = useState("visit");
  const [followChef, setFollowChef] = useState(true), [clock, setClock] = useState(Date.now());
  const { data: tracking, error: trackingError } = useLiveLocations(id);
  useEffect(() => { const timer = setInterval(() => setClock(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const position = tracking?.location;
  const positionAge = position?.recorded_at ? Math.max(0, Math.floor((clock - Date.parse(position.recorded_at)) / 1000)) : null;
  const destination = tracking?.destination || ((codes?.latitude ?? visit.latitude) != null && (codes?.longitude ?? visit.longitude) != null ? { id: "kitchen-" + id, name: codes?.building_name || visit.building_name || "Your kitchen", latitude: codes?.latitude ?? visit.latitude, longitude: codes?.longitude ?? visit.longitude, kind: "home" } : null);
  async function load() {
    const [{ data }, { data: services }] = await Promise.all([api.get(`sessions/${id}/evidence/`), api.get("sessions/")]);
    setState(data); setCodes(services.rows.find((r) => r.id === id));
  }
  useEffect(() => { load().catch((e) => setError(e.message)); const timer = setInterval(() => load().catch(() => {}), 10000); return () => clearInterval(timer); }, [id]);
  useEffect(() => () => { if (playback) FileSystem.deleteAsync(playback, { idempotent: true }).catch(() => {}); }, [playback]);
  async function act(task) { setBusy(true); setError(""); try { await task(); await load(); } catch (e) { setError(e.message); } finally { setBusy(false); } }
  async function viewClip(clip) {
    if (Platform.OS === "web") throw new Error("Open the Chefos mobile app to view your private kitchen recording.");
    const { data } = await requireSupabase().auth.getSession();
    const uri = `${FileSystem.cacheDirectory}chefos-${data.session.user.id}-${clip.id}.mp4`;
    const download = await FileSystem.downloadAsync(`${supabaseUrl}/functions/v1/${edgeFunctionName("chefos-recordings")}?id=${encodeURIComponent(clip.id)}`, uri,
      { headers: { Authorization: `Bearer ${data.session.access_token}` } });
    if (download.status !== 200) { await FileSystem.deleteAsync(uri, { idempotent: true }); throw new Error("This recording is unavailable or its retention period ended."); }
    setPlayback(uri);
  }
  return <Screen background={PAPER} contentContainerStyle={{ padding: 22, gap: 18 }}>
    <Header title="Your cooking visit" onBack={() => navigation.goBack()} />
    {error ? <Text style={s.error}>{error}</Text> : null}
    <Text style={s.title}>{titleCase(state?.status || "Loading")}</Text>
    <Text style={s.muted}>{visit.chef_name || "Your chef"} · {visit.service_date || "Today"}</Text>
    <Segments label="Cooking visit view" value={tab} onChange={setTab} options={[{ value: "visit", label: "Visit", icon: "location-outline" }, { value: "recipes", label: "Menu", icon: "restaurant-outline" }, { value: "safety", label: "Safety", icon: "shield-checkmark-outline" }]} />
    {tab === "visit" ? <>
    <ServiceMap points={[...(destination ? [destination] : []), ...(position ? [{ ...position, is_live: positionAge < 30 }] : [])]} height={330} follow={followChef} onFollowChange={setFollowChef} />
    <View style={[s.card, { gap: 8 }]}><Text style={s.subtitle}>{positionAge !== null ? positionAge < 30 ? "● Chef location is live" : "Location update delayed" : tracking?.journey_started ? "Waiting for your chef’s GPS" : "Your chef will share their journey here"}</Text>
      {positionAge !== null ? <Text style={s.small}>Updated {positionAge < 60 ? `${positionAge}s` : `${Math.floor(positionAge / 60)}m`} ago{position.accuracy != null ? ` · GPS accuracy ±${Math.round(position.accuracy)} m` : ""}</Text> : null}
      {trackingError ? <Text style={s.small}>{trackingError}</Text> : null}
    </View>
    <Text style={s.subtitle}>{state?.arrived ? "Chef has arrived" : "Waiting for chef arrival"}</Text>
    {!state?.customer_consent ? <Button label="I consent to kitchen video recording" loading={busy} onPress={() => act(() => api.post(`sessions/${id}/evidence/`, { action: "customer_consent", consent: true }))} /> : null}
    <Text style={s.muted}>Chef identity: {state?.face_verified ? "Verified" : "Pending"}</Text>
    <Text style={s.muted}>Hygiene: {state?.hygiene_complete ? "Checklist completed" : "Pending"}</Text>
    <Text style={s.subtitle}>Recording: {state?.recording_active ? "Active · recent upload confirmed" : "No recent recording confirmation"}</Text>
    {visit.instant_request_id ? <ArrivalDishes id={id} onChanged={load} /> : null}
    {codes?.start_otp ? <View style={s.card}><Text style={s.subtitle}>Start code: {codes.start_otp}</Text><Text style={s.small}>Share when your chef is ready and you approve the dishes.</Text></View> : null}
    {codes?.end_otp ? <View style={s.card}><Text style={s.subtitle}>Completion code: {codes.end_otp}</Text><Text style={s.small}>Share after checking the completed cooking.</Text></View> : null}
    </> : null}
    {tab === "recipes" ? <SessionRecipes menu={state?.menu} /> : null}
    {tab === "safety" ? <>
    <Text style={s.muted}>Kitchen recording has no audio. Consent, identity, hygiene and your code are checked before cooking starts.</Text>
    <Text style={s.subtitle}>Your kitchen recordings</Text>
    <Text style={s.small}>Available for 14 days. An open complaint preserves retained footage during review.</Text>
    {(state?.clips || []).filter((c) => c.uploaded).map((clip) => <Button key={clip.id} label={`View ${new Date(clip.started_at).toLocaleTimeString()}`} variant="outline" loading={busy} onPress={() => act(() => viewClip(clip))} />)}
    {playback ? <><Playback uri={playback} /><Button label="Close recording" variant="outline" onPress={() => setPlayback(null)} /></> : null}
    </> : null}
    <Expandable title="Need a hand?" subtitle="Report an issue with this visit">
    <Input label="Report a problem with this visit" multiline maxLength={1000} value={reason} onChangeText={setReason} />
    <Button label="Open support complaint" disabled={reason.trim().length < 5} loading={busy} onPress={() => act(async () => { await api.post(`sessions/${id}/complaint/`, { reason }); setReason(""); })} />
    </Expandable>
  </Screen>;
}
