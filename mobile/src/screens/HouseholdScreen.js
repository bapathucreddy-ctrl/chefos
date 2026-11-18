import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { api } from "../api/client";
import { Screen, Input, Button } from "../components/ui";
import { Header, Chip, Notice, PAPER, s } from "../components/reference";
import { ServiceMap } from "../components/ServiceMap";
import { Expandable } from "../components/interactive";

export function HouseholdScreen({ route, navigation }) {
  const [data, setData] = useState(null), [building, setBuilding] = useState("");
  const [flat, setFlat] = useState(""), [code, setCode] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [mapBuildings, setMapBuildings] = useState([]);
  const chef = route.params?.chef;
  const next = () => chef ? navigation.replace("Booking", { chef }) : navigation.goBack();
  async function load() {
    setError(""); setBusy(true);
    try {
      const { data: result } = await api.get("household/"); setData(result);
      if (result.household) { setBuilding(result.household.building_id); setFlat(result.household.flat); }
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  useEffect(() => { load(); }, []);
  useEffect(() => { api.get("discovery/map/").then(({ data: result }) => setMapBuildings(result.buildings || [])).catch(() => {}); }, []);
  async function save() {
    setBusy(true); setError("");
    try {
      const { data: result } = await api.put("household/", { building_id: building, flat, code });
      setCode(""); setData(result); next();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  return <Screen background={PAPER} contentContainerStyle={{ padding: 22, gap: 24 }}>
    <Header title="Your home" onBack={() => navigation.goBack()} />
    <Text style={s.title}>Where are we cooking?</Text>
    <ServiceMap points={mapBuildings} selectedId={building} onSelect={setBuilding} height={300} />
    {error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : null}
    {!data ? <Button label={busy ? "Loading…" : "Load communities"} loading={busy} onPress={load} /> : <>
      <View style={{ gap: 10 }}>
        {data.buildings.map((b) => <Chip key={b.id} label={b.name} selected={building === b.id} onPress={() => setBuilding(b.id)} />)}
      </View>
      {!data.buildings.length ? <Notice>Chefos has not opened a community here yet. Your representative needs to add the launch building.</Notice> : <>
        <Input label="Flat / apartment number" value={flat} onChangeText={setFlat} maxLength={80} />
        {data.household?.verified && data.household.building_id === building && data.household.flat === flat ? <Text style={s.subtitle}>✓ Your home is verified</Text> : null}
        {data.household?.building_id === building && data.household?.flat === flat ?
          <Button label={chef ? "Continue to your plan" : "Use saved home"} onPress={next} /> : null}
        <Expandable title={data.household?.verified ? "Verify a different home" : "Verify this home"} subtitle="Use the code from your community representative" initialOpen={!data.household?.verified}>
          <Input label="Community verification code" value={code} onChangeText={setCode} secureTextEntry maxLength={100} />
          <Button label="Verify home" loading={busy} disabled={!building || !flat.trim() || !code} onPress={save} />
        </Expandable>
      </>}
    </>}
  </Screen>;
}
