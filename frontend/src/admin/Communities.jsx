import { useEffect, useState } from "react";
import L from "leaflet";
import { MapContainer, Marker, Popup, TileLayer, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { supabase } from "../lib/supabase";

const buildingIcon = L.divIcon({ className: "ops-building-pin", html: "<span>⌂</span>", iconSize: [42, 42], iconAnchor: [21, 42] });
const draftIcon = L.divIcon({ className: "ops-building-pin draft", html: "<span>+</span>", iconSize: [42, 42], iconAnchor: [21, 42] });
function MapPicker({ enabled, onPick, selected }) {
  const map = useMapEvents({ click(event) { if (enabled) onPick(event.latlng); } });
  useEffect(() => { if (selected) map.flyTo([Number(selected.latitude), Number(selected.longitude)], 15, { duration: 0.5 }); }, [selected, map]);
  return null;
}

export default function Communities({ data, onSaved }) {
  const [name, setName] = useState(""), [latitude, setLatitude] = useState(""), [longitude, setLongitude] = useState("");
  const [code, setCode] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [adding, setAdding] = useState(false), [selected, setSelected] = useState(null);
  const buildings = (data?.rows || []).filter((building) => building.latitude != null && building.longitude != null && Number.isFinite(Number(building.latitude)) && Number.isFinite(Number(building.longitude)));
  const center = buildings.length ? [Number(buildings[0].latitude), Number(buildings[0].longitude)] : [12.9716, 77.5946];
  const hasPin = latitude !== "" && longitude !== "" && Number.isFinite(Number(latitude)) && Number.isFinite(Number(longitude)) && Math.abs(Number(latitude)) <= 90 && Math.abs(Number(longitude)) <= 180;
  async function save(event) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const { error: failure } = await supabase.rpc("chefos_ops_building", { p_name: name, p_lat: Number(latitude), p_lng: Number(longitude), p_code: code });
      if (failure) throw failure;
      setName(""); setLatitude(""); setLongitude(""); setCode(""); setAdding(false); onSaved();
    } catch (failure) { setError(failure.message); } finally { setBusy(false); }
  }
  return <section className="ops-community-panel">
    <div className="ops-map-heading"><div><h2>Your service neighbourhoods</h2><p>{buildings.length} buildings · {buildings.reduce((total, building) => total + Number(building.households || 0), 0)} verified homes</p></div>
      <button className="ops-primary" onClick={() => setAdding(!adding)}>{adding ? "Close building setup" : "+ Add a building"}</button></div>
    <div className="ops-community-grid"><div className="ops-community-map">
      <MapContainer center={center} zoom={13} scrollWheelZoom style={{ height: 480, width: "100%" }}>
        <TileLayer url={import.meta.env.VITE_MAP_TILE_URL || "https://tile.openstreetmap.org/{z}/{x}/{y}.png"} attribution={'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'} />
        <MapPicker enabled={adding} selected={buildings.find((building) => building.id === selected)} onPick={({ lat, lng }) => { setLatitude(lat.toFixed(6)); setLongitude(lng.toFixed(6)); }} />
        {buildings.map((building) => <Marker key={building.id} position={[Number(building.latitude), Number(building.longitude)]} icon={buildingIcon} eventHandlers={{ click: () => setSelected(building.id) }}>
          <Popup><strong>{building.name}</strong><p>{building.households} verified homes</p></Popup>
        </Marker>)}
        {adding && hasPin ? <Marker position={[Number(latitude), Number(longitude)]} icon={draftIcon} draggable eventHandlers={{ dragend: (event) => { const point = event.target.getLatLng(); setLatitude(point.lat.toFixed(6)); setLongitude(point.lng.toFixed(6)); } }} /> : null}
      </MapContainer>
      {adding ? <div className="ops-map-hint">Tap the map to place the building. Drag the gold pin to adjust.</div> : null}
    </div><div className="ops-building-list">
      {buildings.map((building) => <button key={building.id} className={`ops-building-card ${selected === building.id ? "selected" : ""}`} onClick={() => setSelected(building.id)}>
        <span className="ops-building-symbol">⌂</span><span><strong>{building.name}</strong><small>{building.households} verified homes</small></span><span>↗</span>
      </button>)}
      {!buildings.length ? <p>Add your first building by placing its pin on the map.</p> : null}
      {selected ? <p className="ops-map-selection">Selected {buildings.find((building) => building.id === selected)?.name}</p> : null}
    </div></div>
    {adding ? <form onSubmit={save} className="ops-community-form">
      <h2>New service building</h2>
      {error ? <div className="ops-error" role="alert">{error}</div> : null}
      <label>Building name<input required minLength={2} maxLength={120} value={name} onChange={(event) => setName(event.target.value)} /></label>
      <label>Community code (at least 12 characters)<input required type="password" autoComplete="new-password" minLength={12} maxLength={100} value={code} onChange={(event) => setCode(event.target.value)} /></label>
      <details><summary>{hasPin ? "Edit pin coordinates" : "Or enter coordinates"}</summary>
        <label>Latitude<input required type="number" step="any" min={-90} max={90} value={latitude} onChange={(event) => setLatitude(event.target.value)} /></label>
        <label>Longitude<input required type="number" step="any" min={-180} max={180} value={longitude} onChange={(event) => setLongitude(event.target.value)} /></label>
      </details>
      <p>Share the community code privately with residents.</p>
      <button className="ops-primary" disabled={busy || !hasPin}>{busy ? "Saving…" : "Launch this building"}</button>
    </form> : null}
  </section>;
}
