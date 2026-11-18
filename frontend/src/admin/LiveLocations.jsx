import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { isTestEnvironment, supabase } from "../lib/supabase";

const chefIcon = L.divIcon({
  className: "ops-live-pin",
  html: "<span>C</span>",
  iconSize: [40, 40],
  iconAnchor: [20, 20],
});
function MapView({ points, selected, recenter }) {
  const map = useMap(),
    initialized = useRef(false);
  useEffect(() => {
    if (points.length && !initialized.current) {
      map.fitBounds(
        points.map((point) => [
          Number(point.latitude),
          Number(point.longitude),
        ]),
        { padding: [40, 40], maxZoom: 15 },
      );
      initialized.current = true;
    }
  }, [points, map]);
  useEffect(() => {
    if (points.length && recenter)
      map.fitBounds(
        points.map((point) => [
          Number(point.latitude),
          Number(point.longitude),
        ]),
        { padding: [40, 40], maxZoom: 15 },
      );
  }, [recenter, map]);
  useEffect(() => {
    if (selected)
      map.flyTo([Number(selected.latitude), Number(selected.longitude)], 16, {
        duration: 0.7,
      });
  }, [selected?.id, map]);
  return null;
}
export default function LiveLocations({ data }) {
  const [points, setPoints] = useState(data?.chefs || []),
    [selected, setSelected] = useState(null),
    [simulating, setSimulating] = useState(false),
    [error, setError] = useState(""),
    [recenter, setRecenter] = useState(0);
  useEffect(() => {
    setPoints(data?.chefs || []);
  }, [data]);
  useEffect(() => {
    let active = true;
    async function refresh() {
      const { data: result, error: failure } = await supabase.rpc(
        "chefos_discovery_map",
      );
      if (active) {
        if (failure) setError(failure.message);
        else setPoints(result.chefs || []);
      }
    }
    const channel = supabase
      .channel("ops-locations-" + (isTestEnvironment ? "test" : "production"))
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: isTestEnvironment
            ? "chefos_live_locations_test"
            : "chefos_live_locations",
        },
        () => refresh(),
      )
      .subscribe();
    const timer = setInterval(refresh, 15000);
    return () => {
      active = false;
      clearInterval(timer);
      supabase.removeChannel(channel);
    };
  }, []);
  useEffect(() => {
    if (!simulating) return;
    let busy = false,
      active = true;
    async function tick() {
      if (busy) return;
      busy = true;
      try {
        const { error: failure } = await supabase.rpc(
          "chefos_simulate_locations",
        );
        if (failure) throw failure;
        const { data: result, error: readError } = await supabase.rpc(
          "chefos_discovery_map",
        );
        if (readError) throw readError;
        if (active) {
          setPoints(result.chefs || []);
          setError("");
        }
      } catch (failure) {
        if (active) setError(failure.message);
      } finally {
        busy = false;
      }
    }
    tick();
    const timer = setInterval(tick, 5000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [simulating]);
  const chosen = points.find((point) => point.id === selected);
  return (
    <section className="ops-community-panel">
      <div className="ops-map-heading">
        <div>
          <h2>
            {isTestEnvironment ? "Test chef locations" : "Live chef locations"}
          </h2>
          <p>{points.length} chefs sharing locations</p>
        </div>
        <div className="ops-map-controls">
          <button
            className="ops-secondary"
            onClick={() => setRecenter((value) => value + 1)}
          >
            Fit all chefs
          </button>
          {isTestEnvironment ? (
            <button
              className="ops-primary"
              aria-pressed={simulating}
              onClick={() => setSimulating(!simulating)}
            >
              {simulating ? "Pause simulated movement" : "Simulate movement"}
            </button>
          ) : null}
        </div>
      </div>
      {error ? (
        <p className="ops-error" role="alert">
          {error}
        </p>
      ) : null}
      {isTestEnvironment ? (
        <p>
          Simulated chefs around Whitefield, Kodigehalli Road and KR Puram.
          Movement updates every five seconds while enabled.
        </p>
      ) : null}
      <div className="ops-community-grid">
        <div className="ops-community-map">
          <MapContainer
            center={[13.01, 77.72]}
            zoom={13}
            style={{ height: 520, width: "100%" }}
            scrollWheelZoom
          >
            <TileLayer
              url={
                import.meta.env.VITE_MAP_TILE_URL ||
                "https://tile.openstreetmap.org/{z}/{x}/{y}.png"
              }
              attribution={
                '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              }
            />
            <MapView points={points} selected={chosen} recenter={recenter} />
            {points.map((point) => (
              <Marker
                key={point.id}
                position={[Number(point.latitude), Number(point.longitude)]}
                icon={chefIcon}
                eventHandlers={{ click: () => setSelected(point.id) }}
              >
                <Popup>
                  <strong>{point.name}</strong>
                  <p>
                    {point.is_simulated
                      ? "Simulated test location"
                      : point.is_live
                        ? "GPS is live"
                        : "Waiting for fresh GPS"}
                  </p>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        </div>
        <div className="ops-building-list ops-live-list">
          {points.map((point) => (
            <button
              key={point.id}
              className={`ops-building-card ${selected === point.id ? "selected" : ""}`}
              onClick={() => setSelected(point.id)}
            >
              <span className="ops-building-symbol">C</span>
              <span>
                <strong>{point.name}</strong>
                <small>
                  {point.is_simulated
                    ? "Test simulation"
                    : point.is_live
                      ? "Live GPS"
                      : "GPS delayed"}
                </small>
              </span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
